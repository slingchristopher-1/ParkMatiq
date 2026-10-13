import PlateBadge from '../../../components/common/PlateBadge'

// Which car this session is for. Only shown when the driver has more than one.
export default function VehiclePicker({ vehicles, value, onChange }) {
  return (
    <div className="vehicle-picker" role="radiogroup" aria-label="Voertuig">
      {vehicles.map(v => (
        <button
          key={v.plate}
          type="button"
          role="radio"
          aria-checked={v.plate === value}
          className={`vehicle-chip${v.plate === value ? ' on' : ''}`}
          onClick={() => onChange(v.plate)}
        >
          <PlateBadge plate={v.plate} />
          {v.label && <span className="vehicle-chip-label">{v.label}</span>}
        </button>
      ))}
    </div>
  )
}
