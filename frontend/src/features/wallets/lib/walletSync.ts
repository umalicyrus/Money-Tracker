import axios from 'axios'
import { api } from '../../../lib/api/client'
import { keepsLocalRecord } from './localRecordProtection'
import { itemizedTransactionItems, requireMatchingItemSubtotal, type ItemInput, type TransactionItem } from './itemizedTotals'
import { calculateWalletBalance as calculateBalance } from './walletBalance'

export type WalletType = 'cash' | 'bank' | 'ewallet'
export type LocalWalletStatus = 'pending' | 'synced' | 'error'
export type CategoryType = 'income' | 'expense'
export type Transaction = {
  id: string
  userId: string
  version: string
  type: 'income' | 'expense' | 'transfer'
  walletId: string
  destinationWalletId?: string
  categoryId: string | null
  amountMinor: string
  transactionDate: string
  note: string | null
  items?: TransactionItem[]
  deletedAt?: string | null
  localStatus: LocalWalletStatus
  lastError?: string
}

export type Budget = {
  id: string
  userId: string
  version: string
  categoryId: string
  limitMinor: string
  monthStart: string
  deletedAt?: string | null
  localStatus: LocalWalletStatus
  lastError?: string
}

export type Category = {
  id: string
  userId: string
  version: string
  name: string
  description?: string | null
  type: CategoryType
  icon: string
  iconImage?: string | null
  isArchived: boolean
  localStatus: LocalWalletStatus
  lastError?: string
}

export type Wallet = {
  id: string
  userId: string
  version: string
  name: string
  type: WalletType
  currency: 'PHP'
  openingBalanceMinor: string
  openingDate: string
  isArchived: boolean
  deletedAt?: string | null
  localStatus: LocalWalletStatus
  lastError?: string
}

type WalletPayload = {
  name: string
  type: WalletType
  opening_date: string
  opening_balance_minor: string
  currency: 'PHP'
}

type CategoryPayload = {
  name: string
  description?: string | null
  type: CategoryType
  icon: string
  icon_image?: string | null
}

type TransactionPayload = {
  type: 'income' | 'expense' | 'transfer'
  wallet_id: string
  destination_wallet_id: string | null
  category_id: string | null
  amount_minor: string
  transaction_date: string
  note: string | null
  items: Array<{ name: string; quantity: number; unit_price_minor: string }> | null
}

type BudgetPayload = {
  category_id: string
  limit_minor: string
  month_start: string
}

type PendingOperation = {
  operationId: string
  userId: string
  deviceId: string
  entityId: string
  payload: WalletPayload | CategoryPayload | TransactionPayload | BudgetPayload
  frozenEnvelope: Record<string, unknown>
  status: 'pending' | 'sending' | 'error'
  lastError?: string
}

type SyncResult = {
  pendingCount: number
  errorCount: number
}

type ServerSnapshot = {
  user_id: string
  wallets: Array<{ id: string; version: string; name: string; type: WalletType; currency: 'PHP'; opening_balance_minor: string; opening_date: string; is_archived: boolean; deleted_at: string | null }>
  categories: Array<{ id: string; version: string; name: string; description?: string | null; type: CategoryType; icon: string; icon_image?: string | null; is_archived: boolean }>
  transactions: Array<{ id: string; version: string; type: 'income' | 'expense' | 'transfer'; wallet_id: string; destination_wallet_id: string | null; category_id: string | null; amount_minor: string; transaction_date: string; note: string | null; items: Array<{ name: string; quantity: number; unit_price_minor: string }> | null; deleted_at: string | null }>
  budgets: Array<{ id: string; version: string; category_id: string; limit_minor: string; month_start: string; deleted_at: string | null }>
}

const databaseName = 'money-tracker-local'
const databaseVersion = 5
const walletStore = 'wallets'
const categoryStore = 'categories'
const transactionStore = 'transactions'
const budgetStore = 'budgets'
const operationStore = 'outbox'
const deviceIdKey = 'money-tracker-device-id'

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'))
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(walletStore)) {
        const wallets = database.createObjectStore(walletStore, { keyPath: ['userId', 'id'] })
        wallets.createIndex('byUser', 'userId', { unique: false })
      }

      if (!database.objectStoreNames.contains(categoryStore)) {
        const categories = database.createObjectStore(categoryStore, { keyPath: ['userId', 'id'] })
        categories.createIndex('byUser', 'userId', { unique: false })
      }

      if (!database.objectStoreNames.contains(operationStore)) {
        const outbox = database.createObjectStore(operationStore, { keyPath: 'operationId' })
        outbox.createIndex('byUser', 'userId', { unique: false })
      }

      if (!database.objectStoreNames.contains(transactionStore)) {
        const transactions = database.createObjectStore(transactionStore, { keyPath: ['userId', 'id'] })
        transactions.createIndex('byUser', 'userId', { unique: false })
      }

      if (!database.objectStoreNames.contains(budgetStore)) {
        const budgets = database.createObjectStore(budgetStore, { keyPath: ['userId', 'id'] })
        budgets.createIndex('byUser', 'userId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open local storage.'))
  })
}

function deviceId(): string {
  const existing = localStorage.getItem(deviceIdKey)
  if (existing) return existing

  const created = crypto.randomUUID()
  localStorage.setItem(deviceIdKey, created)
  return created
}

function walletFromRecord(record: Wallet): Wallet {
  return record
}

export function parseMinorUnits(value: string): string {
  const normalized = value.trim()

  if (!/^-?(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/.test(normalized)) {
    throw new Error('Enter a valid amount with up to two decimal places.')
  }

  const negative = normalized.startsWith('-')
  const unsigned = negative ? normalized.slice(1) : normalized
  const [whole, fraction = ''] = unsigned.split('.')
  const minor = BigInt(`${whole}${fraction.padEnd(2, '0')}`)
  const signedMinor = negative ? -minor : minor

  if (signedMinor < -999999999999n || signedMinor > 999999999999n) {
    throw new Error('The opening balance is too large.')
  }

  return signedMinor.toString()
}

export function formatMinorUnits(value: string): string {
  const minor = BigInt(value)
  const sign = minor < 0n ? '-' : ''
  const absolute = minor < 0n ? -minor : minor
  const whole = (absolute / 100n).toLocaleString('en-US')
  const fraction = (absolute % 100n).toString().padStart(2, '0')

  return `${sign}₱${whole.toString()}.${fraction}`
}

export function calculateTotalOpeningBalance(wallets: Wallet[]): string {
  return wallets
    .filter((wallet) => wallet.deletedAt == null)
    .reduce((total, wallet) => total + BigInt(wallet.openingBalanceMinor), 0n)
    .toString()
}

export async function saveWalletAndOperation(
  userId: string,
  input: { name: string; type: WalletType; openingDate: string; openingBalance: string },
): Promise<Wallet> {
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (!name || name.length > 60) throw new Error('Enter a wallet name of 60 characters or fewer.')

  const openingBalanceMinor = parseMinorUnits(input.openingBalance)
  const id = crypto.randomUUID()
  const operationId = crypto.randomUUID()
  const payload: WalletPayload = {
    name,
    type: input.type,
    opening_date: input.openingDate,
    opening_balance_minor: openingBalanceMinor,
    currency: 'PHP',
  }
  const envelope = {
    operation_id: operationId,
    device_id: deviceId(),
    entity_type: 'wallets',
    entity_id: id,
    action: 'create',
    base_version: '0',
    payload,
  }
  const wallet: Wallet = {
    id,
    userId,
    version: '0',
    name,
    type: input.type,
    currency: 'PHP',
    openingBalanceMinor,
    openingDate: input.openingDate,
    isArchived: false,
    localStatus: 'pending',
  }
  const operation: PendingOperation = {
    operationId,
    userId,
    deviceId: envelope.device_id as string,
    entityId: id,
    payload,
    frozenEnvelope: envelope,
    status: 'pending',
  }
  const database = await openDatabase()
  const transaction = database.transaction([walletStore, operationStore], 'readwrite')
  transaction.objectStore(walletStore).put(wallet)
  transaction.objectStore(operationStore).put(operation)
  await transactionComplete(transaction)
  database.close()

  return wallet
}

export async function saveCategoryAndOperation(
  userId: string,
  input: { name: string; description?: string; type: CategoryType; icon?: string; iconImage?: string | null },
): Promise<Category> {
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (!name || name.length > 60) throw new Error('Enter a category name of 60 characters or fewer.')
  const description = input.description?.trim().replace(/\s+/g, ' ') ?? ''
  if (description.length > 160) throw new Error('Enter a category description of 160 characters or fewer.')

  const id = crypto.randomUUID()
  const operationId = crypto.randomUUID()
  const icon = input.icon ?? 'tag'
  if (!/^[a-z0-9_-]+$/.test(icon) || icon.length > 40) throw new Error('Choose a valid category icon.')
  const payload: CategoryPayload = { name, description: description || null, type: input.type, icon, ...(input.iconImage ? { icon_image: input.iconImage } : {}) }
  const envelope = {
    operation_id: operationId,
    device_id: deviceId(),
    entity_type: 'categories',
    entity_id: id,
    action: 'create',
    base_version: '0',
    payload,
  }
  const category: Category = {
    id,
    userId,
    version: '0',
    name,
    description: description || null,
    type: input.type,
    icon,
    iconImage: input.iconImage ?? null,
    isArchived: false,
    localStatus: 'pending',
  }
  const operation: PendingOperation = {
    operationId,
    userId,
    deviceId: envelope.device_id,
    entityId: id,
    payload,
    frozenEnvelope: envelope,
    status: 'pending',
  }
  const database = await openDatabase()
  const transaction = database.transaction([categoryStore, operationStore], 'readwrite')
  transaction.objectStore(categoryStore).put(category)
  transaction.objectStore(operationStore).put(operation)
  await transactionComplete(transaction)
  database.close()

  return category
}

export async function updateWalletAndOperation(
  userId: string,
  wallet: Wallet,
  input: { name: string; type: WalletType; openingDate: string; openingBalance: string },
): Promise<Wallet> {
  if (wallet.userId !== userId || wallet.version === '0' || wallet.localStatus !== 'synced') throw new Error('Wait for this wallet to sync before changing it again.')
  if (wallet.isArchived || wallet.deletedAt != null) throw new Error('Archived or deleted wallets cannot be edited.')
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (!name || name.length > 60) throw new Error('Enter a wallet name of 60 characters or fewer.')
  const openingBalanceMinor = parseMinorUnits(input.openingBalance)
  const operationId = crypto.randomUUID()
  const payload: WalletPayload = { name, type: input.type, opening_date: input.openingDate, opening_balance_minor: openingBalanceMinor, currency: 'PHP' }
  const envelope = { operation_id: operationId, device_id: deviceId(), entity_type: 'wallets', entity_id: wallet.id, action: 'update', base_version: wallet.version, payload }
  const updated: Wallet = { ...wallet, name, type: input.type, openingDate: input.openingDate, openingBalanceMinor, localStatus: 'pending', lastError: undefined }
  const operation: PendingOperation = { operationId, userId, deviceId: envelope.device_id, entityId: wallet.id, payload, frozenEnvelope: envelope, status: 'pending' }
  const database = await openDatabase()
  const transaction = database.transaction([walletStore, operationStore], 'readwrite')
  transaction.objectStore(walletStore).put(updated)
  transaction.objectStore(operationStore).put(operation)
  await transactionComplete(transaction)
  database.close()
  return updated
}

export async function archiveWalletAndOperation(userId: string, wallet: Wallet): Promise<Wallet> {
  if (wallet.userId !== userId || wallet.version === '0' || wallet.localStatus !== 'synced') throw new Error('Wait for this wallet to sync before archiving it.')
  if (wallet.isArchived || wallet.deletedAt != null) throw new Error('This wallet is already archived or deleted.')
  const operationId = crypto.randomUUID()
  const payload: WalletPayload = {
    name: wallet.name,
    type: wallet.type,
    opening_date: wallet.openingDate,
    opening_balance_minor: wallet.openingBalanceMinor,
    currency: wallet.currency,
  }
  const envelope = { operation_id: operationId, device_id: deviceId(), entity_type: 'wallets', entity_id: wallet.id, action: 'delete', base_version: wallet.version, payload }
  const archived: Wallet = { ...wallet, isArchived: true, localStatus: 'pending', lastError: undefined }
  const operation: PendingOperation = { operationId, userId, deviceId: envelope.device_id, entityId: wallet.id, payload, frozenEnvelope: envelope, status: 'pending' }
  const database = await openDatabase()
  const transaction = database.transaction([walletStore, operationStore], 'readwrite')
  transaction.objectStore(walletStore).put(archived)
  transaction.objectStore(operationStore).put(operation)
  await transactionComplete(transaction)
  database.close()
  return archived
}

export async function updateCategoryAndOperation(
  userId: string,
  category: Category,
  input: { name: string; description?: string; type: CategoryType; icon: string; iconImage?: string | null; archive?: boolean },
): Promise<Category> {
  if (category.localStatus !== 'synced') throw new Error('Wait for this category to sync before changing it again.')
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (!name || name.length > 60) throw new Error('Enter a category name of 60 characters or fewer.')
  const description = input.description?.trim().replace(/\s+/g, ' ') ?? ''
  if (description.length > 160) throw new Error('Enter a category description of 160 characters or fewer.')
  if (!/^[a-z0-9_-]+$/.test(input.icon) || input.icon.length > 40) throw new Error('Choose a valid category icon.')

  const operationId = crypto.randomUUID()
  const payload: CategoryPayload = { name, description: description || null, type: input.type, icon: input.icon, ...(input.iconImage ? { icon_image: input.iconImage } : {}) }
  const envelope = {
    operation_id: operationId,
    device_id: deviceId(),
    entity_type: 'categories',
    entity_id: category.id,
    action: input.archive ? 'archive' : 'update',
    base_version: category.version,
    payload,
  }
  const updated: Category = {
    ...category,
    name,
    description: description || null,
    type: input.archive ? category.type : input.type,
    icon: input.icon,
    iconImage: input.iconImage ?? null,
    isArchived: input.archive || category.isArchived,
    localStatus: 'pending',
    lastError: undefined,
  }
  const operation: PendingOperation = {
    operationId,
    userId,
    deviceId: envelope.device_id,
    entityId: category.id,
    payload,
    frozenEnvelope: envelope,
    status: 'pending',
  }
  const database = await openDatabase()
  const transaction = database.transaction([categoryStore, operationStore], 'readwrite')
  transaction.objectStore(categoryStore).put(updated)
  transaction.objectStore(operationStore).put(operation)
  await transactionComplete(transaction)
  database.close()

  return updated
}

export async function saveTransactionAndOperation(
  userId: string,
  input: { type: 'income' | 'expense'; walletId: string; categoryId: string; amount: string; transactionDate: string; note: string; items?: ItemInput[] },
): Promise<Transaction> {
  const items = input.type === 'expense' && input.items && input.items.length > 0 ? itemizedTransactionItems(input.items) : undefined
  const amountMinor = parseMinorUnits(input.amount)
  if (BigInt(amountMinor) <= 0n) throw new Error('Enter an amount greater than zero.')
  if (items) requireMatchingItemSubtotal(amountMinor, items)

  const id = crypto.randomUUID()
  const operationId = crypto.randomUUID()
  const payload: TransactionPayload = {
    type: input.type,
    wallet_id: input.walletId,
    destination_wallet_id: null,
    category_id: input.categoryId,
    amount_minor: amountMinor,
    transaction_date: input.transactionDate,
    note: input.note.trim() || null,
    items: items ? items.map((item) => ({ name: item.name, quantity: item.quantity, unit_price_minor: item.unitPriceMinor })) : null,
  }
  const envelope = {
    operation_id: operationId,
    device_id: deviceId(),
    entity_type: 'transactions',
    entity_id: id,
    action: 'create',
    base_version: '0',
    payload,
  }
  const transactionRecord: Transaction = {
    id,
    userId,
    version: '0',
    type: input.type,
    walletId: input.walletId,
    categoryId: input.categoryId,
    amountMinor,
    transactionDate: input.transactionDate,
    note: payload.note,
    ...(items ? { items } : {}),
    localStatus: 'pending',
  }
  const operation: PendingOperation = {
    operationId,
    userId,
    deviceId: envelope.device_id,
    entityId: id,
    payload,
    frozenEnvelope: envelope,
    status: 'pending',
  }
  const database = await openDatabase()
  const transaction = database.transaction([transactionStore, operationStore], 'readwrite')
  transaction.objectStore(transactionStore).put(transactionRecord)
  transaction.objectStore(operationStore).put(operation)
  await transactionComplete(transaction)
  database.close()

  return transactionRecord
}

export const saveExpenseAndOperation = (userId: string, input: Omit<Parameters<typeof saveTransactionAndOperation>[1], 'type'>) =>
  saveTransactionAndOperation(userId, { ...input, type: 'expense' })

export async function saveTransferAndOperation(
  userId: string,
  input: { sourceWalletId: string; destinationWalletId: string; amount: string; transactionDate: string; note: string },
): Promise<Transaction> {
  if (input.sourceWalletId === input.destinationWalletId) throw new Error('Choose two different wallets for a transfer.')

  const wallets = await listWallets(userId)
  const activeWalletIds = new Set(wallets.filter((wallet) => wallet.userId === userId && !wallet.isArchived && wallet.deletedAt == null).map((wallet) => wallet.id))
  if (!activeWalletIds.has(input.sourceWalletId) || !activeWalletIds.has(input.destinationWalletId)) {
    throw new Error('Choose two active wallets in your workspace.')
  }

  const amountMinor = parseMinorUnits(input.amount)
  if (BigInt(amountMinor) <= 0n) throw new Error('Enter an amount greater than zero.')

  const id = crypto.randomUUID()
  const operationId = crypto.randomUUID()
  const payload: TransactionPayload = {
    type: 'transfer',
    wallet_id: input.sourceWalletId,
    destination_wallet_id: input.destinationWalletId,
    category_id: null,
    amount_minor: amountMinor,
    transaction_date: input.transactionDate,
    note: input.note.trim() || null,
    items: null,
  }
  const envelope = { operation_id: operationId, device_id: deviceId(), entity_type: 'transactions', entity_id: id, action: 'create', base_version: '0', payload }
  const transfer: Transaction = {
    id,
    userId,
    version: '0',
    type: 'transfer',
    walletId: input.sourceWalletId,
    destinationWalletId: input.destinationWalletId,
    categoryId: null,
    amountMinor,
    transactionDate: input.transactionDate,
    note: payload.note,
    localStatus: 'pending',
  }
  const operation: PendingOperation = { operationId, userId, deviceId: envelope.device_id, entityId: id, payload, frozenEnvelope: envelope, status: 'pending' }
  const database = await openDatabase()
  const transaction = database.transaction([transactionStore, operationStore], 'readwrite')
  transaction.objectStore(transactionStore).put(transfer)
  transaction.objectStore(operationStore).put(operation)
  await transactionComplete(transaction)
  database.close()

  return transfer
}

function decimalAmountFromMinor(value: string): string {
  const minor = BigInt(value)
  const sign = minor < 0n ? '-' : ''
  const absolute = minor < 0n ? -minor : minor
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`
}

export async function updateTransactionAndOperation(
  userId: string,
  existing: Transaction,
  input: { type: 'income' | 'expense' | 'transfer'; walletId: string; destinationWalletId?: string; categoryId?: string; amount: string; transactionDate: string; note: string; items?: ItemInput[] },
): Promise<Transaction> {
  if (existing.userId !== userId || existing.version === '0' || existing.localStatus !== 'synced') throw new Error('Wait for this transaction to sync before changing it again.')
  if (existing.deletedAt != null) throw new Error('Deleted transactions cannot be edited.')
  if (input.type === 'transfer' && input.walletId === input.destinationWalletId) throw new Error('Choose two different wallets for a transfer.')
  const items = input.type === 'expense' && input.items && input.items.length > 0 ? itemizedTransactionItems(input.items) : undefined
  const amountMinor = parseMinorUnits(input.amount)
  if (BigInt(amountMinor) <= 0n) throw new Error('Enter an amount greater than zero.')
  if (items) requireMatchingItemSubtotal(amountMinor, items)
  const wallets = await listWallets(userId)
  const activeWalletIds = new Set(wallets.filter((wallet) => !wallet.isArchived && wallet.deletedAt == null).map((wallet) => wallet.id))
  if (!activeWalletIds.has(input.walletId) || (input.type === 'transfer' && (!input.destinationWalletId || !activeWalletIds.has(input.destinationWalletId)))) throw new Error('Choose active wallets in your workspace.')
  const operationId = crypto.randomUUID()
  const payload: TransactionPayload = {
    type: input.type, wallet_id: input.walletId, destination_wallet_id: input.type === 'transfer' ? input.destinationWalletId ?? null : null,
    category_id: input.type === 'transfer' ? null : input.categoryId ?? null, amount_minor: amountMinor, transaction_date: input.transactionDate,
    note: input.note.trim() || null, items: items ? items.map((item) => ({ name: item.name, quantity: item.quantity, unit_price_minor: item.unitPriceMinor })) : null,
  }
  const envelope = { operation_id: operationId, device_id: deviceId(), entity_type: 'transactions', entity_id: existing.id, action: 'update', base_version: existing.version, payload }
  const updated: Transaction = {
    ...existing, type: input.type, walletId: input.walletId, destinationWalletId: payload.destination_wallet_id ?? undefined,
    categoryId: payload.category_id, amountMinor, transactionDate: input.transactionDate, note: payload.note,
    ...(items ? { items } : { items: undefined }), localStatus: 'pending', lastError: undefined,
  }
  const operation: PendingOperation = { operationId, userId, deviceId: envelope.device_id, entityId: existing.id, payload, frozenEnvelope: envelope, status: 'pending' }
  const database = await openDatabase()
  const transaction = database.transaction([transactionStore, operationStore], 'readwrite')
  transaction.objectStore(transactionStore).put(updated)
  transaction.objectStore(operationStore).put(operation)
  await transactionComplete(transaction)
  database.close()
  return updated
}

export async function deleteTransactionAndOperation(userId: string, existing: Transaction): Promise<Transaction> {
  if (existing.userId !== userId || existing.version === '0' || existing.localStatus !== 'synced') throw new Error('Wait for this transaction to sync before deleting it.')
  if (existing.deletedAt != null) throw new Error('This transaction is already deleted.')
  const operationId = crypto.randomUUID()
  const payload: TransactionPayload = {
    type: existing.type,
    wallet_id: existing.walletId,
    destination_wallet_id: existing.destinationWalletId ?? null,
    category_id: existing.categoryId,
    amount_minor: existing.amountMinor,
    transaction_date: existing.transactionDate,
    note: existing.note,
    items: existing.items?.map((item) => ({ name: item.name, quantity: item.quantity, unit_price_minor: item.unitPriceMinor })) ?? null,
  }
  const envelope = { operation_id: operationId, device_id: deviceId(), entity_type: 'transactions', entity_id: existing.id, action: 'delete', base_version: existing.version, payload }
  const deleted: Transaction = { ...existing, deletedAt: new Date().toISOString(), localStatus: 'pending', lastError: undefined }
  const operation: PendingOperation = { operationId, userId, deviceId: envelope.device_id, entityId: existing.id, payload, frozenEnvelope: envelope, status: 'pending' }
  const database = await openDatabase()
  const transaction = database.transaction([transactionStore, operationStore], 'readwrite')
  transaction.objectStore(transactionStore).put(deleted)
  transaction.objectStore(operationStore).put(operation)
  await transactionComplete(transaction)
  database.close()
  return deleted
}

export { decimalAmountFromMinor }

export async function saveBudgetAndOperation(userId: string, input: { categoryId: string; limit: string; month: string }): Promise<Budget> {
  if (!/^\d{4}-\d{2}$/.test(input.month)) throw new Error('Choose a valid budget month.')

  const limitMinor = parseMinorUnits(input.limit)
  if (BigInt(limitMinor) <= 0n) throw new Error('Enter a budget limit greater than zero.')

  const id = crypto.randomUUID()
  const operationId = crypto.randomUUID()
  const payload: BudgetPayload = { category_id: input.categoryId, limit_minor: limitMinor, month_start: `${input.month}-01` }
  const envelope = { operation_id: operationId, device_id: deviceId(), entity_type: 'budgets', entity_id: id, action: 'create', base_version: '0', payload }
  const budget: Budget = { id, userId, version: '0', categoryId: input.categoryId, limitMinor, monthStart: payload.month_start, localStatus: 'pending' }
  const operation: PendingOperation = { operationId, userId, deviceId: envelope.device_id, entityId: id, payload, frozenEnvelope: envelope, status: 'pending' }
  const database = await openDatabase()
  const transaction = database.transaction([budgetStore, operationStore], 'readwrite')
  transaction.objectStore(budgetStore).put(budget)
  transaction.objectStore(operationStore).put(operation)
  await transactionComplete(transaction)
  database.close()

  return budget
}

export async function listWallets(userId: string): Promise<Wallet[]> {
  const database = await openDatabase()
  const records = await requestResult(database.transaction(walletStore, 'readonly').objectStore(walletStore).index('byUser').getAll(userId))
  database.close()

  return records.map(walletFromRecord)
}

export async function listCategories(userId: string): Promise<Category[]> {
  const database = await openDatabase()
  const records = await requestResult(database.transaction(categoryStore, 'readonly').objectStore(categoryStore).index('byUser').getAll(userId))
  database.close()

  return records
}

export async function listTransactions(userId: string): Promise<Transaction[]> {
  const database = await openDatabase()
  const records = await requestResult(database.transaction(transactionStore, 'readonly').objectStore(transactionStore).index('byUser').getAll(userId))
  database.close()

  return records
}

export async function listBudgets(userId: string): Promise<Budget[]> {
  const database = await openDatabase()
  const records = await requestResult(database.transaction(budgetStore, 'readonly').objectStore(budgetStore).index('byUser').getAll(userId))
  database.close()

  return records
}

export function calculateWalletBalance(wallet: Wallet, transactions: Transaction[]): string {
  return calculateBalance(wallet, transactions)
}

export async function hasLocalWorkspace(userId: string): Promise<boolean> {
  const wallets = await listWallets(userId)
  const categories = await listCategories(userId)
  const transactions = await listTransactions(userId)
  const budgets = await listBudgets(userId)
  const operations = await listOperations(userId)

  return wallets.length > 0 || categories.length > 0 || transactions.length > 0 || budgets.length > 0 || operations.length > 0
}

async function listOperations(userId: string): Promise<PendingOperation[]> {
  const database = await openDatabase()
  const records = await requestResult(database.transaction(operationStore, 'readonly').objectStore(operationStore).index('byUser').getAll(userId))
  database.close()

  return records
}

export async function pendingOperationCount(userId: string): Promise<number> {
  const operations = await listOperations(userId)
  return operations.filter((operation) => operation.status !== 'sending').length
}

export async function downloadServerRecords(userId: string): Promise<void> {
  const response = await api.get<{ data: ServerSnapshot }>('/api/v1/sync/records', {
    headers: {
      'X-Expected-User-ID': userId,
      'X-Sync-Protocol': '1',
    },
  })
  const snapshot = response.data.data

  if (snapshot.user_id !== userId) {
    throw new Error('The server returned records for a different account.')
  }

  const database = await openDatabase()
  const transaction = database.transaction([operationStore, walletStore, categoryStore, transactionStore, budgetStore], 'readwrite')
  const operations = transaction.objectStore(operationStore)
  const wallets = transaction.objectStore(walletStore)
  const categories = transaction.objectStore(categoryStore)
  const transactions = transaction.objectStore(transactionStore)
  const budgets = transaction.objectStore(budgetStore)

  // Queue every read before awaiting so the browser keeps this transaction active
  // while deciding which server records may replace local records.
  const pendingOperationsRequest = requestResult(operations.index('byUser').getAll(userId))
  const walletRequests = snapshot.wallets.map((wallet) => requestResult(wallets.get([userId, wallet.id])))
  const categoryRequests = snapshot.categories.map((category) => requestResult(categories.get([userId, category.id])))
  const transactionRequests = snapshot.transactions.map((serverTransaction) => requestResult(transactions.get([userId, serverTransaction.id])))
  const budgetRequests = snapshot.budgets.map((budget) => requestResult(budgets.get([userId, budget.id])))
  const [pendingOperations, localWallets, localCategories, localTransactions, localBudgets] = await Promise.all([
    pendingOperationsRequest,
    Promise.all(walletRequests),
    Promise.all(categoryRequests),
    Promise.all(transactionRequests),
    Promise.all(budgetRequests),
  ])
  const protectedRecordIds = new Set(
    pendingOperations
      .filter((operation) => operation.status === 'pending' || operation.status === 'sending' || operation.status === 'error')
      .map((operation) => operation.entityId),
  )

  for (const [index, wallet] of snapshot.wallets.entries()) {
    if (!keepsLocalRecord(localWallets[index], wallet.version, protectedRecordIds, wallet.id)) {
      wallets.put({
        id: wallet.id, userId, version: wallet.version, name: wallet.name, type: wallet.type, currency: wallet.currency,
        openingBalanceMinor: wallet.opening_balance_minor, openingDate: wallet.opening_date, isArchived: wallet.is_archived,
        deletedAt: wallet.deleted_at, localStatus: 'synced',
      } satisfies Wallet)
    }
  }

  for (const [index, category] of snapshot.categories.entries()) {
    if (!keepsLocalRecord(localCategories[index], category.version, protectedRecordIds, category.id)) {
      categories.put({
        id: category.id, userId, version: category.version, name: category.name, description: category.description ?? null, type: category.type, icon: category.icon, iconImage: category.icon_image ?? null,
        isArchived: category.is_archived, localStatus: 'synced',
      } satisfies Category)
    }
  }

  for (const [index, serverTransaction] of snapshot.transactions.entries()) {
    if (!keepsLocalRecord(localTransactions[index], serverTransaction.version, protectedRecordIds, serverTransaction.id)) {
      transactions.put({
        id: serverTransaction.id, userId, version: serverTransaction.version, type: serverTransaction.type,
        walletId: serverTransaction.wallet_id, destinationWalletId: serverTransaction.destination_wallet_id ?? undefined,
        categoryId: serverTransaction.category_id, amountMinor: serverTransaction.amount_minor,
        transactionDate: serverTransaction.transaction_date, note: serverTransaction.note,
        ...(serverTransaction.items ? { items: serverTransaction.items.map((item) => ({ name: item.name, quantity: item.quantity, unitPriceMinor: item.unit_price_minor, lineTotalMinor: (BigInt(item.unit_price_minor) * BigInt(item.quantity)).toString() })) } : {}),
        deletedAt: serverTransaction.deleted_at, localStatus: 'synced',
      } satisfies Transaction)
    }
  }

  for (const [index, budget] of snapshot.budgets.entries()) {
    if (!keepsLocalRecord(localBudgets[index], budget.version, protectedRecordIds, budget.id)) {
      budgets.put({
        id: budget.id, userId, version: budget.version, categoryId: budget.category_id, limitMinor: budget.limit_minor,
        monthStart: budget.month_start, deletedAt: budget.deleted_at, localStatus: 'synced',
      } satisfies Budget)
    }
  }

  await transactionComplete(transaction)
  database.close()
}

async function updateOperation(operation: PendingOperation): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(operationStore, 'readwrite')
  transaction.objectStore(operationStore).put(operation)
  await transactionComplete(transaction)
  database.close()
}

async function markLocalRecord(userId: string, entityId: string, changes: Partial<Wallet | Category | Transaction | Budget>, storeName: string): Promise<void> {
  const database = await openDatabase()
  const transaction = database.transaction(storeName, 'readwrite')
  const store = transaction.objectStore(storeName)
  const wallet = await requestResult(store.get([userId, entityId]))
  if (wallet) store.put({ ...wallet, ...changes })
  await transactionComplete(transaction)
  database.close()
}

export async function syncPendingOperations(userId: string): Promise<SyncResult> {
  const operations = (await listOperations(userId))
    .filter((operation) => operation.status === 'pending' || operation.status === 'error')
    .sort((left, right) => {
      const order = { wallets: 0, categories: 1, transactions: 2, budgets: 3 }
      return (order[left.frozenEnvelope.entity_type as keyof typeof order] ?? 3) - (order[right.frozenEnvelope.entity_type as keyof typeof order] ?? 3)
    })
  let errorCount = 0

  if (operations.length === 0) return { pendingCount: 0, errorCount: 0 }

  const storeFor = (operation: PendingOperation) => operation.frozenEnvelope.entity_type === 'categories' ? categoryStore : operation.frozenEnvelope.entity_type === 'transactions' ? transactionStore : operation.frozenEnvelope.entity_type === 'budgets' ? budgetStore : walletStore
  const messageFor = (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const serverMessage = error.response?.data?.error?.message ?? error.response?.data?.message
      if (typeof serverMessage === 'string') return serverMessage
      if (error.response?.status === 401) return 'Sign in again to sync this change.'
      if (!error.response) return 'No connection. This change is safely saved and will retry.'
    }
    return 'Could not sync this change. It remains saved on this device.'
  }

  try {
    const identityResponse = await api.get('/api/user')
    if (identityResponse.data.id !== userId) {
      return { pendingCount: operations.length, errorCount: operations.length }
    }
    await api.get('/sanctum/csrf-cookie')
  } catch (error) {
    const message = messageFor(error)
    await Promise.all(operations.map(async (operation) => {
      await updateOperation({ ...operation, status: 'error', lastError: message })
      await markLocalRecord(userId, operation.entityId, { localStatus: 'error', lastError: message }, storeFor(operation))
    }))
    return { pendingCount: operations.length, errorCount: operations.length }
  }

  for (const operation of operations) {
    const sending = { ...operation, status: 'sending' as const, lastError: undefined }
    await updateOperation(sending)

    try {
      const response = await api.post('/api/v1/sync/operations', operation.frozenEnvelope, {
        headers: {
          'X-Expected-User-ID': userId,
          'X-Sync-Protocol': '1',
        },
      })
      const record = response.data.data.record
      await markLocalRecord(userId, operation.entityId, {
        version: record.version,
        localStatus: 'synced',
        lastError: undefined,
      }, storeFor(operation))
      const database = await openDatabase()
      const transaction = database.transaction(operationStore, 'readwrite')
      transaction.objectStore(operationStore).delete(operation.operationId)
      await transactionComplete(transaction)
      database.close()
    } catch (error) {
      errorCount += 1
      const message = messageFor(error)
      await updateOperation({ ...sending, status: 'error', lastError: message })
      await markLocalRecord(userId, operation.entityId, { localStatus: 'error', lastError: message }, storeFor(operation))
    }
  }

  const remaining = await pendingOperationCount(userId)
  return { pendingCount: remaining, errorCount }
}
