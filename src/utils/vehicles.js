// A driver can park more than one car (their own, a lease car). The profile's
// plate stays the main vehicle: it is what registration collects and what the
// server's profiles.plate column holds. Every vehicle, with an optional label,
// is kept in settings.vehicles, which syncs inside the settings jsonb — so no
// schema change is needed.

// All vehicles, main one first. Reconciled against the profile every time, so
// a plate changed elsewhere (registration, a server pull) can't fall off.
export function vehicleList(profile, settings) {
  if (!profile?.plate) return []
  const stored = settings?.vehicles || []
  const main = stored.find(v => v.plate === profile.plate) || { plate: profile.plate, label: '' }
  return [main, ...stored.filter(v => v.plate !== profile.plate)]
}

// The vehicle to preselect when starting: the last one used, if still listed.
export function defaultPlate(profile, settings) {
  const list = vehicleList(profile, settings)
  return list.find(v => v.plate === settings?.lastPlate)?.plate ?? list[0]?.plate ?? null
}
