import { parseMinorUnits } from './money.ts'

export type ItemInput = { name: string; quantity: string; unitPrice: string }
export type TransactionItem = { name: string; quantity: number; unitPriceMinor: string; lineTotalMinor: string }

export function itemizedTransactionItems(items: ItemInput[]): TransactionItem[] {
  return items.map((item) => {
    const name = item.name.trim()
    const quantity = Number(item.quantity)
    if (!name || name.length > 100) throw new Error('Enter an item name of 100 characters or fewer.')
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9999) throw new Error('Enter a whole quantity between 1 and 9,999.')
    const unitPriceMinor = parseMinorUnits(item.unitPrice)
    if (BigInt(unitPriceMinor) <= 0n) throw new Error('Enter a unit price greater than zero.')
    return { name, quantity, unitPriceMinor, lineTotalMinor: (BigInt(unitPriceMinor) * BigInt(quantity)).toString() }
  })
}

export function itemizedTotalMinor(items: ItemInput[]): string {
  return itemizedTransactionItems(items).reduce((total, item) => total + BigInt(item.lineTotalMinor), 0n).toString()
}

export function requireMatchingItemSubtotal(amountMinor: string, items: TransactionItem[]): void {
  const subtotal = items.reduce((total, item) => total + BigInt(item.lineTotalMinor), 0n)
  if (BigInt(amountMinor) !== subtotal) {
    throw new Error('Expense amount and items subtotal must match. Update the amount or item details before saving.')
  }
}
