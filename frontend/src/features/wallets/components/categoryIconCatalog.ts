export const categoryIcons = [
  ['tag', 'Tag'], ['food', 'Food'], ['home', 'Home'], ['car', 'Car'], ['gift', 'Gift'], ['health', 'Health'],
  ['groceries', 'Groceries'], ['shopping', 'Shopping'], ['coffee', 'Coffee'], ['transport', 'Transport'], ['phone', 'Phone'], ['utilities', 'Utilities'], ['bills', 'Bills'], ['education', 'Education'],
  ['travel', 'Travel'], ['entertainment', 'Entertainment'], ['clothing', 'Clothing'], ['beauty', 'Beauty'], ['pets', 'Pets'], ['family', 'Family'],
  ['salary', 'Salary'], ['business', 'Business'], ['freelance', 'Freelance'], ['investments', 'Investments'], ['savings', 'Savings'], ['bonus', 'Bonus'],
  ['cash', 'Cash'], ['bank', 'Bank'], ['card', 'Card'], ['insurance', 'Insurance'], ['tax', 'Tax'], ['charity', 'Charity'],
  ['fitness', 'Fitness'], ['music', 'Music'], ['games', 'Games'], ['book', 'Books'], ['other', 'Other'], ['wallet', 'Wallet'],
] as const

export const supportedCategoryIconIds = categoryIcons.map(([id]) => id)
export const isSupportedCategoryIcon = (name: string) => supportedCategoryIconIds.includes(name as typeof supportedCategoryIconIds[number])
