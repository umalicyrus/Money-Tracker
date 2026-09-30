import assert from 'node:assert/strict'
import test from 'node:test'
import { categoryPresentation } from './categoryPresentation.ts'
import type { Category } from './walletSync.ts'

const category = (iconImage: string | null): Category => ({ id: 'food', userId: 'user', version: '1', name: 'Food', type: 'expense', icon: 'food', iconImage, isArchived: false, localStatus: 'synced' })

test('a transaction category presentation uses the current custom image and updates with the category record', () => {
  assert.deepEqual(categoryPresentation([category('data:image/webp;base64,one')], 'food'), { name: 'Food', icon: 'food', image: 'data:image/webp;base64,one' })
  assert.deepEqual(categoryPresentation([category('data:image/webp;base64,two')], 'food'), { name: 'Food', icon: 'food', image: 'data:image/webp;base64,two' })
  assert.deepEqual(categoryPresentation([], 'missing'), { name: 'Unknown category', icon: 'tag', image: null })
})
