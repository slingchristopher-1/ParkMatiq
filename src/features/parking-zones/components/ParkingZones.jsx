import { GeoJSON, useMap, useMapEvents } from 'react-leaflet'
import { useEffect, useState, useCallback } from 'react'
import { loadZones, featureBBox } from '../../../utils/zones'

// Below this zoom the viewport spans too many zones to draw usefully, so we
// render nothing (the whole-country view would be thousands of polygons).
const MIN_ZOOM = 12

// Colour ramp by peak hourly tariff (EUR/hour). Higher = warmer.
function colorFor(eur) {
  if (eur == null)  return '#9AA3B8' // paid zone, tariff not resolvable
  if (eur <= 1)     return '#4ADE80' // cheap outer zones
  if (eur <= 2.5)   return '#FBBF24'
  if (eur <= 4)     return '#FB923C'
  return '#E5484D'                    // city-centre premium
}

function style(feature) {
  const eur = feature.properties.maxEurPerHour
  const c = colorFor(eur)
  return {
    color: c,
    weight: 2,
    fillColor: c,
    // Zones with an unresolved tariff are drawn fainter: they mark "check the
    // sign here", not a priced zone.
    fillOpacity: eur == null ? 0.18 : 0.35,
    opacity: eur == null ? 0.6 : 0.95,
    dashArray: eur == null ? '4 4' : undefined,
  }
}

// Built as DOM rather than as an HTML string. `desc` is RDW's areadesc, carried
// through scripts/build-zones.py unescaped, and the string form of bindPopup
// assigns to innerHTML — so an HTML string here is an injection sink pointed at
// a dataset we don't control and re-pull on every rebuild. Zone descriptions
// already contain `<` and `&` ("Binnenstad (<1 uur)", "Kiss&Ride"); textContent
// keeps a future one carrying markup from executing in our origin.
//
// The Navigeer destination is the spot the user tapped: that is inside the zone
// by definition, which a polygon's centre (outside an L-shaped zone) is not.
//
// "Parkeer hier" hands the same tapped spot to Home, which puts the pin there so
// the driver can check the zone before starting.
function bindZonePopup(feature, layer, onNavigate, onPark) {
  const { desc, maxEurPerHour } = feature.properties
  const price = maxEurPerHour
    ? `tot €${maxEurPerHour.toFixed(2).replace('.', ',')}/uur`
    : 'Tarief onbekend'

  const title = document.createElement('strong')
  title.textContent = desc

  const note = document.createElement('span')
  note.style.color = '#8B92A8'
  note.style.fontSize = '11px'
  note.textContent = 'Tarief indicatief · demo'

  const content = document.createElement('div')
  content.append(
    title,
    document.createElement('br'),
    price,
  )
  if (onPark) {
    const park = document.createElement('button')
    park.className = 'cp-nav-btn zone-park-btn'
    park.textContent = 'Parkeer hier'
    park.onclick = () => {
      const at = layer.getPopup().getLatLng()
      layer.closePopup()
      onPark([at.lat, at.lng])
    }
    content.append(park)
  }
  if (onNavigate) {
    const nav = document.createElement('button')
    nav.className = 'cp-nav-btn'
    nav.textContent = 'Navigeer'
    nav.onclick = () => {
      const at = layer.getPopup().getLatLng()
      layer.closePopup()
      onNavigate({ lat: at.lat, lon: at.lng, label: desc })
    }
    content.append(nav)
  } else {
    content.append(document.createElement('br'))
  }
  content.append(note)
  layer.bindPopup(content)
}

// Renders only the zones intersecting the current viewport, above a zoom
// threshold. With ~2.6k nationwide zones, drawing them all at once would choke
// Leaflet on a phone; a bbox filter keeps only the local handful on screen.
export default function ParkingZones({ onNavigate, onPark }) {
  const map = useMap()
  const [all, setAll] = useState(null)
  const [view, setView] = useState(null) // { fc, key }

  // Bundled static GeoJSON; fetched once (cached) and shared with the tariff
  // lookup. No external/RDW request at runtime.
  useEffect(() => { loadZones().then(setAll) }, [])

  const recompute = useCallback(() => {
    if (!all) return
    if (map.getZoom() < MIN_ZOOM) { setView(null); return }
    const b = map.getBounds().pad(0.25)
    const sw = b.getSouthWest(), ne = b.getNorthEast()
    const feats = all.features.filter(f => {
      const [minLon, minLat, maxLon, maxLat] = featureBBox(f)
      return !(maxLon < sw.lng || minLon > ne.lng || maxLat < sw.lat || minLat > ne.lat)
    })
    const c = map.getCenter()
    setView({
      fc: { type: 'FeatureCollection', features: feats },
      // react-leaflet's GeoJSON ignores data changes after mount, so re-key it
      // whenever the visible set moves to force a refresh.
      key: `${map.getZoom()}|${feats.length}|${c.lat.toFixed(3)},${c.lng.toFixed(3)}`,
    })
  }, [all, map])

  useEffect(() => { recompute() }, [recompute])
  // load/resize cover the first paint where the container sizes after mount.
  useMapEvents({ load: recompute, resize: recompute, moveend: recompute, zoomend: recompute })

  if (!view || !view.fc.features.length) return null
  return (
    <GeoJSON
      key={view.key}
      data={view.fc}
      style={style}
      onEachFeature={(f, layer) => bindZonePopup(f, layer, onNavigate, onPark)}
    />
  )
}
