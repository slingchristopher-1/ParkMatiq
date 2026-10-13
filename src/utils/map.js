import L from 'leaflet'

export const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

export const userIcon = L.divIcon({
  className: '',
  html: `<div class="user-dot"><span></span></div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
})

export const chargeIcon = L.divIcon({
  className: '',
  html: `<div class="charge-pin"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})

export const parkIcon = L.divIcon({
  className: '',
  html: `<div class="park-pin">P<i></i></div>`,
  iconSize: [30, 38],
  iconAnchor: [15, 38],
})
