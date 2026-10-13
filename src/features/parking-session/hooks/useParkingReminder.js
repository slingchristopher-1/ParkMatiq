import { useEffect, useRef } from 'react'
import { getActiveSession } from '../../../services/storage'
import { notify } from '../../../services/notifications'
import { formatDuration } from '../../../services/receipts'
import { costOf, dayCapReached, formatEuro } from '../../../services/tariffs'

// Nudges the driver about a session that is still running. A session left open
// used to bill on quietly for days; these reminders (plus the day cap on the
// session itself) are what keep that from turning into a surprise.
//
// Foreground-only, like the drive detection: a web app gets no timers once it
// is closed. The native wrapper is what will make these fire in the background.
const FIRST_MS = 60 * 60 * 1000     // first nudge after an hour
const REPEAT_MS = 60 * 60 * 1000    // and hourly after that
const TICK_MS = 60 * 1000

export default function useParkingReminder() {
  const notifiedRef = useRef({ hours: 0, cappedDay: null })

  useEffect(() => {
    const tick = () => {
      const session = getActiveSession()
      if (!session) { notifiedRef.current = { hours: 0, cappedDay: null }; return }

      const elapsed = Date.now() - new Date(session.startTime).getTime()
      const cost = costOf(session)

      // "Your bill has stopped growing" is worth knowing once a day, not every
      // hour — but the cap resets at midnight, so an overnight session that
      // hits tomorrow's cap too deserves to hear about it again.
      const today = new Date().toDateString()
      if (notifiedRef.current.cappedDay !== today && dayCapReached(session)) {
        notifiedRef.current.cappedDay = today
        notify('Dagmaximum bereikt',
          `De kosten blijven vandaag op ${formatEuro(cost)} staan.`, '#/session')
        return
      }

      const due = Math.floor((elapsed - FIRST_MS) / REPEAT_MS) + 1
      if (elapsed >= FIRST_MS && due > notifiedRef.current.hours) {
        notifiedRef.current.hours = due
        notify('Je staat nog geparkeerd',
          `${formatDuration(Math.floor(elapsed / 1000))} · ${formatEuro(cost)} tot nu toe.`, '#/session')
      }
    }

    const id = setInterval(tick, TICK_MS)
    tick()
    return () => clearInterval(id)
  }, [])
}
