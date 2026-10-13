const PROFILE_KEY = 'pw_profile'
const SESSIONS_KEY = 'pw_sessions'
const ACTIVE_KEY = 'pw_active'
const SETTINGS_KEY = 'pw_settings'
// Which account the data in this browser belongs to. Absent means nobody has
// claimed it: guest mode, or a build from before this stamp existed.
const OWNER_KEY = 'pw_owner'

const DEFAULT_SETTINGS = {
  location: true,
  theme: null,            // null = follow OS; 'light' | 'dark' = explicit
  onboardingDone: false,
  paymentConnected: false,
  bluetoothConnected: false,
  // Resident permits are issued per parking zone, not per postcode. Each entry
  // is { areaid, desc, municipality } as resolved from the RDW zone data.
  permitZones: [],
  showCharging: false,    // EV charge-point layer on the Home map
  monthlyBudget: '',      // empty = no budget set
  maxDailyCost: '',       // driver's own ceiling per day; empty = no ceiling
  endPreference: 'balanced',
  sessionPurpose: 'personal', // last choice on the start sheet: 'personal' | 'business'
  vehicles: [],           // [{ plate, label }] — see utils/vehicles.js
  lastPlate: null,        // vehicle preselected on the start sheet
}

// How many sessions we keep. Receipts are the reason: a driver claiming parking
// back needs last year's stay, not just last month's. localStorage holds a few
// MB and a session is well under a kilobyte, so this is comfortably within it.
export const MAX_SESSIONS = 500

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function getProfile() {
  return read(PROFILE_KEY, null)
}

export function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

export function getSessions() {
  return read(SESSIONS_KEY, [])
}

export function addSession(session) {
  const sessions = getSessions()
  sessions.unshift(session)
  if (sessions.length > MAX_SESSIONS) sessions.length = MAX_SESSIONS
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
}

// Used by the server sync after merging local and remote history. Kept here so
// the storage key stays private to this module.
export function replaceSessions(sessions) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)))
}

export function getActiveSession() {
  return read(ACTIVE_KEY, null)
}

export function setActiveSession(session) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(session))
}

export function clearActiveSession() {
  localStorage.removeItem(ACTIVE_KEY)
}

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) }
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  return next
}

export function getOwner() {
  return read(OWNER_KEY, null)
}

export function setOwner(id) {
  if (id) localStorage.setItem(OWNER_KEY, JSON.stringify(id))
  else localStorage.removeItem(OWNER_KEY)
}

// Data that no account has claimed. On a shared phone it may well be the
// previous user's, so the sign-in flow asks before folding it into an account
// instead of assuming the person signing in is the one who parked.
export function hasUnclaimedData() {
  return !getOwner() &&
    (!!getProfile() || getSessions().length > 0 || !!getActiveSession())
}

export function hasUnclaimedParkingData() {
  return !getOwner() && (getSessions().length > 0 || !!getActiveSession())
}

// Everything that says where a car stood and when: finished sessions plus one
// that is still running. Both carry a plate and coordinates, so both have to go
// when the account signing in says this data is not theirs. Profile and device
// preferences are left alone — the registration screen has just collected those
// from the person actually sitting there.
export function clearParkingData() {
  localStorage.removeItem(SESSIONS_KEY)
  localStorage.removeItem(ACTIVE_KEY)
}

export function clearAllData() {
  localStorage.removeItem(PROFILE_KEY)
  localStorage.removeItem(SESSIONS_KEY)
  localStorage.removeItem(ACTIVE_KEY)
  localStorage.removeItem(SETTINGS_KEY)
  localStorage.removeItem(OWNER_KEY)
}

// ── prompt log ───────────────────────────────────────────────────────────────
// One record per resolved prompt. Sessions cannot carry this: a start prompt
// the driver ignores produces no session at all, and a declined stop prompt
// leaves a session that is eventually stopped by hand. Without a log of its own
// the history screen could only ever report prompts that were acted on, which
// would make "acted on" a permanent 100%.
const PROMPTS_KEY = 'pw_prompts'
export const MAX_PROMPTS = 1000

export function getPrompts() {
  return read(PROMPTS_KEY, [])
}

export function logPrompt({ kind, acted }) {
  const prompts = getPrompts()
  prompts.unshift({ kind, acted: !!acted, at: new Date().toISOString() })
  if (prompts.length > MAX_PROMPTS) prompts.length = MAX_PROMPTS
  localStorage.setItem(PROMPTS_KEY, JSON.stringify(prompts))
}
