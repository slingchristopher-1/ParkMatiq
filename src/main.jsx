import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled, not loaded from Google's CDN: hotlinking them sends every
// visitor's IP address to a third party, which is exactly what the AVG asks us
// not to do. Only the weights the stylesheet actually uses are imported.
import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-600.css'
import '@fontsource/dm-sans/latin-700.css'
import '@fontsource/dm-sans/latin-800.css'
import '@fontsource/dm-mono/latin-400.css'
import '@fontsource/dm-mono/latin-500.css'
import 'leaflet/dist/leaflet.css'
import './styles/index.css'
import App from './app/App'
import { applyTheme, currentTheme } from './utils/theme'

// Apply the saved/system theme before first paint to avoid a flash.
applyTheme(currentTheme())

// Fix Leaflet default marker icons when bundled with Vite
import L from 'leaflet'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon   from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl:       markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl:     markerShadow,
})

// Presentation build only (npm run build:demo). The import sits inside the
// guard so a normal build never pulls src/demo into the bundle, and it is
// awaited because the demo replaces navigator.geolocation — the drive detector
// takes its watch on mount, and would otherwise hold the real one.
if (import.meta.env.VITE_DEMO) {
  const { default: bootDemo } = await import('./demo/boot')
  bootDemo()
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
