import assert from 'node:assert/strict'
import test from 'node:test'
import { filteredTransactions, groupTransactionsByDay, initialOpenTransactionDate, retainOpenTransactionDate, toggleOpenTransactionDate } from './dailyTransactions.ts'
import type { Transaction } from '../../wallets/lib/walletSync.ts'

const transaction = (id: string, type: Transaction['type'], amountMinor: string, transactionDate: string): Transaction => ({ id, userId: 'user', version: '1', type, amountMinor, transactionDate, walletId: 'wallet', categoryId: 'category', note: null, localStatus: 'synced' })

test('groups selected-month transactions by day with exact income and expense centavos', () => {
  const days = groupTransactionsByDay(filteredTransactions([transaction('one', 'income', '9007199254740993', '2026-09-15'), transaction('two', 'expense', '7', '2026-09-15'), transaction('three', 'expense', '12', '2026-09-14'), transaction('old', 'income', '100', '2026-08-31')], 'all', '2026-09'))
  assert.deepEqual(days.map((day) => [day.date, day.incomeMinor, day.expenseMinor, day.transactions.map((item) => item.id)]), [['2026-09-15', '9007199254740993', '7', ['one', 'two']], ['2026-09-14', '0', '12', ['three']]])
})

test('filters daily groups by transaction type without changing stored transactions', () => {
  const source = [transaction('income', 'income', '2500', '2026-09-15'), transaction('expense', 'expense', '900', '2026-09-15')]
  const days = groupTransactionsByDay(filteredTransactions(source, 'expense', '2026-09'))
  assert.equal(days[0].expenseMinor, '900')
  assert.equal(days[0].incomeMinor, '0')
  assert.deepEqual(days[0].transactions.map((item) => item.id), ['expense'])
  assert.equal(source.length, 2)
})

test('keeps historical transactions readable when their wallet is archived', () => {
  const historical = transaction('history', 'expense', '1200', '2026-09-15')
  historical.walletId = 'archived-wallet'

  assert.deepEqual(filteredTransactions([historical], 'all', '2026-09').map((item) => item.id), ['history'])
})

test('today opens by default and previous dates remain closed', () => {
  const dates = ['2026-10-01', '2026-09-30', '2026-09-29']
  const openDate = initialOpenTransactionDate(dates, '2026-10-01')
  assert.equal(openDate, '2026-10-01')
  assert.equal(dates.filter((date) => date === openDate).length, 1)
  assert.notEqual(openDate, '2026-09-30')
})

test('opening another date closes the previously open date', () => {
  assert.equal(toggleOpenTransactionDate('2026-10-01', '2026-09-30'), '2026-09-30')
})

test('clicking the open date closes it', () => {
  assert.equal(toggleOpenTransactionDate('2026-09-30', '2026-09-30'), null)
})

test('a previous month starts with all date groups closed', () => {
  assert.equal(initialOpenTransactionDate(['2026-09-30', '2026-09-29'], '2026-10-01'), null)
})

test('a filter keeps the open date only while it has matching transactions', () => {
  assert.equal(retainOpenTransactionDate('2026-10-01', ['2026-10-01']), '2026-10-01')
  assert.equal(retainOpenTransactionDate('2026-10-01', ['2026-09-30']), null)
})
