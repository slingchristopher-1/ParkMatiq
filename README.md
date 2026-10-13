# ParkMatiq

Slim parkeren — a Dutch parking-session PWA. Start and stop a parking session,
see an honest per-minute cost, keep your history, and download a receipt.

Stack: React 18 + Vite 5, react-leaflet (CARTO Voyager tiles), jsPDF, PWA via
`vite-plugin-pwa`, Supabase for auth and cross-device sync. State persists in
`localStorage` first and mirrors to the server in the background. Fonts are
bundled (`@fontsource`), not hotlinked from Google. Wrapped for Android/iOS with
Capacitor.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build to dist/
npm run preview    # serve the built app
```

## Project structure

The codebase is organised **by feature**, not by screen type. Each feature owns
its own pages, components, and hooks; anything shared sits in the top-level
`components/`, `hooks/`, and `utils/` folders; and every side effect (storage,
geolocation, notifications, tariffs, receipts) goes through a **service layer**.

```text
src/
├─ app/          App shell, providers, and router (route definitions)
├─ components/   Shared UI — common/ (buttons, badges, icons) and layout/ (nav)
├─ features/     One folder per feature, each with pages/ (+ components/, hooks/)
│  ├─ auth/            Login, Register
│  ├─ onboarding/      Onboarding
│  ├─ parking-session/ Home, ActiveSession, drive-detection hook
│  ├─ parking-history/ History
│  ├─ parking-zones/   Zone overlay component
│  ├─ receipts/        Summary
│  └─ settings/        Settings
├─ services/     Side-effect boundaries: storage, geolocation, notifications,
│                tariffs, receipts (features import these, never the utils)
├─ utils/        Pure helpers (plate, theme, map, zones, drive-detect) and the
│                current service implementations they delegate to
├─ data/         Bundled static data (parking-zones GeoJSON)
└─ styles/       Global CSS
```

### Service layer

Features never touch a browser API or a data source directly — they import from
`src/services/*`. Each service is a thin boundary that currently delegates to the
existing utility (e.g. `services/storage` → `utils/storage`). To swap an
implementation (a `localStorageAdapter` for a `supabaseAdapter` or `apiAdapter`),
you change only the service module; no feature code changes.

## Parking tariffs

`scripts/build-zones.py` turns the RDW open-data parking sets into
`src/data/nl-parking-zones.geojson`. A zone is not one price: it points at a
**weekly schedule** of `[weekday, startMinute, endMinute, €/hour]` windows
(shared in a top-level `schedules` map), plus a `dayCap` where the municipality
publishes a dagtarief. Outside every window parking is free, which is why an
evening or Sunday stay costs nothing.

Zones whose tariff cannot be resolved from RDW ship with `sched: null` and are
shown as "tarief onbekend" — never as free. Dropping them used to make whole
municipalities (Maastricht, Gouda, …) look like free parking.

`src/utils/tariff.js` is the only place that turns this into money:
`rateAt`, `costBetween` (bills only minutes inside paid windows, capped per
day), `paidUntil`/`nextPaidStart` for the UI. A session stores the windows and
cap it started under, so a later data refresh can't reprice it.

## Data & backend seam

**All persistence goes through a single boundary: [`src/services/storage/index.js`](src/services/storage/index.js),**
which today delegates to [`src/utils/storage.js`](src/utils/storage.js). No screen
reads or writes `localStorage` directly. This is the integration seam: to move to
a real backend (e.g. Supabase), reimplement the storage functions
(`getProfile`/`saveProfile`, `getSessions`/`addSession`,
`getActiveSession`/`setActiveSession`, `getSettings`/`saveSettings`,
`clearAllData`) behind that boundary. When those calls become network calls they
turn async, so the handful of call sites (Home, ActiveSession, History,
Settings, Onboarding) will need `await`; nothing else changes.

**Auth and sync are live** when `VITE_BACKEND=supabase`: real email/password
sign-up, sign-in, password reset and account deletion run against Supabase, and
`services/backend/sync.js` mirrors every mutation to the server so a second
device sees the same history. Without the env var the app runs fully local, and
"Doorgaan zonder account" keeps that path open even when the backend is on.

What still needs a provider to go live:

- **Payment** — the onboarding "Betaalmethode" row is a demo placeholder. Real
  billing in NL requires a licensed parking provider / national register.
- **Live tariffs** — parking zones are bundled statically
  (`src/data/nl-parking-zones.geojson`, refresh via `scripts/build-zones.py`).
  Point `src/utils/zones.js` at a live feed when ready.
- **Live charge-point availability** — the EV layer (Open Charge Map, needs
  `VITE_OCM_KEY`) shows locations and connectors only; OCM has no occupancy
  data. Live status means NDW's DOT-NL (OCPI 2.2.1, free but registered) behind
  a proxy that holds the credentials.
- **Background auto start/stop** — impossible in a web PWA; needs the native
  wrapper below plus a Capacitor background-geolocation plugin.

Config for a backend goes in a `.env` (Vite exposes `VITE_`-prefixed vars only);
see `.env.example`. Never commit real keys.

## Native (Android / iOS)

The web build is wrapped with [Capacitor](https://capacitorjs.com). Routing uses
`HashRouter`, which works from the `file://` origin a native shell serves.
Native geolocation and notifications plugins are installed
(`@capacitor/geolocation`, `@capacitor/local-notifications`).

One-time, per platform (needs Android Studio / Xcode installed locally):

```bash
npm run cap:add:android     # scaffolds android/ project
npm run cap:add:ios         # scaffolds ios/ project (macOS only)
```

Then to build/run after any web change:

```bash
npm run cap:android         # build web, sync, open Android Studio
npm run cap:ios             # build web, sync, open Xcode
```

App metadata lives in [`capacitor.config.json`](capacitor.config.json).
