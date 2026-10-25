// Entry point for the demo build. The app's own entry calls this and nothing
// else, and only when VITE_DEMO is set — so a production build never includes
// the seed, the fake geolocation or the panel.

import { createRoot } from 'react-dom/client'
import { buildMonth, DEMO_PLATE } from './seed'
import { installFakeGeolocation } from './fakeGeo'
import DevPanel from './DevPanel'
import DemoToasts from './DemoToasts'
import { installDemoNotifications } from './fakeNotify'
import './demo.css'

const KEYS = {
  profile: 'pw_profile',
  sessions: 'pw_sessions',
  settings: 'pw_settings',
  prompts: 'pw_prompts',
  active: 'pw_active',
}

function seed() {
  const { sessions, prompts } = buildMonth(new Date())
  localStorage.setItem(KEYS.profile, JSON.stringify({ name: 'Chris', email: 'demo@parkmatiq.app' }))
  localStorage.setItem(KEYS.sessions, JSON.stringify(sessions))
  localStorage.setItem(KEYS.prompts, JSON.stringify(prompts))
  localStorage.setItem(KEYS.settings, JSON.stringify({
    location: true,
    showCharging: true,
    permitZones: [],
    monthlyBudget: '150',
    maxDailyCost: '17.50',
    startPreference: 'balanced',
    endPreference: 'balanced',
    sessionPurpose: 'personal',
    vehicles: [{ plate: DEMO_PLATE, label: 'Auto' }],
    lastPlate: DEMO_PLATE,
    onboardingDone: true,
  }))
  localStorage.removeItem(KEYS.active)
}

export function reseed() {
  seed()
  location.reload()
}

export function clearAll() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k))
  location.reload()
}

export default function bootDemo() {
  // Only on a first visit: a re-seed on every reload would throw away whatever
  // was just demonstrated live, mid-presentation. The reload is what makes the
  // first load land on the home screen — this module is imported after the app
  // has already mounted and decided there was no profile yet.
  if (!localStorage.getItem(KEYS.sessions)) {
    seed()
    // Drop the hash: by the time this module loads the app has already
    // redirected to #/login, and a plain reload would land there again.
    location.replace(location.pathname + location.search)
    return
  }

  installDemoNotifications()
  installFakeGeolocation()

  const host = document.createElement('div')
  host.id = 'demo-root'
  document.body.appendChild(host)
  createRoot(host).render(<><DemoToasts /><DevPanel /></>)
}
