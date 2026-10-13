// Whether a stay was private or for work. Business drivers claim parking back,
// so the receipt has to say which it was.
export const PURPOSES = [
  ['personal', 'Privé'],
  ['business', 'Zakelijk'],
]

// Label for a session's purpose, or '' for sessions recorded before the choice
// existed — a receipt must not claim a purpose nobody picked.
export function purposeLabel(purpose) {
  return PURPOSES.find(([val]) => val === purpose)?.[1] ?? ''
}
