import { setActiveSession, getSettings, saveSettings, markPromptActed } from '../../services/storage'
import { effectiveDayCap, parseAmount } from '../../services/tariffs'
import { notify } from '../../services/notifications'
import { formatPlate } from '../../utils/plate'
import { purposeLabel } from '../../utils/purpose'

// Starts a session from a resolved tariff `t` (rateForSession / rateForZone).
// Shared by the Home start button and the auto-start zone prompt.
// A start prompt counts as acted on when a session opens soon after it, however
// the driver got there — tapping the notification, the sheet, or just opening
// the app. Long enough to cover the second reminder at two minutes.
const PROMPT_ACTED_WINDOW_MS = 10 * 60 * 1000

export function startSession({ plate, purpose, pos, t, zonePicked = false, startedBy = 'button' }) {
  const settings = getSettings()
  saveSettings({ sessionPurpose: purpose, lastPlate: plate })
  setActiveSession({
    plate,
    purpose,
    startTime: new Date().toISOString(),
    lat: pos?.[0] ?? null,
    lon: pos?.[1] ?? null,
    rate: t.rate,
    windows: t.tariff === 'permit' ? null : t.windows,
    // Ceiling for a day of this session, fixed at start: the zone's dagtarief
    // or the driver's own limit, whichever is lower.
    dayCap: effectiveDayCap(t.zoneDayCap, parseAmount(settings.maxDailyCost)),
    zoneDesc: t.zoneDesc,
    zoneId: t.zoneId,
    tariff: t.tariff,
    // Where the zone came from. A receipt used to claim money back or to
    // contest a fine should not present a zone the driver chose as something
    // we measured.
    zonePicked,
    // How the session began. The history screen reports how often a prompt is
    // acted on, which is only answerable if we write it down here.
    startedBy,
  })
  markPromptActed('start', PROMPT_ACTED_WINDOW_MS)
  notify('Parkeren gestart', `${purposeLabel(purpose)} · Kenteken ${formatPlate(plate)}`)
}
