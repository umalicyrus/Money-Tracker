import { useState } from 'react'
import './TransactionHistory.css'
import { type Category, type Transaction, type Wallet } from '../../wallets/lib/walletSync'
import { formatMinorUnits } from '../../wallets/lib/money'
import CategoryIcon from '../../wallets/components/CategoryIcon'
import { categoryPresentation } from '../../wallets/lib/categoryPresentation'
import { filteredTransactions, groupTransactionsByDay, type TransactionFilter } from '../lib/dailyTransactions'

type Props = { transactions: Transaction[]; wallets: Wallet[]; categories: Category[]; initialMonth?: string }

function FunnelIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6.5 7.5v5.25l-3 1.5V12.5z" /></svg>
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return <svg className={expanded ? 'history-chevron history-chevron-expanded' : 'history-chevron'} viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
}

function categoryTone(icon: string) {
  if (icon === 'food' || icon === 'groceries' || icon === 'coffee') return 'history-icon-food'
  if (icon === 'transport' || icon === 'car' || icon === 'salary' || icon === 'savings') return 'history-icon-mint'
  return 'history-icon-lavender'
}

export default function TransactionHistory({ transactions, wallets, categories, initialMonth = '' }: Props) {
  const [filter, setFilter] = useState<TransactionFilter>('all')
  const [month, setMonth] = useState(initialMonth)
  const [walletId, setWalletId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [noteSearch, setNoteSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set())
  const visible = filteredTransactions(transactions, filter, month).filter((item) => (!walletId || item.walletId === walletId) && (!categoryId || item.categoryId === categoryId) && (!noteSearch || item.note?.toLowerCase().includes(noteSearch.trim().toLowerCase())))
  const days = groupTransactionsByDay(visible)
  const walletNames = new Map(wallets.map((wallet) => [wallet.id, wallet.name]))
  const resetDays = () => setCollapsedDays(new Set())
  const toggleDay = (date: string) => { setCollapsedDays((old) => { const next = new Set(old); if (next.has(date)) next.delete(date); else next.add(date); return next }) }
  const clear = () => { setFilter('all'); setMonth(''); setWalletId(''); setCategoryId(''); setNoteSearch(''); resetDays() }
  const hasFilters = filter !== 'all' || month !== '' || walletId !== '' || categoryId !== '' || noteSearch !== ''

  return <section className="transaction-history" aria-label="Transaction history">
    <div className="history-filters" role="group" aria-label="Filter transactions">{(['all', 'income', 'expense', 'transfer'] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); resetDays() }}>{value === 'all' ? 'All' : value[0].toUpperCase() + value.slice(1)}</button>)}</div>
    <button type="button" className="filters-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}><span><FunnelIcon />Filters</span><ChevronIcon expanded={filtersOpen} /></button>
    {filtersOpen && <div className="history-filter-fields"><label>Month<input type="month" value={month} onChange={(event) => { setMonth(event.target.value); resetDays() }} /></label><label>Wallet<select value={walletId} onChange={(event) => { setWalletId(event.target.value); resetDays() }}><option value="">All wallets</option>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</select></label><label>Category<select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); resetDays() }}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="history-search">Search notes<input type="search" value={noteSearch} onChange={(event) => { setNoteSearch(event.target.value); resetDays() }} placeholder="e.g. lunch" /></label></div>}
    <div className="history-results"><p className="history-count" aria-live="polite">{visible.length} transaction(s)</p>{hasFilters && <button type="button" className="text-button" onClick={clear}>Clear filters</button>}</div>
    {days.length === 0 ? <p className="empty-copy">No transactions match this filter.</p> : <div className="history-days">{days.map((day) => {
      const expanded = !collapsedDays.has(day.date)
      return <section className="history-day" key={day.date}><button className="history-day-toggle" type="button" aria-expanded={expanded} onClick={() => toggleDay(day.date)}><span className="history-day-date"><strong>{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</strong><small>{day.transactions.length} transaction{day.transactions.length === 1 ? '' : 's'}</small></span><span className="history-day-totals">{filter !== 'expense' && <small className="activity-amount-income">Income {formatMinorUnits(day.incomeMinor)}</small>}{filter !== 'income' && <small className="activity-amount-expense">Expenses {formatMinorUnits(day.expenseMinor)}</small>}</span><span className="history-day-chevron"><ChevronIcon expanded={expanded} /></span></button>{expanded && <ul className="history-list">{day.transactions.map((transaction) => {
        const transfer = transaction.type === 'transfer'; const income = transaction.type === 'income'; const category = categoryPresentation(categories, transaction.categoryId); const icon = transfer ? 'transfer' : category.icon
        return <li className="history-card" key={transaction.id}><div className="history-card-heading"><CategoryIcon className={categoryTone(icon)} name={icon} image={transfer ? null : category.image} label={transfer ? 'Wallet transfer' : category.name} /><span className="history-category"><strong>{transfer ? 'Wallet transfer' : category.name}</strong><small className="history-meta">{transaction.localStatus === 'synced' && <span className="history-synced" role="img" aria-label="Synced">●</span>} {income ? 'Income' : transfer ? 'Transfer' : 'Expense'} <span aria-hidden="true">&middot;</span> {walletNames.get(transaction.walletId) ?? 'Unknown wallet'}{transfer && ` → ${walletNames.get(transaction.destinationWalletId ?? '') ?? 'Unknown wallet'}`}</small></span><strong className={income ? 'activity-amount-income' : transfer ? 'activity-amount-transfer' : 'activity-amount-expense'}>{income ? '+' : transfer ? '↔' : '−'}{formatMinorUnits(transaction.amountMinor)}</strong></div>{transaction.note && <p className="history-note">{transaction.note}</p>}{transaction.items && transaction.items.length > 0 && <details className="history-details"><summary>Item details</summary><p>{transaction.transactionDate}</p>{transaction.items && transaction.items.length > 0 && <ul>{transaction.items.map((item, index) => <li key={index}><span>{item.name} × {item.quantity}</span><strong>{formatMinorUnits(item.lineTotalMinor)}</strong></li>)}</ul>}</details>}{transaction.localStatus !== 'synced' && <p className={`history-status wallet-status-${transaction.localStatus}`}>{transaction.localStatus === 'error' ? 'Needs attention — retry sync' : 'Waiting to sync'}</p>}</li>
      })}</ul>}</section>
    })}</div>}
  </section>
}
