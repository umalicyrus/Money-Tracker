export type BalanceWallet = { id: string; openingBalanceMinor: string }
export type BalanceTransaction = {
  type: 'income' | 'expense' | 'transfer'
  walletId: string
  destinationWalletId?: string
  amountMinor: string
  deletedAt?: string | null
}

export function calculateWalletBalance(wallet: BalanceWallet, transactions: BalanceTransaction[]): string {
  return transactions.reduce((balance, transaction) => {
    if (transaction.deletedAt != null) return balance
    const amount = BigInt(transaction.amountMinor)
    if (transaction.type === 'transfer') {
      if (transaction.walletId === wallet.id) return balance - amount
      if (transaction.destinationWalletId === wallet.id) return balance + amount
      return balance
    }
    if (transaction.walletId !== wallet.id) return balance
    return transaction.type === 'income' ? balance + amount : balance - amount
  }, BigInt(wallet.openingBalanceMinor)).toString()
}
