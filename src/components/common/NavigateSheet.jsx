import { openNavigation } from '../../utils/navigation'

// Asks which navigation app to hand the destination to. We deliberately don't
// try to detect what's installed — the browser can't tell us — so every option
// are always offered and the OS decides whether to open the app or the website.
export default function NavigateSheet({ destination, onClose }) {
  if (!destination) return null
  const { lat, lon, label } = destination

  function go(app) {
    openNavigation(app, lat, lon)
    onClose()
  }

  return (
    <div className="nav-overlay" onClick={onClose}>
      <div className="nav-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2 className="nav-sheet-title">Navigeren</h2>
        {label && <p className="nav-sheet-sub">{label}</p>}
        <button className="btn btn-yellow" onClick={() => go('google')}>Google Maps</button>
        <button className="btn btn-ghost" onClick={() => go('apple')}>Apple Kaarten</button>
        <button className="btn btn-ghost" onClick={() => go('waze')}>Waze</button>
        <button className="nav-sheet-cancel" onClick={onClose}>Annuleren</button>
      </div>
    </div>
  )
}
