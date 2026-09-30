import assert from 'node:assert/strict'
import test from 'node:test'
import { keepsLocalRecord } from './localRecordProtection.ts'

test('pending records are protected from a downloaded server replacement', () => {
  const recordId = 'pending-wallet'

  assert.equal(
    keepsLocalRecord({ version: '0', localStatus: 'pending' }, '1', new Set(), recordId),
    true,
  )
  assert.equal(
    keepsLocalRecord({ version: '1', localStatus: 'synced' }, '2', new Set([recordId]), recordId),
    true,
  )
  assert.equal(
    keepsLocalRecord({ version: '3', localStatus: 'synced' }, '2', new Set(), recordId),
    true,
  )
  assert.equal(
    keepsLocalRecord({ version: '1', localStatus: 'synced' }, '2', new Set(), recordId),
    false,
  )
})
