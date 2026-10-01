import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateWalletBalance, type BalanceTransaction, type BalanceWallet } from './walletBalance.ts'

const wallet = (id: string, openingBalanceMinor = '0'): BalanceWallet => ({
  id,
  openingBalanceMinor,
})

const transfer = (changes: Partial<BalanceTransaction> = {}): BalanceTransaction => ({
  type: 'transfer',
  walletId: 'source',
  destinationWalletId: 'destination',
  categoryId: null,
  amountMinor: '125050',
  transactionDate: '2026-09-25',
  note: null,
  localStatus: 'pending',
  ...changes,
})

test('a pending transfer applies exact opposite balance effects once', () => {
  const transactions = [transfer()]

  assert.equal(calculateWalletBalance(wallet('source', '9007199254741000'), transactions), '9007199254615950')
  assert.equal(calculateWalletBalance(wallet('destination'), transactions), '125050')
})

test('deleted transfers do not change either wallet balance', () => {
  const transactions = [transfer({ deletedAt: '2026-09-26T00:00:00Z' })]

  assert.equal(calculateWalletBalance(wallet('source', '100'), transactions), '100')
  assert.equal(calculateWalletBalance(wallet('destination', '200'), transactions), '200')
})

test('recalculates a wallet balance when its opening balance is edited', () => {
  const transactions: BalanceTransaction[] = [{ type: 'expense', walletId: 'cash', amountMinor: '2500' }]

  assert.equal(calculateWalletBalance(wallet('cash', '10000'), transactions), '7500')
  assert.equal(calculateWalletBalance(wallet('cash', '20000'), transactions), '17500')
})

test('a transaction tombstone restores its amount to the local wallet balance', () => {
  const expense: BalanceTransaction = { type: 'expense', walletId: 'cash', amountMinor: '2500' }

  assert.equal(calculateWalletBalance(wallet('cash', '10000'), [expense]), '7500')
  assert.equal(calculateWalletBalance(wallet('cash', '10000'), [{ ...expense, deletedAt: '2026-10-01T00:00:00Z' }]), '10000')
})
