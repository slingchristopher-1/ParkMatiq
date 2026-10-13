import { formatEuro, zoneKey } from '../../../services/tariffs'

// Lets the driver name the zone when the fix cannot. Options are the zones
// physically nearest the car, closest first: the right answer is nearly always
// one of those, and offering the whole map would invite picking the cheaper
// zone three streets over. The sign at the plek is the authority, so the
// distance is shown next to every option rather than hidden behind a guess.
export default function ZonePicker({
  open, zones, selected, onPick, onClose,
  title = 'In welke zone sta je?',
  sub = 'Zones in de buurt, dichtstbijzijnde eerst. Het bord bij je plek is leidend.',
  closeLabel = 'Annuleren',
  children,
}) {
  if (!open) return null

  return (
    <div className="nav-overlay" onClick={onClose}>
      <div className="nav-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2 className="nav-sheet-title">{title}</h2>
        <p className="nav-sheet-sub">{sub}</p>
        {children}

        {zones.length === 0 ? (
          <p className="start-hint">Geen betaalde zones in de buurt gevonden.</p>
        ) : (
          <ul className="zone-opts">
            {zones.map(z => {
              const active = selected && zoneKey(selected) === zoneKey(z)
              return (
                <li key={zoneKey(z)}>
                  <button
                    className={`zone-opt${active ? ' zone-opt-active' : ''}`}
                    onClick={() => onPick(z)}
                    aria-pressed={!!active}
                  >
                    <span className="zone-opt-name">{z.desc}</span>
                    <span className="zone-opt-meta">
                      {z.maxRate ? `tot ${formatEuro(z.maxRate)}/uur` : 'tarief onbekend'}
                      {' · '}
                      {z.distance === 0 ? 'hier' : `${z.distance} m`}
                      {z.municipality ? ` · ${z.municipality}` : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <button className="nav-sheet-cancel" onClick={onClose}>{closeLabel}</button>
      </div>
    </div>
  )
}
