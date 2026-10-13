# 0001 — Feature-based architecture

**Status:** Accepted (TASK-001)

## Context

The app was organised by screen (`src/screens/*`) with flat `components/` and
`utils/` folders. As the app grows and moves toward a real backend, this layout
scatters related code and blurs the line between UI and side effects.

## Decision

Restructure to a **feature-based** layout:

- `src/features/<feature>/` owns each feature's `pages/`, `components/`, `hooks/`.
- `src/app/` holds the application shell, providers, and router.
- `src/services/` introduces side-effect boundaries (storage, geolocation,
  notifications, tariffs, receipts). Features import services, never utils
  directly, so an implementation can be swapped (localStorage → Supabase → API)
  without touching feature code.
- Shared UI lives in `src/components/{common,layout}`; pure helpers stay in
  `src/utils`.

This is a **structural refactor only** — no behaviour, routing, UI, or config
changed. Services currently delegate to the existing utilities.

## Consequences

- Clearer ownership and easier navigation as features grow.
- A single, obvious place to introduce a backend adapter per concern.
- One-time churn in import paths (mechanical, verified by a passing build).
