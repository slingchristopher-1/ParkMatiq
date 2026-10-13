export async function requestPermission() {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  const result = await Notification.requestPermission()
  return result === 'granted'
}

// `path` is the screen a tap on the notification opens, e.g. '#/session'.
export function notify(title, body, path = '') {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  // Android (and installed iOS PWAs) forbid `new Notification()` — it throws an
  // "illegal constructor" error and would block whatever runs after the call.
  // Prefer the service worker, fall back to the constructor, and never throw.
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(reg => reg.showNotification(title, { body, icon: './icon-192.png', data: { path } }))
        .catch(() => {})
    } else {
      const n = new Notification(title, { body, icon: './icon-192.png' })
      n.onclick = () => {
        window.focus()
        if (path) window.location.hash = path.replace(/^#/, '')
        n.close()
      }
    }
  } catch {
    /* notifications must never break the calling flow */
  }
}
