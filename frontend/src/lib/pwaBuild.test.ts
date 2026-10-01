import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const dist = new URL('../../dist/', import.meta.url)
const worker = readFileSync(new URL('sw.js', dist), 'utf8')

function workerHarness() {
  const listeners = new Map<string, (event: unknown) => void>()
  const cachedPaths: string[] = []
  const removed: string[] = []
  const self = {
    location: { origin: 'https://moneytracker.example' },
    addEventListener: (name: string, callback: (event: unknown) => void) => listeners.set(name, callback),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  }
  runInNewContext(worker, {
    self, URL,
    Request: class { url: string; constructor(url: string) { this.url = url } },
    caches: {
      open: async () => ({
        addAll: async (requests: { url: string }[]) => { cachedPaths.push(...requests.map(request => request.url)) },
        match: async (key: string) => ({ cached: key }),
      }),
      keys: async () => ['money-tracker-shell-old', 'unrelated-app-cache'],
      delete: async (key: string) => { removed.push(key) },
    },
    fetch: async () => { throw new Error('Unexpected network request') },
  })
  return { listeners, cachedPaths, removed }
}

test('built PWA precaches existing public files, including its manifest and icon', async () => {
  const { listeners, cachedPaths } = workerHarness()
  let done: Promise<unknown> = Promise.resolve()
  listeners.get('install')?.({ waitUntil: (task: Promise<unknown>) => { done = task } })
  await done
  assert.ok(cachedPaths.includes('/manifest.webmanifest'))
  for (const icon of ['/app-icon-192.png', '/app-icon-512.png', '/apple-touch-icon.png', '/favicon.png']) {
    assert.ok(cachedPaths.includes(icon), `Icon unavailable offline: ${icon}`)
  }
  for (const path of cachedPaths) {
    assert.ok(existsSync(new URL(path === '/' ? 'index.html' : path.slice(1), dist)), `Missing precache file: ${path}`)
  }
})

test('built worker bypasses auth, sync, photos, health, cross-origin and non-GET requests', () => {
  const { listeners } = workerHarness()
  for (const path of ['/api/user', '/api/v1/sync/records', '/api/v1/profile/photo', '/sanctum/csrf-cookie', '/login', '/register', '/logout', '/storage/private', '/up']) {
    listeners.get('fetch')?.({ request: { url: `https://moneytracker.example${path}`, method: 'GET', mode: 'navigate' }, respondWith: () => assert.fail(`Cached private request ${path}`) })
  }
  for (const request of [
    { url: 'https://other.example/', method: 'GET', mode: 'navigate' },
    { url: 'https://moneytracker.example/', method: 'POST', mode: 'navigate' },
  ]) {
    listeners.get('fetch')?.({ request, respondWith: () => assert.fail('Intercepted protected request') })
  }
})

test('worker serves the shell for offline navigation and only removes its old shell caches', async () => {
  const { listeners, removed } = workerHarness()
  let response: Promise<{ cached: string }> | undefined
  listeners.get('fetch')?.({ request: { url: 'https://moneytracker.example/wallets', method: 'GET', mode: 'navigate' }, respondWith: (task: Promise<{ cached: string }>) => { response = task } })
  assert.equal((await response)?.cached, '/')
  let done: Promise<unknown> = Promise.resolve()
  listeners.get('activate')?.({ waitUntil: (task: Promise<unknown>) => { done = task } })
  await done
  assert.deepEqual(removed, ['money-tracker-shell-old'])
})
