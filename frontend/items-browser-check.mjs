import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const appUrl = 'http://127.0.0.1:5192'
const vite = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5192', '--strictPort'], { windowsHide: true, stdio: 'ignore' })
const profile = await mkdtemp(path.join(tmpdir(), 'money-tracker-items-'))
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=9236', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
let chromeError = ''
chrome.stderr.on('data', (chunk) => { chromeError += String(chunk) })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let socket

try {
  let appReady = false
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { appReady = (await fetch(appUrl)).ok; if (appReady) break } catch { await sleep(150) }
  }
  assert.ok(appReady, 'Vite did not start')
  let target
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { target = await (await fetch('http://127.0.0.1:9236/json/new?about:blank', { method: 'PUT' })).json(); break } catch { await sleep(150) }
  }
  assert.ok(target, `Chrome did not start: ${chromeError.slice(-1000)}`)
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
    } else for (const listener of listeners.get(message.method) ?? []) listener(message.params)
  }
  const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) })
  const on = (method, listener) => listeners.set(method, [...(listeners.get(method) ?? []), listener])
  const evaluate = async (expression) => {
    const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails))
    return response.result.value
  }
  const waitFor = async (expression, label) => {
    for (let attempt = 0; attempt < 120; attempt += 1) { if (await evaluate(expression)) return; await sleep(100) }
    throw new Error(`Timed out waiting for ${label}: ${await evaluate('document.body.innerText')}`)
  }
  const click = (selector) => evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw Error('Missing ${selector}'); element.click(); return true })()`)
  const clickNav = (name) => evaluate(`[...document.querySelectorAll('.bottom-nav button')].find(button => button.textContent.includes(${JSON.stringify(name)})).click()`)
  const setInput = (selector, value) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); return input.value })()`)
  const setSelect = (selector, value) => evaluate(`(() => { const select = document.querySelector(${JSON.stringify(selector)}); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(select, ${JSON.stringify(value)}); select.dispatchEvent(new Event('change', { bubbles: true })); return select.value })()`)
  const localCounts = () => evaluate(`new Promise((resolve, reject) => { const request = indexedDB.open('money-tracker-local', 5); request.onerror = () => reject(request.error); request.onsuccess = () => { const db = request.result; const transaction = db.transaction(['transactions', 'outbox'], 'readonly'); const result = {}; for (const name of ['transactions', 'outbox']) { const read = transaction.objectStore(name).count(); read.onsuccess = () => { result[name] = read.result } } transaction.oncomplete = () => { db.close(); resolve(result) }; transaction.onerror = () => reject(transaction.error) } })`)
  const captureDir = path.resolve('browser-captures')
  await mkdir(captureDir, { recursive: true })
  const screenshot = async (name) => { const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const file = path.join(captureDir, `${name}.png`); await writeFile(file, Buffer.from(data, 'base64')); console.log(`SCREENSHOT ${file}`) }

  const today = new Date().toISOString().slice(0, 10)
  const snapshot = {
    user_id: '11111111-1111-4111-8111-111111111111',
    wallets: [{ id: '22222222-2222-4222-8222-222222222222', version: '1', name: 'Cash', type: 'cash', currency: 'PHP', opening_balance_minor: '207713100', opening_date: today, is_archived: false, deleted_at: null }],
    categories: [{ id: '33333333-3333-4333-8333-333333333333', version: '1', name: 'Groceries', description: null, type: 'expense', icon: 'groceries', icon_image: null, is_archived: false }],
    transactions: [{ id: '44444444-4444-4444-8444-444444444444', version: '1', type: 'expense', wallet_id: '22222222-2222-4222-8222-222222222222', destination_wallet_id: null, category_id: '33333333-3333-4333-8333-333333333333', amount_minor: '17800', transaction_date: today, note: null, items: [
      { name: 'Rice', quantity: 1, unit_price_minor: '5700', line_total_minor: '5700' },
      { name: 'Fresh Egg', quantity: 4, unit_price_minor: '1000', line_total_minor: '4000' },
      { name: 'Tomato', quantity: 3, unit_price_minor: '500', line_total_minor: '1500' },
      { name: 'Bread', quantity: 2, unit_price_minor: '1500', line_total_minor: '3000' },
      { name: 'Milk', quantity: 1, unit_price_minor: '2000', line_total_minor: '2000' },
      { name: 'Salt', quantity: 2, unit_price_minor: '800', line_total_minor: '1600' },
    ], deleted_at: null }],
    budgets: [],
  }
  on('Fetch.requestPaused', ({ requestId, request }) => { void (async () => {
    const url = new URL(request.url)
    let body
    if (url.pathname === '/api/user') body = { id: snapshot.user_id }
    else if (url.pathname === '/api/v1/sync/records') body = { data: snapshot }
    else if (url.pathname === '/sanctum/csrf-cookie') body = {}
    else { await call('Fetch.continueRequest', { requestId }); return }
    await call('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') })
  })() })
  await call('Page.enable')
  await call('Runtime.enable')
  await call('Fetch.enable', { patterns: [{ urlPattern: '*/api/user*' }, { urlPattern: '*/api/v1/sync/records*' }, { urlPattern: '*/sanctum/csrf-cookie*' }] })
  await call('Page.navigate', { url: appUrl })
  await waitFor("!!document.querySelector('.home-dashboard')", 'Home')
  for (const width of [320, 375, 390, 768, 1440]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
    await clickNav('Home')
    await waitFor("!!document.querySelector('.home-month-control')", 'month control')
    const home = await evaluate(`(() => { const heading = document.querySelector('#home-monthly-heading').getBoundingClientRect(); const control = document.querySelector('.home-month-control').getBoundingClientRect(); return { overflow: document.documentElement.scrollWidth > innerWidth, sameRow: Math.abs(heading.top - control.top) < 20, headingRight: heading.right, controlLeft: control.left } })()`)
    assert.equal(home.overflow, false, `Home overflows at ${width}px`)
    assert.ok(home.sameRow && home.headingRight <= home.controlLeft + 1, `Month heading/control wrap or overlap at ${width}px: ${JSON.stringify(home)}`)
    if (width === 375) {
      const originalMonth = await evaluate("document.querySelector('.home-month-control input').value")
      await click('.home-month-control button:first-child')
      await waitFor(`document.querySelector('.home-month-control input').value !== ${JSON.stringify(originalMonth)}`, 'previous month')
      await click('.home-month-control button:last-child')
      await waitFor(`document.querySelector('.home-month-control input').value === ${JSON.stringify(originalMonth)}`, 'next month restores selection')
    }
    if (width === 375) await screenshot('items-home-375')
    await clickNav('Transactions')
    await waitFor("!!document.querySelector('.history-items-summary')", 'item summary')
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, `History overflows at ${width}px`)
    await click('.history-items-summary')
    await waitFor("!!document.querySelector('.item-detail-card')", 'item details')
    const detail = await evaluate(`(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, rows: document.querySelectorAll('.item-detail-table-row').length, total: document.querySelector('.item-detail-total').innerText }))()`)
    assert.equal(detail.overflow, false, `Details overflow at ${width}px`)
    assert.equal(detail.rows, 3)
    assert.ok(detail.total.includes('178.00'))
    if (width === 375) await screenshot('items-detail-375')
    await click('.item-detail-more')
    assert.equal(await evaluate("document.querySelectorAll('.item-detail-table-row').length"), 6)
    await click('.item-detail-back')
    await waitFor("!!document.querySelector('.history-items-summary')", 'history return')
    await waitFor("document.activeElement?.classList.contains('history-items-summary')", 'item summary focus return')
    await clickNav('Home')
    await click('.home-action-expense')
    await waitFor("!!document.querySelector('.transaction-items-toggle')", 'expense form')
    assert.equal(await evaluate("!!document.querySelector('.itemized-expense')"), false)
    await click('.transaction-items-toggle')
    await setInput('#item-name-0', 'Rice')
    await setInput('#item-price-0', '57.00')
    await click('.item-add-button')
    await setInput('#item-name-1', 'Fresh Egg')
    await setInput('#item-qty-1', '4')
    await setInput('#item-price-1', '10.00')
    const form = await evaluate(`(() => { const save = document.querySelector('.transaction-save-button'); save.scrollIntoView({ block: 'end' }); return { overflow: document.documentElement.scrollWidth > innerWidth, subtotal: document.querySelector('.itemized-subtotal').innerText, trash: [...document.querySelectorAll('.item-remove')].map(button => ({ height: button.getBoundingClientRect().height, label: button.getAttribute('aria-label') })), saveBottom: save.getBoundingClientRect().bottom, viewportHeight: innerHeight } })()`)
    assert.equal(form.overflow, false, `Add items overflows at ${width}px`)
    assert.ok(form.subtotal.includes('97.00'), `Wrong subtotal at ${width}px: ${form.subtotal}`)
    assert.ok(form.trash.every((button) => button.height >= 44 && button.label.startsWith('Remove ')))
    assert.ok(form.saveBottom <= form.viewportHeight + 1, `Save button unreachable at ${width}px: ${JSON.stringify(form)}`)
    if (width === 375) {
      await evaluate("document.querySelector('.itemized-expense').scrollIntoView({ block: 'start' })")
      await screenshot('items-add-375')
      await setInput('#transaction-amount', '96.00')
      await setSelect('#expense-wallet', snapshot.wallets[0].id)
      await setSelect('#expense-category', snapshot.categories[0].id)
      await setInput('#expense-date', today)
      await click('.transaction-save-button')
      await waitFor("document.querySelector('.form-error')?.innerText.includes('amount and items subtotal must match')", 'amount/subtotal validation')
      assert.deepEqual(await localCounts(), { transactions: 1, outbox: 0 })
      console.log('PASS mismatch shows a clear validation message without saving')
    }
    console.log(`PASS ${width}px Home, item details, Add items`)
    await click('.transaction-cancel')
    await waitFor("!!document.querySelector('.bottom-nav')", 'bottom navigation after form')
  }
} finally { socket?.close(); chrome.kill(); vite.kill() }
