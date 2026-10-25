// Mirrors every notification the app sends onto the screen.
//
// notify() does nothing at all unless Notification.permission is 'granted',
// and a borrowed laptop, a projector session or a declined prompt all leave it
// denied. The whole point of the demo is the prompt, so it cannot depend on
// the operating system agreeing to show it. The app's code is untouched: both
// delivery paths it uses are intercepted here.

const listeners = new Set()
let nextId = 1

export function onDemoNotification(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function push(title, body) {
  const item = { id: nextId++, title, body: body || '' }
  listeners.forEach(fn => fn(item))
}

export function installDemoNotifications() {
  // Path 1: the service worker. Replacing `ready` covers the dev server too,
  // where no worker is registered and the promise would never settle.
  try {
    Object.defineProperty(navigator.serviceWorker, 'ready', {
      configurable: true,
      get: () => Promise.resolve({
        showNotification: (title, opts) => { push(title, opts?.body); return Promise.resolve() },
      }),
    })
  } catch { /* fall through to path 2 */ }

  // Path 2: the constructor, used when there is no service worker. Declaring
  // permission granted is also what stops notify() returning early.
  class DemoNotification {
    static permission = 'granted'
    static requestPermission() { return Promise.resolve('granted') }
    constructor(title, opts) {
      push(title, opts?.body)
      this.close = () => {}
      this.onclick = null
    }
  }
  window.Notification = DemoNotification
}
