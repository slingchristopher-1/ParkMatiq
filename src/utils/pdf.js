import { jsPDF } from 'jspdf'
import { sessionCost, formatEuro } from './tariff'
import { formatPlate } from './plate'
import { purposeLabel } from './purpose'

// Why the stay cost what it cost. A receipt that only lists times is no use to
// anyone claiming it back, so the basis for the amount is spelled out.
function tariffBasis(session) {
  switch (session.tariff || 'paid') {
    case 'permit':  return 'Bewonersvergunning — geen kosten'
    case 'free':    return 'Geen betaalde zone — geen kosten'
    case 'evening': return sessionCost(session) > 0
      ? `${formatEuro(session.rate)}/uur, deels buiten betaalde uren`
      : 'Buiten betaalde uren — geen kosten'
    case 'unknown': return 'Tarief onbekend — niets in rekening gebracht'
    default:        return `${formatEuro(session.rate)}/uur, per minuut afgerekend`
  }
}

export function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}u ${m}m ${s}s`
  return `${m}m ${s}s`
}

export function generateReceipt(session) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const startDate = new Date(session.startTime)
  const endDate = new Date(session.endTime)

  const dateStr = startDate.toLocaleDateString('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const startStr = startDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const endStr = endDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const durationStr = formatDuration(session.duration)
  const refNum = `PM-${session.id}`
  const cost = sessionCost(session)
  const purpose = purposeLabel(session.purpose)
  const plate = formatPlate(session.plate)

  // Header bar, in the app's navy
  doc.setFillColor(0, 45, 114)
  doc.rect(0, 0, 210, 42, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.text('ParkMatiq', 105, 17, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(purpose ? `Parkeerbewijs · ${purpose}` : 'Parkeerbewijs', 105, 30, { align: 'center' })

  // Divider
  doc.setDrawColor(200, 210, 240)
  doc.setLineWidth(0.4)

  // Amount first — it is what the receipt is for.
  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(30)
  doc.text(formatEuro(cost), 22, 62)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(120, 120, 120)
  doc.text('Totaalbedrag', 22, 68)

  const location = session.lat != null && session.lon != null
    ? `${session.lat.toFixed(5)}, ${session.lon.toFixed(5)}`
    : 'Niet vastgelegd'

  doc.setTextColor(30, 30, 30)
  const rows = [
    ...(purpose ? [['Soort', purpose]] : []),
    ['Datum',      dateStr],
    ['Start',      startStr],
    ['Einde',      endStr],
    ['Duur',       durationStr],
    // A zone the driver named themselves is marked as such: this receipt may be
    // used to claim money back or to contest a fine, and it should not present
    // their correction as something we measured.
    ['Zone',       (session.zoneDesc || 'Geen betaalde zone') +
                   (session.zonePicked ? ' (zelf gekozen)' : '')],
    ['Tarief',     tariffBasis(session)],
    ['Locatie',    location],
    ['Kenteken',   plate],
    ['Referentie', refNum],
  ]

  const startY = 88
  const lineH = 13

  doc.line(20, startY - 6, 190, startY - 6)

  rows.forEach(([label, value], i) => {
    const y = startY + i * lineH
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(label, 22, y)
    doc.setFont('helvetica', 'normal')
    doc.text(String(value), 75, y)
    doc.setDrawColor(230, 235, 250)
    doc.line(20, y + 4, 190, y + 4)
  })

  // Footer
  doc.setFontSize(9)
  doc.setTextColor(160, 160, 160)
  doc.text('Bedankt voor het gebruik van ParkMatiq', 105, 278, { align: 'center' })
  doc.text('Tarieven zijn indicatief en gebaseerd op open data van de RDW.',
    105, 284, { align: 'center' })

  const fileName = `ParkMatiq_${purpose ? purpose + '_' : ''}${plate}_${startDate.toISOString().slice(0, 10)}.pdf`
  doc.save(fileName)
}
