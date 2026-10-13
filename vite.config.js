import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'ParkMatiq',
        short_name: 'ParkMatiq',
        description: 'Slim parkeren — start en stop een parkeersessie, bewaar je geschiedenis, download je bewijs.',
        theme_color: '#002D72',
        background_color: '#002D72',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // woff2 is in here because the fonts are ours now: leaving them out
        // would make an offline launch fall back to system fonts.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Opens the app when a notification is tapped (public/notification-click.js).
        importScripts: ['notification-click.js'],
        runtimeCaching: [
          {
            // The zone data decides what a session costs, so it must survive a
            // lost connection: without it the app can only say "tarief
            // onbekend". Cached on first use rather than precached — it is
            // several MB and not every session needs it immediately.
            urlPattern: /\.geojson$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'parking-zones',
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/[abcd]\.basemaps\.cartocdn\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'carto-tiles',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
})
