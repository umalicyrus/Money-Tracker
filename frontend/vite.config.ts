import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

function pwaServiceWorker(): Plugin {
  return {
    name: 'money-tracker-pwa-service-worker',
    generateBundle(_options, bundle) {
      const buildAssets = Object.keys(bundle)
        .filter((fileName) => !fileName.endsWith('.map'))
        .map((fileName) => `/${fileName}`)
      const precache = ['/', '/favicon.svg', '/icons.svg', '/app-icon.svg', '/manifest.webmanifest', ...buildAssets]
      const revision = createHash('sha256').update(JSON.stringify(precache))
      for (const file of ['index.html', 'public/favicon.svg', 'public/icons.svg', 'public/app-icon.svg', 'public/manifest.webmanifest']) {
        revision.update(readFileSync(new URL(file, import.meta.url)))
      }
      const cacheName = `money-tracker-shell-v4-${revision.digest('hex').slice(0, 20)}`

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `const CACHE_NAME = ${JSON.stringify(cacheName)}
const PRECACHE_URLS = ${JSON.stringify(precache)}
const CACHE_PREFIX = 'money-tracker-shell-'
const API_PREFIXES = ['/api', '/sanctum', '/login', '/logout', '/up', '/storage']

function isProtectedRequest(url) {
  return API_PREFIXES.some((prefix) =>
    url.pathname === prefix || url.pathname.startsWith(prefix + '/')
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    // Installation must finish caching every file before this worker activates.
    await cache.addAll(
      PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' }))
    )
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(
      keys
              .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    isProtectedRequest(url)
  ) return

  const isNavigation = request.mode === 'navigate'
  // Only public files in this build's manifest are served from this cache.
  if (!isNavigation && !PRECACHE_URLS.includes(url.pathname)) return

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    const key = isNavigation ? '/' : url.pathname
    const cached = await cache.match(key, { ignoreVary: true })
    if (cached) return cached
    return fetch(request)
  })())
})

`,
      })
    },
  }
  }

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), pwaServiceWorker()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/sanctum': 'http://127.0.0.1:8000',
      '/login': 'http://127.0.0.1:8000',
      '/logout': 'http://127.0.0.1:8000',
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/sanctum': 'http://127.0.0.1:8000',
      '/login': 'http://127.0.0.1:8000',
      '/logout': 'http://127.0.0.1:8000',
    },
  },
})
