import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const appUrl = 'http://127.0.0.1:5191'
const vite = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5191', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
const profile = await mkdtemp(path.join(tmpdir(), 'money-tracker-actions-'))
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--remote-debugging-port=9235', `--user-data-dir=${profile}`, 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
let chromeError = ''
chrome.stderr.on('data', (chunk) => { chromeError += String(chunk) })

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
let socket

try {
  let appReady = false
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      appReady = (await fetch(appUrl)).ok
      if (appReady) break
    } catch {
      await sleep(150)
    }
  }
  assert.ok(appReady, 'The isolated Vite server could not start.')
  let target
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      target = await (await fetch('http://127.0.0.1:9235/json/new?about:blank', { method: 'PUT' })).json()
      break
    } catch {
      await sleep(150)
    }
  }
  assert.ok(target, `Chrome could not start: ${chromeError.slice(-1000)}`)
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })

  let sequence = 0
  const pending = new Map()
  const listeners = new Map()
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id) {
      const request = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) request?.reject(new Error(JSON.stringify(message.error)))
      else request?.resolve(message.result)
    } else {
      for (const listener of listeners.get(message.method) ?? []) listener(message.params)
    }
  }
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
  const on = (method, listener) => listeners.set(method, [...(listeners.get(method) ?? []), listener])
  const evaluate = async (expression) => {
    const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
    return response.result.value
  }
  const waitFor = async (expression, label) => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (await evaluate(expression)) return
      await sleep(100)
    }
    throw new Error(`Timed out waiting for ${label}: ${await evaluate('document.body.innerText')}`)
  }
  const click = (selector) => evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw Error('Missing ${selector}'); element.click(); return true })()`)
  const dbState = () => evaluate(`new Promise((resolve, reject) => {
    const request = indexedDB.open('money-tracker-local', 5)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(['wallets', 'transactions', 'outbox'], 'readonly')
      const result = {}
      for (const name of ['wallets', 'transactions', 'outbox']) {
        const read = transaction.objectStore(name).getAll()
        read.onsuccess = () => { result[name] = read.result }
      }
      transaction.oncomplete = () => { db.close(); resolve(result) }
      transaction.onerror = () => reject(transaction.error)
    }
  })`)
  const screenshot = async (name) => {
    const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    const file = path.join(profile, `${name}.png`)
    await writeFile(file, Buffer.from(data, 'base64'))
    console.log(`SCREENSHOT ${file}`)
  }

  const userId = '11111111-1111-4111-8111-111111111111'
  const walletId = '22222222-2222-4222-8222-222222222222'
  const categoryId = '33333333-3333-4333-8333-333333333333'
  const transactionId = '44444444-4444-4444-8444-444444444444'
  const today = new Date().toISOString().slice(0, 10)
  const snapshot = {
    user_id: userId,
    wallets: [{ id: walletId, version: '1', name: 'Everyday Cash Wallet With A Long Name', type: 'cash', currency: 'PHP', opening_balance_minor: '100000', opening_date: today, is_archived: false, deleted_at: null }],
    categories: [{ id: categoryId, version: '1', name: 'Dining', description: null, type: 'expense', icon: 'food', icon_image: null, is_archived: false }],
    transactions: [{ id: transactionId, version: '1', type: 'expense', wallet_id: walletId, destination_wallet_id: null, category_id: categoryId, amount_minor: '2500', transaction_date: today, note: 'Lunch', items: null, deleted_at: null }],
    budgets: [],
  }
  const receipts = new Map()
  const operationPosts = []
  on('Fetch.requestPaused', ({ requestId, request }) => {
    void (async () => {
      const url = new URL(request.url)
      let body
      if (url.pathname === '/api/user') body = { id: userId }
      else if (url.pathname === '/api/v1/sync/records') body = { data: snapshot }
      else if (url.pathname === '/sanctum/csrf-cookie') body = {}
      else if (url.pathname === '/api/v1/sync/operations') {
        const operation = JSON.parse(request.postData)
        operationPosts.push(operation)
        if (!receipts.has(operation.operation_id)) {
          assert.equal(operation.action, 'delete')
          const record = operation.entity_type === 'transactions' ? snapshot.transactions[0] : snapshot.wallets[0]
          record.version = String(Number(record.version) + 1)
          if (operation.entity_type === 'transactions') record.deleted_at = new Date().toISOString()
          else record.is_archived = true
          receipts.set(operation.operation_id, { data: { user_id: userId, operation_id: operation.operation_id, entity_type: operation.entity_type, entity_id: operation.entity_id, version: record.version, sequence: String(receipts.size + 1), record: { ...record } } })
        }
        body = receipts.get(operation.operation_id)
      } else {
        await call('Fetch.continueRequest', { requestId })
        return
      }
      await call('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') })
    })().catch((error) => { throw error })
  })

  await call('Page.enable')
  await call('Runtime.enable')
  await call('Fetch.enable', { patterns: [{ urlPattern: '*/api/user*' }, { urlPattern: '*/api/v1/sync/records*' }, { urlPattern: '*/api/v1/sync/operations*' }, { urlPattern: '*/sanctum/csrf-cookie*' }] })
  await call('Page.navigate', { url: appUrl })
  await waitFor("!!document.querySelector('.app-shell')", 'authenticated local app')
  await waitFor("document.body.innerText.includes('Money Tracker')", 'dashboard')

  const sizes = [360, 390, 768, 1024, 1440]
  for (const width of sizes) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
    await click('button.nav-item[aria-current="page"]')
    await evaluate("[...document.querySelectorAll('.bottom-nav button')].find(button => button.textContent.includes('Wallets')).click()")
    await waitFor("!!document.querySelector('.wallet-item')", 'wallet card')
    const walletLayout = await evaluate(`(() => { const card = document.querySelector('.wallet-item'); const button = card.querySelector('.record-actions-trigger'); return { width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth, card: card.getBoundingClientRect().toJSON(), button: button.getBoundingClientRect().toJSON(), text: card.innerText } })()`)
    assert.equal(walletLayout.overflow, false, `Wallet overflow at ${width}px`)
    assert.ok(walletLayout.button.height >= 44)
    await click('.wallet-item .record-actions-trigger')
    const menu = await evaluate(`(() => { const box = document.querySelector('.record-actions-menu').getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom } })()`)
    assert.ok(menu.left >= 0 && menu.right <= width && menu.top >= 0 && menu.bottom <= 844, `Wallet menu clipped at ${width}px: ${JSON.stringify(menu)}`)
    await evaluate("[...document.querySelectorAll('.record-actions-menu button')].find(button => button.textContent.includes('Archive wallet')).click()")
    const modal = await evaluate(`(() => { const overlay = document.querySelector('.confirm-action-backdrop'); const dialog = document.querySelector('.confirm-action-dialog'); const box = dialog.getBoundingClientRect(); return { center: box.left + box.width / 2, verticalCenter: box.top + box.height / 2, width: box.width, top: box.top, bottom: box.bottom, navVisible: !!document.querySelector('.bottom-nav'), background: getComputedStyle(overlay).backgroundColor, inert: document.querySelector('.app-shell').inert, buttons: [...dialog.querySelectorAll('button')].map(button => button.getBoundingClientRect().height) } })()`)
    assert.ok(Math.abs(modal.center - width / 2) <= 1, `Modal not centered at ${width}px: ${JSON.stringify(modal)}`)
    assert.ok(Math.abs(modal.verticalCenter - 422) <= 1, `Modal not vertically centered at ${width}px`)
    assert.ok(modal.top >= 0 && modal.bottom <= 844, `Modal clipped at ${width}px`)
    assert.ok(modal.buttons.every((height) => height >= 44))
    assert.ok(modal.navVisible && modal.inert)
    assert.equal(modal.background, 'rgba(30, 27, 75, 0.45)')
    assert.equal(await evaluate("document.activeElement.className"), 'confirm-action-cancel')
    if (width === 390) await screenshot('wallet-archive-390')
    await click('.confirm-action-cancel')
    assert.equal((await dbState()).outbox.length, 0, 'Cancel created an operation')
    await waitFor("document.activeElement?.getAttribute('aria-label') === 'Actions for Everyday Cash Wallet With A Long Name wallet'", 'wallet focus return')
    console.log(`PASS ${width}px: wallet card, menu, centered modal, cancel`)
    await evaluate("[...document.querySelectorAll('.bottom-nav button')].find(button => button.textContent.includes('Transactions')).click()")
    await waitFor("!!document.querySelector('.history-card')", 'transaction history')
    const historyLayout = await evaluate(`(() => { const card = document.querySelector('.history-card'); const button = card.querySelector('.record-actions-trigger'); return { overflow: document.documentElement.scrollWidth > innerWidth, button: button.getBoundingClientRect().toJSON() } })()`)
    assert.equal(historyLayout.overflow, false, `Transaction overflow at ${width}px`)
    assert.ok(historyLayout.button.height >= 44)
    await click('.history-card .record-actions-trigger')
    const transactionMenu = await evaluate(`(() => { const box = document.querySelector('.record-actions-menu').getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom } })()`)
    assert.ok(transactionMenu.left >= 0 && transactionMenu.right <= width && transactionMenu.top >= 0 && transactionMenu.bottom <= 844, `Transaction menu clipped at ${width}px`)
    const deleteAction = await evaluate(`(() => { const button = document.querySelector('.record-actions-danger'); return { label: button.getAttribute('aria-label'), svg: !!button.querySelector('svg'), color: getComputedStyle(button).color } })()`)
    assert.equal(deleteAction.label, 'Delete Dining transaction')
    assert.ok(deleteAction.svg)
    assert.equal(deleteAction.color, 'rgb(220, 38, 38)')
    await click('.record-actions-danger')
    assert.ok(await evaluate("document.querySelector('.confirm-action-dialog').innerText.includes('Dining')"))
    if (width === 390) await screenshot('transaction-delete-390')
    await click('.confirm-action-cancel')
    assert.equal((await dbState()).outbox.length, 0)
    await waitFor("document.activeElement?.getAttribute('aria-label') === 'Actions for Dining transaction'", 'transaction focus return')
    console.log(`PASS ${width}px: transaction card, trash action, cancel`)
  }

  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await evaluate("document.querySelector('.history-card').scrollIntoView({ block: 'center' })")
  await sleep(150)
  await click('.history-card .record-actions-trigger')
  await waitFor("!!document.querySelector('.record-actions-danger')", 'delete menu before short viewport')
  await click('.record-actions-danger')
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 320, deviceScaleFactor: 1, mobile: true })
  await sleep(100)
  const shortModal = await evaluate(`(() => { const dialog = document.querySelector('.confirm-action-dialog').getBoundingClientRect(); return { top: dialog.top, bottom: dialog.bottom, buttons: [...document.querySelectorAll('.confirm-action-dialog button')].map(button => button.getBoundingClientRect().height) } })()`)
  assert.ok(shortModal.top >= 0 && shortModal.bottom <= 320, `Short viewport clipped modal: ${JSON.stringify(shortModal)}`)
  assert.ok(shortModal.buttons.every((height) => height >= 44))
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await waitFor("!document.querySelector('.confirm-action-dialog')", 'Escape dismissal')
  await waitFor("document.activeElement?.getAttribute('aria-label') === 'Actions for Dining transaction'", 'Escape focus return')
  assert.equal((await dbState()).outbox.length, 0)
  console.log('PASS short viewport and Escape focus return')

  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await evaluate("document.querySelector('.history-card').scrollIntoView({ block: 'center' })")
  await sleep(150)
  await click('.history-card .record-actions-trigger')
  await waitFor("!!document.querySelector('.record-actions-danger')", 'delete menu for focus trap')
  await click('.record-actions-danger')
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 })
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 })
  assert.equal(await evaluate("document.activeElement?.className"), 'confirm-action-danger')
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
  assert.equal(await evaluate("document.activeElement?.className"), 'confirm-action-cancel')
  await evaluate("document.querySelector('.confirm-action-backdrop').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))")
  await waitFor("!document.querySelector('.confirm-action-dialog')", 'outside click dismissal')
  await waitFor("document.activeElement?.getAttribute('aria-label') === 'Actions for Dining transaction'", 'outside click focus return')
  assert.equal((await dbState()).outbox.length, 0)
  console.log('PASS focus trap and outside-click cancellation')

  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
  await click('.history-card .record-actions-trigger')
  await waitFor("!!document.querySelector('.record-actions-danger')", 'delete menu after viewport restoration')
  await click('.record-actions-danger')
  await click('.confirm-action-danger')
  await waitFor("!document.querySelector('.history-card')", 'deleted transaction hidden')
  let state = await dbState()
  assert.ok(state.transactions[0].deletedAt)
  assert.equal(state.outbox.length, 1)
  assert.equal(state.outbox[0].frozenEnvelope.action, 'delete')
  assert.equal(state.outbox[0].frozenEnvelope.base_version, '1')
  assert.equal(state.outbox[0].frozenEnvelope.entity_id, transactionId)
  assert.ok(await evaluate("document.body.innerText.includes('Transaction deleted on this device. Waiting to sync.')"))
  console.log('PASS offline transaction tombstone and single frozen delete operation')

  await evaluate("[...document.querySelectorAll('.bottom-nav button')].find(button => button.textContent.includes('Wallets')).click()")
  await click('.wallet-item .record-actions-trigger')
  await evaluate("[...document.querySelectorAll('.record-actions-menu button')].find(button => button.textContent.includes('Archive wallet')).click()")
  await click('.confirm-action-danger')
  await waitFor("!document.querySelector('.wallet-item')", 'archived wallet hidden')
  state = await dbState()
  assert.equal(state.wallets[0].isArchived, true)
  assert.equal(state.transactions.length, 1)
  assert.equal(state.outbox.length, 2)
  console.log('PASS offline wallet archive preserves transaction history')

  await call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await evaluate("window.dispatchEvent(new Event('online'))")
  await waitFor("document.body.innerText.includes('All changes synced.')", 'reconnected sync')
  state = await dbState()
  assert.equal(state.outbox.length, 0)
  assert.equal(receipts.size, 2)
  assert.equal(new Set(operationPosts.map((operation) => operation.operation_id)).size, 2)
  assert.equal(state.transactions[0].version, '2')
  assert.equal(state.wallets[0].version, '2')
  console.log('PASS reconnect syncs each operation once without duplicate records')
} finally {
  socket?.close()
  chrome.kill()
  vite.kill()
}
