# Product

ParkMatiq is a Dutch parking-session app. The driver starts a session when they
park and stops it when they leave; the app works out what that stay actually
costs and keeps the receipt.

## What it does today

| Flow | Where | Notes |
| --- | --- | --- |
| Register / log in / reset password | `features/auth` | Real accounts via Supabase; guest mode still available |
| Find a spot, see the price first | `features/parking-session/Home` | Map with tariff zones, EV charge points, address search |
| Run a session | `features/parking-session/ActiveSession` | Live timer + live cost, reminders while it runs |
| Stop and get a receipt | `features/receipts` | Summary screen and a PDF with the amount, zone and basis |
| Look back | `features/parking-history` | Per-session cost, monthly spend against a budget, savings vs. a meter |
| Settings | `features/settings` | Plate, permit zones, budget, day maximum, data export, deletion |

## Principles the code holds to

- **Never invent a price.** If the tariff can't be resolved, the app says
  "tarief onbekend" and charges nothing. It never falls back to a guess.
- **Only bill the minutes actually parked**, and only when the zone is actually
  paid. That is the product's whole promise against a per-hour meter.
- **A session can't run away with the bill.** The municipal dagtarief, or the
  driver's own daily maximum, caps what a day can cost — and reminders nudge a
  session that is still running.
- **The driver can leave.** Data export and account deletion are both in
  Settings, and deletion really removes the server rows.

## Not built yet

- **Payment.** Real billing needs a licensed parking provider; the onboarding
  payment row is a placeholder.
- **Background auto start/stop.** Impossible in a web PWA — needs the Capacitor
  wrapper plus a background-geolocation plugin. Drive detection works today
  only while the app is open.
- **Live charge-point availability.** Open Charge Map has locations but no
  occupancy; live status means NDW's DOT-NL behind a credential proxy.
- **Holiday tariffs.** RDW's holiday and event windows are skipped, so a public
  holiday is billed at the normal weekday rate.
