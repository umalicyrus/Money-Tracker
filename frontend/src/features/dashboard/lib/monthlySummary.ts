export type MonthlySummaryTransaction = {
  type: 'income' | 'expense' | 'transfer'
  amountMinor: string
  transactionDate: string
  deletedAt?: string | null
  localStatus?: 'pending' | 'synced' | 'error'
}

export type MonthlySummary = {
  incomeMinor: string
  expenseMinor: string
  netMinor: string
}

export function currentLocalMonth(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function transactionsForMonth<T extends { transactionDate: string; deletedAt?: string | null }>(
  transactions: T[],
  month: string,
): T[] {
  return transactions.filter((transaction) => transaction.deletedAt == null && transaction.transactionDate.startsWith(`${month}-`))
}

export function calculateMonthlySummary(
  transactions: MonthlySummaryTransaction[],
  month: string,
): MonthlySummary {
  let incomeMinor = 0n
  let expenseMinor = 0n

  for (const transaction of transactionsForMonth(transactions, month)) {

    const amountMinor = BigInt(transaction.amountMinor)
    if (transaction.type === 'income') {
      incomeMinor += amountMinor
    } else if (transaction.type === 'expense') {
      expenseMinor += amountMinor
    }
  }

  return {
    incomeMinor: incomeMinor.toString(),
    expenseMinor: expenseMinor.toString(),
    netMinor: (incomeMinor - expenseMinor).toString(),
  }
}
