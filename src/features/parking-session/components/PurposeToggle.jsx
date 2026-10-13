import { PURPOSES } from '../../../utils/purpose'

// Privé / Zakelijk switch shown before a session starts.
export default function PurposeToggle({ value, onChange }) {
  return (
    <div className="seg-control purpose-toggle" role="radiogroup" aria-label="Soort parkeren">
      {PURPOSES.map(([val, lbl]) => (
        <button
          key={val}
          type="button"
          role="radio"
          aria-checked={value === val}
          className={`seg-opt${value === val ? ' seg-opt-active' : ''}`}
          onClick={() => onChange(val)}
        >
          {lbl}
        </button>
      ))}
    </div>
  )
}
