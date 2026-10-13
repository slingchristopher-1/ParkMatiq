import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProfile, getActiveSession, getSettings } from '../../../services/storage'
import { rateForZone } from '../../../services/tariffs'
import ZonePicker from '../../parking-zones/components/ZonePicker'
import PurposeToggle from './PurposeToggle'
import VehiclePicker from './VehiclePicker'
import { vehicleList, defaultPlate } from '../../../utils/vehicles'
import { onZonePrompt } from '../hooks/useDriveDetection'
import { startSession } from '../startSession'
import { logPrompt } from '../../../services/storage'

// Shown app-wide when drive detection sees the car park just outside a zone:
// start in one of the nearby zones, or decline.
export default function AutoStartPrompt() {
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState(null) // { pos, zones }
  const [purpose, setPurpose] = useState(() => getSettings().sessionPurpose)
  const [vehicles, setVehicles] = useState([])
  const [plate, setPlate] = useState(null)

  useEffect(() => onZonePrompt(p => {
    if (!getProfile() || getActiveSession()) return
    setPurpose(getSettings().sessionPurpose)
    setVehicles(vehicleList(getProfile(), getSettings()))
    setPlate(defaultPlate(getProfile(), getSettings()))
    setPrompt(p)
  }), [])

  function pick(zone) {
    const t = rateForZone(zone, getSettings().permitZones)
    logPrompt({ kind: 'start', acted: true })
    startSession({ plate, purpose, pos: prompt.pos, t, zonePicked: true, startedBy: 'prompt' })
    setPrompt(null)
    navigate('/session')
  }

  return (
    <ZonePicker
      open={!!prompt}
      title="Parkeren starten?"
      sub="Je GPS-locatie valt net buiten een parkeerzone. Sta je in een van deze zones?"
      zones={prompt?.zones ?? []}
      onPick={pick}
      onClose={() => { logPrompt({ kind: 'start', acted: false }); setPrompt(null) }}
      closeLabel="Niet nu"
    >
      {vehicles.length > 1 && (
        <VehiclePicker vehicles={vehicles} value={plate} onChange={setPlate} />
      )}
      <PurposeToggle value={purpose} onChange={setPurpose} />
    </ZonePicker>
  )
}
