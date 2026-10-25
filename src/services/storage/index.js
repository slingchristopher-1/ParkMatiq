// Persistence boundary.
//
// Feature code imports storage exclusively through this module. localStorage
// (utils/storage) remains the synchronous source of truth; when the Supabase
// backend is enabled (VITE_BACKEND=supabase) every mutation is also mirrored
// to the server in the background via the sync layer. Reads stay local and
// synchronous, so features are untouched either way.
import * as local from '../../utils/storage'
import { pushProfile, pushSettings, pushActive, pushSession } from '../backend/sync'

export const getProfile = local.getProfile
export const getSessions = local.getSessions
export const getActiveSession = local.getActiveSession
export const getSettings = local.getSettings
export const getOwner = local.getOwner
export const hasUnclaimedData = local.hasUnclaimedData
export const hasUnclaimedParkingData = local.hasUnclaimedParkingData
// Local wipe only (used at logout, and to drop data the signing-in account has
// declined to adopt); account/server erasure lives in sync.js. Deliberately not
// mirrored upward — the point is to discard rows, not to delete them serverside.
export const clearAllData = local.clearAllData
export const clearParkingData = local.clearParkingData

export function saveProfile(profile) {
  local.saveProfile(profile)
  pushProfile(profile)
}

export function addSession(session) {
  local.addSession(session)
  pushSession(session)
}

export function setActiveSession(session) {
  local.setActiveSession(session)
  pushActive(session)
}

export function clearActiveSession() {
  local.clearActiveSession()
  pushActive(null)
}

export function saveSettings(patch) {
  const next = local.saveSettings(patch)
  pushSettings(next)
  return next
}

// Prompt log. Local only: it is a record of what the app asked and what the
// driver answered, used by the history screen, not account data worth syncing.
export const getPrompts = local.getPrompts
export const logPrompt = local.logPrompt
export const markPromptActed = local.markPromptActed
