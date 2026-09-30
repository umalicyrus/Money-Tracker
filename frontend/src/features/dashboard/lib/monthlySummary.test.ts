import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateMonthlySummary, currentLocalMonth, transactionsForMonth } from './monthlySummary.ts'

test('uses local month boundaries without timezone conversion', () => {
  const summary = calculateMonthlySummary([
    { type: 'income', amountMinor: '101', transactionDate: '2026-02-01' },
    { type: 'expense', amountMinor: '1', transactionDate: '2026-02-28' },
    { type: 'expense', amountMinor: '99999', transactionDate: '2026-03-01' },
    { type: 'income', amountMinor: '99999', transactionDate: '2026-01-31' },
  ], '2026-02')

  assert.deepEqual(summary, { incomeMinor: '101', expenseMinor: '1', netMinor: '100' })
  assert.equal(currentLocalMonth(new Date(2026, 1, 1)), '2026-02')
  assert.deepEqual(
    transactionsForMonth([
      { id: 'first', transactionDate: '2026-02-01' },
      { id: 'last', transactionDate: '2026-02-28' },
      { id: 'before', transactionDate: '2026-01-31' },
      { id: 'after', transactionDate: '2026-03-01' },
    ], '2026-02').map((transaction) => transaction.id),
    ['first', 'last'],
  )
})

test('keeps centavo totals exact and includes pending local records once', () => {
  const summary = calculateMonthlySummary([
    { type: 'income', amountMinor: '9007199254740993', transactionDate: '2026-09-10', localStatus: 'pending' },
    { type: 'income', amountMinor: '7', transactionDate: '2026-09-10' },
    { type: 'expense', amountMinor: '8', transactionDate: '2026-09-11' },
  ], '2026-09')

  assert.deepEqual(summary, {
    incomeMinor: '9007199254741000',
    expenseMinor: '8',
    netMinor: '9007199254740992',
  })
})

test('excludes deleted transactions', () => {
  const summary = calculateMonthlySummary([
    { type: 'income', amountMinor: '1000', transactionDate: '2026-09-01' },
    { type: 'expense', amountMinor: '400', transactionDate: '2026-09-02', deletedAt: '2026-09-03T00:00:00Z' },
  ], '2026-09')

  assert.deepEqual(summary, { incomeMinor: '1000', expenseMinor: '0', netMinor: '1000' })
})

test('excludes transfers from income, expenses, and net', () => {
  const summary = calculateMonthlySummary([
    { type: 'income', amountMinor: '1000', transactionDate: '2026-09-01' },
    { type: 'expense', amountMinor: '400', transactionDate: '2026-09-02' },
    { type: 'transfer', amountMinor: '99999', transactionDate: '2026-09-03' },
  ], '2026-09')

  assert.deepEqual(summary, { incomeMinor: '1000', expenseMinor: '400', netMinor: '600' })
})
