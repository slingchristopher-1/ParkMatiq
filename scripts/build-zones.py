#!/usr/bin/env python3
"""
One-time build script: download all Dutch paid-parking zones from the free,
unmetered RDW Open Data portal and bundle them as a static GeoJSON.

Source: opendata.rdw.nl (Socrata) — open-licensed, no API key, no per-request charge.
Run manually to refresh the snapshot:  python scripts/build-zones.py

The app never calls RDW at runtime; it only reads the generated .geojson file.

Tariff model (SPDP):
  GEOMETRIE GEBIED (polygon)  --areaid-->  GEBIED REGELING (areaid -> regulationid)
  --regulationid-->  TIJDVAK (day/time window -> farecalculationcode)
  --farecalculationcode-->  TARIEFDEEL (amount per duration step => EUR/hour)

NB every id in these datasets (areaid, regulationid, farecalculationcode) is only
unique *within* an areamanagerid -- ids like "11" or "0" are reused by dozens of
municipalities. Every join below is therefore keyed on (areamanagerid, id);
joining on the bare id silently mixes another municipality's name and tariff
into a zone.

Output shape. Paid parking is a *weekly schedule*, not one number: most zones are
free in the evening and on Sunday, so a single representative rate overcharges
anyone parking outside paid hours. Each zone therefore points at a schedule of
[weekday, startMinute, endMinute, eurPerHour] windows (weekday 0 = Sunday, to
match JS getDay(); minutes since midnight). Schedules are shared by many zones,
so they live in a top-level `schedules` map and features carry only the key.

Zones whose tariff cannot be resolved are kept with `sched: null` instead of
being dropped: the app shows "tarief onbekend" for them. Dropping them made the
app claim free parking in whole municipalities (Maastricht files its polygons
and its paid-parking regulations under different areaid namespaces, so nothing
joins there at all).
"""
import json, urllib.request, urllib.parse, datetime, os, collections

BASE = "https://opendata.rdw.nl/resource/"
DATASETS = {
    "geometry":   "nsk3-v9n7",
    "regulation": "qtex-qwd8",
    "timeframe":  "ixf8-gtwq",
    "fare":       "534e-5vdg",
    "area":       "adw6-9hsg",
    "manager":    "2uc2-nnv3",
}
PAGE = 50000                 # Socrata max rows per request; larger sets are paged.
TODAY = datetime.date.today().strftime("%Y%m%d")
# RDW day labels we understand, mapped to JS getDay() numbering. The dataset also
# carries ~2500 special-day rows (FEESTDAG, KOOPZONDAG, VOETBAL1300, ...) that we
# skip: holidays would need an NL holiday calendar, and the event/late-shopping
# rows only ever *add* paid hours, so ignoring them never overcharges.
DAYS = {"ZONDAG": 0, "MAANDAG": 1, "DINSDAG": 2, "WOENSDAG": 3,
        "DONDERDAG": 4, "VRIJDAG": 5, "ZATERDAG": 6}
SAMPLE_MINUTES = 60          # stay length the indicative EUR/hour is derived from
DAY_MINUTES = 1440           # stay length the dagtarief (day cap) is derived from
# No Dutch street tariff comes near this. Anything above it is a day-ticket or
# progressive scheme encoded as if it were an hourly rate; charging it would be
# far worse than marking the zone's tariff unknown.
MAX_PLAUSIBLE_RATE = 15.0


def fetch(dataset, **params):
    """Page through a dataset (nationwide — no areamanagerid filter)."""
    rows, offset = [], 0
    while True:
        params["$limit"], params["$offset"] = PAGE, offset
        url = BASE + DATASETS[dataset] + ".json?" + urllib.parse.urlencode(params)
        with urllib.request.urlopen(url) as r:
            batch = json.load(r)
        rows.extend(batch)
        if len(batch) < PAGE:
            return rows
        offset += PAGE


def _nest(s, i=0):
    """Parse a parenthesised WKT body into nested lists; leaves are coordinate strings."""
    items = []
    while i < len(s):
        c = s[i]
        if c == "(":
            child, i = _nest(s, i + 1)
            items.append(child)
        elif c == ")":
            return items, i + 1
        elif c == ",":
            i += 1
        else:
            j = i
            while j < len(s) and s[j] not in "()":
                j += 1
            text = s[i:j].strip().rstrip(",").strip()
            if text:
                items.append(text)
            i = j
    return items, i


def _ring(node):
    # 6 decimals is ~0.1 m, far finer than any parking zone boundary needs, and
    # it keeps the bundled file (which the phone downloads once) about a third
    # smaller than RDW's 9-decimal source coordinates.
    text = node[0] if isinstance(node, list) else node
    return [[round(float(x), 6) for x in pt.split()] for pt in text.split(",") if pt.strip()]


def parse_wkt(wkt):
    """Parse WKT POLYGON / MULTIPOLYGON into GeoJSON geometry (lon lat order)."""
    wkt = (wkt or "").strip()
    if "(" not in wkt:
        return None
    start = wkt.index("(")
    tree, _ = _nest(wkt, start + 1)
    if wkt.startswith("MULTIPOLYGON"):
        return {"type": "MultiPolygon",
                "coordinates": [[_ring(r) for r in poly] for poly in tree]}
    if wkt.startswith("POLYGON"):
        return {"type": "Polygon", "coordinates": [_ring(r) for r in tree]}
    return None


def cost_for_stay(parts, minutes):
    """Cost of a stay of `minutes` under one fare code, in EUR.

    RDW splits a tariff into duration bands, each charging `amountfarepart` per
    `stepsizefarepart` minutes. Reading the first band as the hourly rate is
    wrong wherever a municipality encodes a start fee in a 0-1 minute band
    (EUR 0.30 for the first minute then read as EUR 18/hour); walking the bands
    handles start fees and progressive scales alike.

    Run out to a full day and this also yields the zone's dagtarief: a capped
    tariff is encoded as a trailing band charging EUR 0.00, so the total simply
    stops growing.
    """
    bands = []
    for p in parts:
        try:
            start, end = int(p["startdurationfarepart"]), int(p["enddurationfarepart"])
            amt, step = float(p["amountfarepart"]), float(p["stepsizefarepart"])
        except (KeyError, ValueError):
            continue
        if step > 0 and end > start:
            bands.append((start, end, amt, step))
    bands.sort()

    total, covered = 0.0, 0
    for start, end, amt, step in bands:
        lo, hi = max(start, covered), min(end, minutes)
        if hi <= lo:
            continue           # band already covered by an overlapping row
        total += (hi - lo) / step * amt
        covered = hi
        if covered >= minutes:
            break
    return round(total, 2)


def hhmm_to_minutes(value):
    """RDW writes times as HHMM-in-an-int ('930', '2400'); we want minutes."""
    v = int(value)
    return (v // 100) * 60 + v % 100


def windows_for(rows, rate_of, codes_used=None):
    """Weekly paid windows for one regulation: [day, startMin, endMin, rate].

    Free windows (rate 0) are simply left out — absence of a window means free.
    """
    out = []
    for r in rows:
        day = DAYS.get(r.get("daytimeframe"))
        code = r.get("farecalculationcode")
        if day is None or not code:
            continue
        rate = rate_of.get(code)
        if not rate:
            continue
        if codes_used is not None:
            codes_used.add(code)
        try:
            start = hhmm_to_minutes(r["starttimetimeframe"])
            end = hhmm_to_minutes(r["endtimetimeframe"])
        except (KeyError, ValueError):
            continue
        if end > start:
            out.append([day, start, end, rate])
        elif end < start:
            # Window runs past midnight (e.g. 18:00-02:00): split over two days.
            out.append([day, start, 1440, rate])
            out.append([(day + 1) % 7, 0, end, rate])
    out.sort()
    return out


def active(rows, end_field, key_fields, start_field):
    """Keep rows whose end date is in the future; if duplicates per key, keep latest start."""
    best = {}
    for r in rows:
        if r.get(end_field, "0")[:8] <= TODAY:
            continue
        k = tuple(r.get(f) for f in key_fields)
        if k not in best or r.get(start_field, "0") > best[k].get(start_field, "0"):
            best[k] = r
    return best


def main():
    print("Fetching all-NL parking data from RDW open data (one-time, paged)...")
    geometry   = fetch("geometry")
    regulation = fetch("regulation")
    timeframe  = fetch("timeframe")
    fare       = fetch("fare")
    areas      = fetch("area")
    managers   = fetch("manager")

    # (manager, areaid) -> active paid-parking regulationid
    reg = active([r for r in regulation if r.get("usageid") == "BETAALDP"],
                 "enddatearearegulation", ("areamanagerid", "areaid"),
                 "startdatearearegulation")
    area_to_reg = {k: v["regulationid"] for k, v in reg.items()}

    # manager -> { farecalculationcode: EUR/hour }, and the same for the most a
    # 24-hour stay can cost under that code (the dagtarief, where one exists).
    fare_parts = {}
    for r in fare:
        if r.get("enddatefarepart", "0")[:8] <= TODAY:
            continue
        fare_parts.setdefault((r.get("areamanagerid"), r["farecalculationcode"]), []).append(r)
    fare_rate, fare_day = collections.defaultdict(dict), collections.defaultdict(dict)
    for (mid, code), parts in fare_parts.items():
        fare_rate[mid][code] = cost_for_stay(parts, SAMPLE_MINUTES)
        fare_day[mid][code] = cost_for_stay(parts, DAY_MINUTES)

    # (manager, regulationid) -> weekly paid windows + the day cap that applies
    tf_rows = collections.defaultdict(list)
    for r in timeframe:
        if r.get("enddatetimeframe", "0")[:8] <= TODAY:
            continue
        tf_rows[(r.get("areamanagerid"), r.get("regulationid"))].append(r)
    schedule, day_cap = {}, {}
    for (mid, rid), rows in tf_rows.items():
        codes = set()
        w = windows_for(rows, fare_rate.get(mid, {}), codes)
        if not w:
            continue
        schedule[(mid, rid)] = w
        # Where a zone's windows use several fare codes, the highest cap is the
        # only one guaranteed not to under-bill a day spent across all of them.
        caps = [fare_day[mid][c] for c in codes if c in fare_day.get(mid, {})]
        day_cap[(mid, rid)] = max(caps) if caps else None

    # (manager, areaid) -> zone name, preferring a currently active area row.
    area_desc = {}
    for r in areas:
        key = (r.get("areamanagerid"), r.get("areaid"))
        live = r.get("enddatearea", "0")[:8] > TODAY
        if key not in area_desc or (live and not area_desc[key][1]):
            area_desc[key] = (r.get("areadesc", ""), live)
    area_desc = {k: v[0] for k, v in area_desc.items()}

    # areamanagerid -> municipality name. Managers are versioned; an id can carry
    # an expired row (merged municipalities), so prefer a currently active one.
    mgr_name = {}
    for r in managers:
        mid, name = r.get("areamanagerid"), r.get("areamanagerdesc", "")
        if not mid or not name:
            continue
        live = r.get("enddateareamanagerid", "0")[:8] > TODAY
        if mid not in mgr_name or (live and not mgr_name[mid][1]):
            mgr_name[mid] = (name, live)
    mgr_name = {k: v[0] for k, v in mgr_name.items()}

    polygons = [(g, parse_wkt(g.get("areageometryastext", ""))) for g in geometry]
    polygons = [(g, geom) for g, geom in polygons if geom]

    # Pass 1: resolve every polygon that has its own paid-parking regulation.
    # A zone can span several geometry rows under one areaid, so this is a list:
    # keying it by areaid would silently drop every extra part of a split zone.
    resolved, unpriced, implausible = [], [], []
    for g, geom in polygons:
        aid, mid = g["areaid"], g.get("areamanagerid")
        rid = area_to_reg.get((mid, aid))
        if not rid:
            continue                       # permit-only area, garage, P+R, umbrella
        w = schedule.get((mid, rid))
        if not w:
            unpriced.append((g, geom))     # paid zone, no usable tariff rows
            continue
        top = max(x[3] for x in w)
        if top > MAX_PLAUSIBLE_RATE:
            implausible.append((mgr_name.get(mid, mid), area_desc.get((mid, aid), aid), top))
            unpriced.append((g, geom))
            continue
        resolved.append((g, geom, (mid, rid), top))

    # Pass 2: municipalities that sell paid parking but produced no priced zone
    # at all. Their polygons and regulations live in different areaid namespaces,
    # so nothing joins and the app would report the whole city as free parking.
    # Publish their polygons with an unknown tariff instead.
    priced_mgrs = {g.get("areamanagerid") for g, _, _, _ in resolved}
    paid_mgrs = {mid for mid, _ in area_to_reg}
    gap_mgrs = paid_mgrs - priced_mgrs
    for g, geom in polygons:
        if g.get("areamanagerid") in gap_mgrs:
            unpriced.append((g, geom))

    # Only the schedules actually referenced are published, keyed by a short id.
    sched_id, schedules = {}, {}
    for _, _, key, _ in resolved:
        if key not in sched_id:
            sched_id[key] = f"s{len(sched_id)}"
            schedules[sched_id[key]] = schedule[key]

    def feature(g, geom, sched, top, cap):
        mid, aid = g.get("areamanagerid"), g["areaid"]
        return {
            "type": "Feature",
            "geometry": geom,
            "properties": {
                "areaid": aid,
                "areamanagerid": mid,
                "municipality": mgr_name.get(mid, ""),
                "desc": area_desc.get((mid, aid)) or f"Zone {aid}",
                "sched": sched,
                "maxEurPerHour": top,
                "dayCap": cap,
            },
        }

    # Unpriced zones first so the priced ones draw on top of any overlap.
    features = [feature(g, geom, None, None, None) for g, geom in unpriced]
    features += [feature(g, geom, sched_id[key], top, day_cap.get(key))
                 for g, geom, key, top in resolved]

    fc = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "RDW Open Data Parkeren (opendata.rdw.nl), all Dutch municipalities",
            "license": "open data, free to use",
            "generated": TODAY,
            "note": "Tarieven indicatief / demo - weekly paid windows per zone; "
                    "sched null = paid zone with an unresolved tariff",
        },
        "schedules": schedules,
        "features": features,
    }

    out = os.path.join(os.path.dirname(__file__), "..", "src", "data",
                       "nl-parking-zones.geojson")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(fc, f, ensure_ascii=False)

    priced_names = {mgr_name.get(m, m) for m in priced_mgrs}
    print(f"Polygon rows: {len(polygons)}")
    print(f"Wrote {len(features)} zones ({len(resolved)} priced, {len(unpriced)} tariff "
          f"unknown) across {len(priced_names)} priced municipalities "
          f"-> {os.path.normpath(out)}")
    print(f"{len(schedules)} distinct weekly schedules")
    if gap_mgrs:
        print("Paid parking but no priced zone (published as unknown): " +
              ", ".join(sorted(mgr_name.get(m, m) for m in gap_mgrs)))
    for mun, desc, rate in implausible:
        print(f"  implausible rate EUR {rate}/h -> tariff unknown: {mun} - {desc}")


if __name__ == "__main__":
    main()
