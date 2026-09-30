import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateBudgetProgress } from './budgetSummary.ts'

test('uses local month boundaries and exact centavo spending', () => {
  const progress = calculateBudgetProgress(
    [{ id: 'budget', categoryId: 'food', limitMinor: '9007199254741000', monthStart: '2026-09-01' }],
    [{ id: 'food', name: 'Food', type: 'expense' }],
    [
      { type: 'expense', categoryId: 'food', amountMinor: '9007199254740993', transactionDate: '2026-09-01' },
      { type: 'expense', categoryId: 'food', amountMinor: '7', transactionDate: '2026-09-30' },
      { type: 'expense', categoryId: 'food', amountMinor: '99', transactionDate: '2026-10-01' },
    ],
    '2026-09',
  )

  assert.deepEqual(progress[0], {
    id: 'budget', categoryName: 'Food', limitMinor: '9007199254741000', spentMinor: '9007199254741000',
    remainingMinor: '0', percentageUsed: '100.0', progressPercent: 100,
  })
})

test('excludes deleted records and shows an over-budget remaining amount', () => {
  const progress = calculateBudgetProgress(
    [{ id: 'budget', categoryId: 'food', limitMinor: '1000', monthStart: '2026-09-01' }],
    [{ id: 'food', name: 'Food', type: 'expense' }],
    [
      { type: 'expense', categoryId: 'food', amountMinor: '1200', transactionDate: '2026-09-10' },
      { type: 'expense', categoryId: 'food', amountMinor: '300', transactionDate: '2026-09-11', deletedAt: '2026-09-12T00:00:00Z' },
    ],
    '2026-09',
  )

  assert.equal(progress[0]?.spentMinor, '1200')
  assert.equal(progress[0]?.remainingMinor, '-200')
  assert.equal(progress[0]?.percentageUsed, '120.0')
  assert.equal(progress[0]?.progressPercent, 100)
})
