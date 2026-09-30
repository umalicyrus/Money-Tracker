import assert from 'node:assert/strict'
import test from 'node:test'
import { expenseTotalsByCategory, incomeExpenseByMonth, lastSixMonths, percentageOfTotal, totalExpenseMinor } from './chartData.ts'

test('groups selected-month expenses by category with exact centavos', () => {
  const totals = expenseTotalsByCategory([
    { type: 'expense', categoryId: 'food', amountMinor: '9007199254740993', transactionDate: '2026-09-01' },
    { type: 'expense', categoryId: 'food', amountMinor: '7', transactionDate: '2026-09-30' },
    { type: 'expense', categoryId: 'travel', amountMinor: '500', transactionDate: '2026-09-30' },
    { type: 'expense', categoryId: 'food', amountMinor: '10', transactionDate: '2026-10-01' },
    { type: 'expense', categoryId: 'food', amountMinor: '10', transactionDate: '2026-09-02', deletedAt: '2026-09-03T00:00:00Z' },
  ], [{ id: 'food', name: 'Food' }, { id: 'travel', name: 'Travel' }], '2026-09')

  assert.deepEqual(totals, [
    { categoryId: 'food', categoryName: 'Food', amountMinor: '9007199254741000' },
    { categoryId: 'travel', categoryName: 'Travel', amountMinor: '500' },
  ])
  assert.equal(totalExpenseMinor(totals), '9007199254741500')
  assert.equal(percentageOfTotal('500', '9007199254741500'), '0.0')
})

test('compares income and expenses across the six local calendar months', () => {
  assert.deepEqual(lastSixMonths('2026-01'), ['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01'])
  const months = incomeExpenseByMonth([
    { type: 'income', categoryId: 'salary', amountMinor: '10000', transactionDate: '2025-12-31' },
    { type: 'expense', categoryId: 'food', amountMinor: '2500', transactionDate: '2026-01-01' },
    { type: 'income', categoryId: 'salary', amountMinor: '1', transactionDate: '2025-07-31' },
    { type: 'transfer', categoryId: null, amountMinor: '999999', transactionDate: '2026-01-02' },
  ], '2026-01')

  assert.deepEqual(months.at(-2), { month: '2025-12', incomeMinor: '10000', expenseMinor: '0' })
  assert.deepEqual(months.at(-1), { month: '2026-01', incomeMinor: '0', expenseMinor: '2500' })
  assert.deepEqual(months.filter((month) => month.incomeMinor === '0' && month.expenseMinor === '0').map((month) => month.month), ['2025-08', '2025-09', '2025-10', '2025-11'])
})
