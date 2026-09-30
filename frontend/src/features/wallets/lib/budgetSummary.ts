export type BudgetSummaryBudget = {
  id: string
  categoryId: string
  limitMinor: string
  monthStart: string
  deletedAt?: string | null
}

export type BudgetSummaryCategory = { id: string; name: string; type: 'income' | 'expense' }
export type BudgetSummaryTransaction = { type: 'income' | 'expense' | 'transfer'; categoryId: string | null; amountMinor: string; transactionDate: string; deletedAt?: string | null }

export type BudgetProgress = {
  id: string
  categoryName: string
  limitMinor: string
  spentMinor: string
  remainingMinor: string
  percentageUsed: string
  progressPercent: number
}

function percentageUsed(spent: bigint, limit: bigint): string {
  const tenths = spent * 1000n / limit
  return `${tenths / 10n}.${tenths % 10n}`
}

export function calculateBudgetProgress(
  budgets: BudgetSummaryBudget[],
  categories: BudgetSummaryCategory[],
  transactions: BudgetSummaryTransaction[],
  month: string,
): BudgetProgress[] {
  const categoryNames = new Map(categories.filter((category) => category.type === 'expense').map((category) => [category.id, category.name]))
  const monthPrefix = `${month}-`

  return budgets
    .filter((budget) => budget.deletedAt == null && budget.monthStart === `${month}-01` && categoryNames.has(budget.categoryId))
    .map((budget) => {
      const spent = transactions
        .filter((transaction) => transaction.deletedAt == null && transaction.type === 'expense' && transaction.categoryId === budget.categoryId && transaction.transactionDate.startsWith(monthPrefix))
        .reduce((total, transaction) => total + BigInt(transaction.amountMinor), 0n)
      const limit = BigInt(budget.limitMinor)

      return {
        id: budget.id,
        categoryName: categoryNames.get(budget.categoryId) ?? 'Expense category',
        limitMinor: budget.limitMinor,
        spentMinor: spent.toString(),
        remainingMinor: (limit - spent).toString(),
        percentageUsed: percentageUsed(spent, limit),
        progressPercent: spent >= limit ? 100 : Number(spent * 10000n / limit) / 100,
      }
    })
}
