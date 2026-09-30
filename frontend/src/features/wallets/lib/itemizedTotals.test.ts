import assert from 'node:assert/strict'
import test from 'node:test'
import { formatMinorUnits } from './money.ts'
import { itemizedTotalMinor, itemizedTransactionItems } from './itemizedTotals.ts'

test('itemized expenses calculate exact centavo line and transaction totals', () => {
  const items = itemizedTransactionItems([
    { name: 'Rice', quantity: '2', unitPrice: '450.00' },
    { name: 'Fruit', quantity: '3', unitPrice: '170' },
  ])

  assert.deepEqual(items.map(({ name, quantity, unitPriceMinor, lineTotalMinor }) => ({ name, quantity, unitPriceMinor, lineTotalMinor })), [
    { name: 'Rice', quantity: 2, unitPriceMinor: '45000', lineTotalMinor: '90000' },
    { name: 'Fruit', quantity: 3, unitPriceMinor: '17000', lineTotalMinor: '51000' },
  ])
  assert.equal(itemizedTotalMinor([
    { name: 'Rice', quantity: '2', unitPrice: '450.00' },
    { name: 'Fruit', quantity: '3', unitPrice: '170' },
  ]), '141000')
})

test('PHP formatting has thousands separators and exactly two decimal places', () => {
  assert.equal(formatMinorUnits('141000'), '₱1,410.00')
  assert.equal(formatMinorUnits('5'), '₱0.05')
  assert.equal(formatMinorUnits('-141000'), '-₱1,410.00')
})

test('itemized expenses reject invalid quantities and non-positive prices', () => {
  assert.throws(() => itemizedTransactionItems([{ name: 'Rice', quantity: '1.5', unitPrice: '450' }]))
  assert.throws(() => itemizedTransactionItems([{ name: 'Rice', quantity: '1', unitPrice: '0' }]))
})
