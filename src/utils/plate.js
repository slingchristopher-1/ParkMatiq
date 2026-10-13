// Dutch licence-plate handling. Validation follows the RDW "sidecodes" — the
// fixed letter/digit layouts every NL plate since 1978 uses. We store plates
// without separators and re-insert the dash grouping only for display.

// Strip separators/whitespace and uppercase. This is what we persist.
export function normalizePlate(raw) {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Sidecode layouts on the separator-stripped string (X = letter, 9 = digit).
const SIDECODES = [
  /^[A-Z]{2}\d{2}\d{2}$/,   // XX-99-99
  /^\d{2}\d{2}[A-Z]{2}$/,   // 99-99-XX
  /^\d{2}[A-Z]{2}\d{2}$/,   // 99-XX-99
  /^\d{2}[A-Z]{2}[A-Z]{2}$/,// 99-XX-XX
  /^[A-Z]{2}[A-Z]{2}\d{2}$/,// XX-XX-99
  /^[A-Z]{2}\d{2}[A-Z]{2}$/,// XX-99-XX
  /^\d{2}[A-Z]{3}\d$/,      // 99-XXX-9
  /^\d[A-Z]{3}\d{2}$/,      // 9-XXX-99
  /^[A-Z]{2}\d{3}[A-Z]$/,   // XX-999-X
  /^[A-Z]\d{3}[A-Z]{2}$/,   // X-999-XX
  /^[A-Z]{3}\d{2}[A-Z]$/,   // XXX-99-X
  /^[A-Z]\d{2}[A-Z]{3}$/,   // X-99-XXX
  /^\d[A-Z]{2}\d{3}$/,      // 9-XX-999
  /^\d{3}[A-Z]{2}\d$/,      // 999-XX-9
]

export function isValidPlate(raw) {
  const p = normalizePlate(raw)
  return SIDECODES.some(re => re.test(p))
}

// Insert the standard dashes into a normalized plate for display, grouping by
// runs of same-type characters (e.g. AB123C -> AB-123-C). Falls back to the raw
// value when the layout is unknown.
export function formatPlate(raw) {
  const p = normalizePlate(raw)
  const groups = p.match(/[A-Z]+|\d+/g)
  return groups ? groups.join('-') : p
}
