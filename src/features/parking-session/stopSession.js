import { getActiveSession, clearActiveSession, addSession } from '../../services/storage'
import { costOf, formatEuro } from '../../services/tariffs'
import { formatDuration } from '../../services/receipts'
import { notify } from '../../services/notifications'

// Ends the running session and files it in the history. Shared by the stop
// button and the "Sessie stoppen?" prompt. Returns the completed session (for
// the summary screen), or null when nothing was running.
export function stopSession({ stoppedBy = 'button', promptedAt = null } = {}) {
  const session = getActiveSession()
  if (!session) return null
  const startMs = new Date(session.startTime).getTime()
  const endMs = Date.now()
  const duration = Math.floor((endMs - startMs) / 1000)
  const completed = {
    ...session,
    id: startMs,
    endTime: new Date(endMs).toISOString(),
    duration,
    cost: costOf(session, endMs),
    // Same reason as startedBy: without these the history screen cannot say how
    // often a prompt is acted on, or how long a session ran past the drive-off.
    stoppedBy,
    stopLagMinutes: promptedAt ? Math.max(0, Math.round((endMs - promptedAt) / 60000)) : null,
  }
  clearActiveSession()
  addSession(completed)
  notify('Parkeren gestopt', `Duur: ${formatDuration(duration)} · ${formatEuro(completed.cost)}`)
  return completed
}
