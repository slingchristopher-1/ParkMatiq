import { formatPlate } from '../../utils/plate'

export default function PlateBadge({ plate, large }) {
  return (
    <span className={`plate${large ? ' plate-lg' : ''}`}>
      <span className="plate-nl">NL</span>
      <span className="plate-num">{plate ? formatPlate(plate) : '—'}</span>
    </span>
  )
}
