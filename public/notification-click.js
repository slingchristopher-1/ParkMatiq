// Loaded into the generated service worker (workbox importScripts in
// vite.config.js). Without a notificationclick handler, tapping a ParkMatiq
// notification did nothing — the "Sessie starten?" / "Sessie stoppen?" prompts
// told the driver to open the app but could not open it themselves.
//
// Focuses an open ParkMatiq window (and moves it to the screen the
// notification is about), or opens a new one there.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const scope = self.registration.scope
  const url = new URL(event.notification.data?.path || '', scope).href

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find(w => w.url.startsWith(scope))
    if (open) {
      await open.focus()
      // navigate() only works on a window this worker controls; a focused app
      // on the wrong screen is still better than nothing.
      if (event.notification.data?.path) await open.navigate(url).catch(() => {})
      return
    }
    await self.clients.openWindow(url)
  })())
})
