import type { Transaction } from '../../wallets/lib/walletSync'

export type TransactionFilter = 'all' | 'income' | 'expense' | 'transfer'

export type DailyTransactions = { date: string, transactions: Transaction[], incomeMinor: string, expenseMinor: string }

export function filteredTransactions(transactions: Transaction[], filter: TransactionFilter, month: string): Transaction[] {
  return transactions.filter((transaction) => transaction.deletedAt == null && (filter === 'all' || transaction.type === filter) && (!month || transaction.transactionDate.startsWith(`${month}-`))).sort((left, right) => right.transactionDate.localeCompare(left.transactionDate) || left.id.localeCompare(right.id))
}

export function groupTransactionsByDay(transactions: Transaction[]): DailyTransactions[] {
  const groups = new Map<string, DailyTransactions>()
  for (const transaction of transactions) {
    const group = groups.get(transaction.transactionDate) ?? { date: transaction.transactionDate, transactions: [], incomeMinor: '0', expenseMinor: '0' }
    group.transactions.push(transaction)
    if (transaction.type === 'income') group.incomeMinor = (BigInt(group.incomeMinor) + BigInt(transaction.amountMinor)).toString()
    if (transaction.type === 'expense') group.expenseMinor = (BigInt(group.expenseMinor) + BigInt(transaction.amountMinor)).toString()
    groups.set(transaction.transactionDate, group)
  }
  return [...groups.values()].sort((left, right) => right.date.localeCompare(left.date))
}

export function initialOpenTransactionDate(dates: readonly string[], today: string): string | null {
  return dates.includes(today) ? today : null
}

export function toggleOpenTransactionDate(openDate: string | null, date: string): string | null {
  return openDate === date ? null : date
}

export function retainOpenTransactionDate(openDate: string | null, dates: readonly string[]): string | null {
  return openDate !== null && dates.includes(openDate) ? openDate : null
}
