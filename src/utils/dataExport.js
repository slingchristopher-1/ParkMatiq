import { getProfile, getSessions, getSettings } from './storage'

// AVG/GDPR data portability: everything the app holds about the driver, in a
// machine-readable file they can take elsewhere. Deletion already exists in
// Settings; this is the other half of the same right.
export function exportData() {
  const payload = {
    exported: new Date().toISOString(),
    app: 'ParkMatiq',
    profile: getProfile(),
    settings: getSettings(),
    sessions: getSessions(),
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `ParkMatiq_gegevens_${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)

  return payload.sessions.length
}
