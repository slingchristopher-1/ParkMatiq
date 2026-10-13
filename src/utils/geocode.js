// Geocode a place/street name via OpenStreetMap Nominatim (no API key).
// User-initiated search only. Scoped to NL for relevant results.
export async function geocode(query) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=nl&q='
    + encodeURIComponent(query)
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': 'nl' } })
    const data = await res.json()
    if (!Array.isArray(data) || !data.length) return null
    return { pos: [parseFloat(data[0].lat), parseFloat(data[0].lon)], label: data[0].display_name }
  } catch {
    return null
  }
}
