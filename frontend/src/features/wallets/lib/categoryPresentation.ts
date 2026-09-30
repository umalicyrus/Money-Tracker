import type { Category } from './walletSync'

export type CategoryPresentation = { name: string; icon: string; image: string | null }

const fallback: CategoryPresentation = { name: 'Unknown category', icon: 'tag', image: null }

/** Always resolve presentation from the current category record, never a transaction snapshot. */
export function categoryPresentation(categories: Category[], categoryId: string | null | undefined): CategoryPresentation {
  const category = categories.find((item) => item.id === categoryId)
  return category ? { name: category.name, icon: category.icon, image: category.iconImage ?? null } : fallback
}
