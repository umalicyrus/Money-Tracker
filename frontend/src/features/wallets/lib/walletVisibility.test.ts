import assert from 'node:assert/strict'
import test from 'node:test'
import { activeWalletRecords } from './walletVisibility.ts'

test('archived and deleted wallets disappear from active wallet lists', () => {
  const wallets = [
    { id: 'active', isArchived: false, deletedAt: null },
    { id: 'archived', isArchived: true, deletedAt: null },
    { id: 'deleted', isArchived: false, deletedAt: '2026-10-01T00:00:00Z' },
  ]

  assert.deepEqual(activeWalletRecords(wallets).map((wallet) => wallet.id), ['active'])
  assert.equal(wallets.length, 3)
})
