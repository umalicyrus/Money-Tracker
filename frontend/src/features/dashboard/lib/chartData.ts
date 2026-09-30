export type ChartTransaction = { type: 'income' | 'expense' | 'transfer'; categoryId: string | null; amountMinor: string; transactionDate: string; deletedAt?: string | null }
export type ChartCategory = { id: string; name: string }

export type ExpenseCategoryTotal = { categoryId: string; categoryName: string; amountMinor: string }
export type MonthlyComparison = { month: string; incomeMinor: string; expenseMinor: string }

export function totalExpenseMinor(totals: ExpenseCategoryTotal[]): string {
  return totals.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n).toString()
}

export function percentageOfTotal(amountMinor: string, totalMinor: string): string {
  const total = BigInt(totalMinor)
  if (total === 0n) return '0.0'

  const tenths = BigInt(amountMinor) * 1000n / total
  return `${tenths / 10n}.${tenths % 10n}`
}

export function expenseTotalsByCategory(transactions: ChartTransaction[], categories: ChartCategory[], month: string): ExpenseCategoryTotal[] {
  const names = new Map(categories.map((category) => [category.id, category.name]))
  const totals = new Map<string, bigint>()

  for (const transaction of transactions) {
    if (transaction.type !== 'expense' || transaction.deletedAt != null || !transaction.transactionDate.startsWith(`${month}-`)) continue
    if (transaction.categoryId === null) continue
    totals.set(transaction.categoryId, (totals.get(transaction.categoryId) ?? 0n) + BigInt(transaction.amountMinor))
  }

  return [...totals.entries()]
    .map(([categoryId, amount]) => ({ categoryId, categoryName: names.get(categoryId) ?? 'Uncategorized', amountMinor: amount.toString() }))
    .sort((left, right) => BigInt(right.amountMinor) > BigInt(left.amountMinor) ? 1 : BigInt(right.amountMinor) < BigInt(left.amountMinor) ? -1 : 0)
}

export function lastSixMonths(selectedMonth: string): string[] {
  const [year, month] = selectedMonth.split('-').map(Number)
  const months: string[] = []

  for (let offset = 5; offset >= 0; offset -= 1) {
    const totalMonths = year * 12 + month - 1 - offset
    const nextYear = Math.floor(totalMonths / 12)
    const nextMonth = totalMonths % 12 + 1
    months.push(`${nextYear}-${String(nextMonth).padStart(2, '0')}`)
  }

  return months
}

export function incomeExpenseByMonth(transactions: ChartTransaction[], selectedMonth: string): MonthlyComparison[] {
  const totals = new Map(lastSixMonths(selectedMonth).map((month) => [month, { income: 0n, expense: 0n }]))

  for (const transaction of transactions) {
    const month = transaction.transactionDate.slice(0, 7)
    const total = totals.get(month)
    if (!total || transaction.deletedAt != null) continue
    if (transaction.type === 'income') total.income += BigInt(transaction.amountMinor)
    else if (transaction.type === 'expense') total.expense += BigInt(transaction.amountMinor)
  }

  return [...totals.entries()].map(([month, total]) => ({ month, incomeMinor: total.income.toString(), expenseMinor: total.expense.toString() }))
}
