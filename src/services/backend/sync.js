// Supabase sync layer. localStorage stays the synchronous source of truth;
// these helpers mirror changes to Supabase in the background. Every push is
// fire-and-forget and no-ops when the backend is off or nobody is signed in,
// so features never wait on (or break because of) the network.
import { supabase, backendEnabled } from './supabase'
import * as local from '../../utils/storage'

async function userId() {
  if (!backendEnabled) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id ?? null
}

// Sync errors must be visible in the app — a console.warn is invisible on a
// phone (learned the hard way: missing table grants failed every push
// silently). Subscribers (the banner in App.jsx) get the message; a
// successful push clears it via onSyncOk.
const errorListeners = new Set()
const okListeners = new Set()

export function onSyncError(fn) {
  errorListeners.add(fn)
  return () => errorListeners.delete(fn)
}

export function onSyncOk(fn) {
  okListeners.add(fn)
  return () => okListeners.delete(fn)
}

function warn(what, error) {
  if (error) {
    console.warn(`[sync] ${what} mislukt:`, error.message)
    errorListeners.forEach(fn => fn(`${what} mislukt: ${error.message}`))
  } else {
    okListeners.forEach(fn => fn())
  }
}

export async function pushProfile(profile) {
  const id = await userId()
  if (!id || !profile) return
  const { error } = await supabase.from('profiles').upsert({
    id,
    name: profile.name,
    plate: profile.plate,
    email: profile.email ?? null,
    updated_at: new Date().toISOString(),
  })
  warn('profiel opslaan', error)
}

export async function pushSettings(settings) {
  const id = await userId()
  if (!id) return
  const { error } = await supabase
    .from('profiles')
    .upsert({ id, settings, updated_at: new Date().toISOString() })
  warn('instellingen opslaan', error)
}

export async function pushActive(session) {
  const id = await userId()
  if (!id) return
  const { error } = await supabase
    .from('profiles')
    .upsert({ id, active_session: session, updated_at: new Date().toISOString() })
  warn('actieve sessie opslaan', error)
}

export async function pushSession(session) {
  const id = await userId()
  if (!id || !session) return
  const { error } = await supabase
    .from('sessions')
    .upsert({ user_id: id, id: session.id, data: session })
  warn('sessie opslaan', error)
}

// After registration: seed the server with whatever this device already has
// (covers guest-mode history that predates the account). Callers are
// responsible for having cleared anything the account declined to adopt —
// see hasUnclaimedParkingData() at the registration screen.
export async function pushAll() {
  const id = await userId()
  if (id) local.setOwner(id)
  await pushProfile(local.getProfile())
  await pushSettings(local.getSettings())
  await pushActive(local.getActiveSession())
  for (const s of local.getSessions()) await pushSession(s)
}

// After login (and on app start while signed in): the profile comes from the
// server, sessions are merged both ways (see below). Writes via utils/storage
// directly so nothing echoes back up.
//
// `adopt` decides what happens to local data this account has never claimed.
// Merging it blindly is how a guest's plate and parking locations end up in the
// next account that signs in on a shared phone, so the login screen asks first
// and passes the answer through. A background refresh for an already-signed-in
// session passes adopt: true — that data was produced by this very session.
export async function pullAll({ adopt = false } = {}) {
  const id = await userId()
  if (!id) return false

  // Keep local data only when this account already owns it, or when the user
  // has just said the unclaimed data is theirs. Everything else goes: it
  // belongs to whoever used the device before, and it must not reach either
  // this device's view of the account or the account's rows on the server.
  const owner = local.getOwner()
  if (!(owner === id || (!owner && adopt))) local.clearAllData()
  local.setOwner(id)

  const [{ data: prof, error: pErr }, { data: rows, error: sErr }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
    supabase.from('sessions').select('data').eq('user_id', id)
      .order('id', { ascending: false }).limit(local.MAX_SESSIONS),
  ])
  warn('profiel ophalen', pErr)
  warn('sessies ophalen', sErr)
  if (pErr || sErr) return false

  if (prof) {
    const profile = { name: prof.name, plate: prof.plate }
    if (prof.email) profile.email = prof.email
    local.saveProfile(profile)
    if (prof.settings) local.saveSettings(prof.settings)
    if (prof.active_session) local.setActiveSession(prof.active_session)
    else local.clearActiveSession()
  }
  if (rows) {
    // Merge in plaats van overschrijven: sessies die alleen lokaal bestaan
    // (mislukte push, offline geparkeerd) alsnog naar de server sturen —
    // anders blijven ze eeuwig achter op het device tot een logout ze wist.
    const server = rows.map(r => r.data)
    const serverIds = new Set(server.map(s => s.id))
    const localOnly = local.getSessions().filter(s => s.id && !serverIds.has(s.id))
    const merged = [...localOnly, ...server].sort((a, b) => b.id - a.id).slice(0, local.MAX_SESSIONS)
    local.replaceSessions(merged)
    for (const s of localOnly) await pushSession(s)
  }
  return !!prof
}

// GDPR erasure: the delete_user() RPC (security definer, see supabase/schema.sql)
// removes the auth user; profiles + sessions cascade. Local data is cleared by
// the caller. Throws on failure so the UI can tell the user erasure did NOT happen.
export async function deleteAccount() {
  const id = await userId()
  if (!id) return
  const { error } = await supabase.rpc('delete_user')
  if (error) throw error
  await supabase.auth.signOut()
}

export async function logout() {
  if (!backendEnabled) return
  const { error } = await supabase.auth.signOut()
  warn('uitloggen', error)
}
