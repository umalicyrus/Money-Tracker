export type WalletVisibilityRecord = { isArchived: boolean; deletedAt?: string | null }

export function activeWalletRecords<T extends WalletVisibilityRecord>(wallets: T[]): T[] {
  return wallets.filter((wallet) => !wallet.isArchived && wallet.deletedAt == null)
}
