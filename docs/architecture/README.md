# Architecture

ParkMatiq is a client-only React app. There is no server of our own: Supabase
provides auth and storage, and everything else runs in the browser.

See the root [README](../../README.md) for the folder layout and the
[decisions](../decisions) folder for why it is shaped that way.

## The three rules

1. **Features never touch a browser API or a data source directly.** They import
   from `src/services/*`, which is where storage, geolocation, notifications,
   tariffs, receipts and charging are bounded. Swapping an implementation means
   editing one service module.
2. **`localStorage` is the synchronous source of truth.** Screens read and write
   it without awaiting anything; `services/backend/sync.js` mirrors mutations to
   Supabase fire-and-forget. A failed sync surfaces in the banner in `App.jsx` —
   it never blocks the UI, and it never silently loses a session (`pullAll`
   merges local-only sessions up instead of overwriting them).
3. **Money is computed in exactly one place.** `utils/tariff.js` owns every
   euro: which window applies, what a stay costs, what the cap is. Screens
   format what it returns; they never do arithmetic on a rate.

## Data flow of a session

```text
Home                  rateForSession(lat, lon, permits)  ->  {tariff, rate, windows, dayCap}
  |                        reads the bundled zone GeoJSON via utils/zones
  v
setActiveSession()    session stores windows + dayCap as resolved at start
  |                        services/storage -> localStorage (+ sync to Supabase)
  v
ActiveSession         costOf(session) recomputed each tick from those windows
  |
  v
Summary / History     sessionCost(session) — the stored cost, or recomputed
                      from the windows for older records
```

Storing the windows on the session is deliberate: refreshing the RDW snapshot
must never change what a stay that already happened costs.

## State that lives outside React

- **Theme** — applied to `<html>` before first paint in `main.jsx` to avoid a
  flash; `utils/theme.js` owns it.
- **Zone data** — one cached `fetch` promise in `utils/zones.js`, shared by the
  map layer and the tariff lookup. It resolves to `null` on failure (never an
  empty list) so a load error reads as "unknown", not "free", and clears the
  cache so the next call retries.
- **App-wide hooks** — `useDriveDetection` and `useParkingReminder` are mounted
  once in `App.jsx`. Both are foreground-only by nature; the native wrapper is
  what will let them run with the app closed.
