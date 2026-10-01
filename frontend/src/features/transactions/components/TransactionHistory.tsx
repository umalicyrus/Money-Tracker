import { useRef, useState } from 'react'
import './TransactionHistory.css'
import { type Category, type Transaction, type Wallet } from '../../wallets/lib/walletSync'
import { formatMinorUnits } from '../../wallets/lib/money'
import CategoryIcon from '../../wallets/components/CategoryIcon'
import { categoryPresentation } from '../../wallets/lib/categoryPresentation'
import { filteredTransactions, groupTransactionsByDay, initialOpenTransactionDate, retainOpenTransactionDate, toggleOpenTransactionDate, type TransactionFilter } from '../lib/dailyTransactions'
import RecordActionsMenu from '../../../components/RecordActionsMenu'

type Props = {
  transactions: Transaction[]
  wallets: Wallet[]
  categories: Category[]
  initialMonth?: string
  onEdit: (transaction: Transaction) => void
  onDelete: (transaction: Transaction, trigger: HTMLButtonElement) => void
}

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

export default function TransactionHistory({ transactions, wallets, categories, initialMonth = '', onEdit, onDelete }: Props) {
  const [filter, setFilter] = useState<TransactionFilter>('all')
  const [month, setMonth] = useState(initialMonth)
  const [walletId, setWalletId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [noteSearch, setNoteSearch] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [allItemsOpen, setAllItemsOpen] = useState(false)
  const returnScrollY = useRef(0)
  const visible = filteredTransactions(transactions, filter, month).filter((item) => (!walletId || item.walletId === walletId) && (!categoryId || item.categoryId === categoryId) && (!noteSearch || item.note?.toLowerCase().includes(noteSearch.trim().toLowerCase())))
  const days = groupTransactionsByDay(visible)
  const dayDates = days.map((day) => day.date)
  const [openDate, setOpenDate] = useState<string | null>(() => {
    const today = new Date()
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    return initialOpenTransactionDate(dayDates, todayKey)
  })
  const expandedDate = retainOpenTransactionDate(openDate, dayDates)
  const walletNames = new Map(wallets.map((wallet) => [wallet.id, wallet.name]))
  const toggleDay = (date: string) => setOpenDate((current) => toggleOpenTransactionDate(retainOpenTransactionDate(current, dayDates), date))
  function keepMatchingDate(next: { filter?: TransactionFilter; month?: string; walletId?: string; categoryId?: string; noteSearch?: string }) {
    const matching = filteredTransactions(transactions, next.filter ?? filter, next.month ?? month).filter((item) =>
      (!(next.walletId ?? walletId) || item.walletId === (next.walletId ?? walletId)) &&
      (!(next.categoryId ?? categoryId) || item.categoryId === (next.categoryId ?? categoryId)) &&
      (!(next.noteSearch ?? noteSearch) || item.note?.toLowerCase().includes((next.noteSearch ?? noteSearch).trim().toLowerCase())))
    const dates = groupTransactionsByDay(matching).map((day) => day.date)
    setOpenDate((current) => retainOpenTransactionDate(current, dates))
  }
  const clear = () => { keepMatchingDate({ filter: 'all', month: '', walletId: '', categoryId: '', noteSearch: '' }); setFilter('all'); setMonth(''); setWalletId(''); setCategoryId(''); setNoteSearch('') }
  const hasFilters = filter !== 'all' || month !== '' || walletId !== '' || categoryId !== '' || noteSearch !== ''
  const selected = transactions.find((transaction) => transaction.id === selectedItemId && transaction.deletedAt == null)

  if (selected?.items?.length) {
    const category = categoryPresentation(categories, selected.categoryId)
    const shownItems = allItemsOpen ? selected.items : selected.items.slice(0, 3)
    return <section className="transaction-item-detail" aria-labelledby="item-detail-heading">
      <header className="item-detail-header"><button type="button" className="item-detail-back" onClick={() => { setSelectedItemId(null); setAllItemsOpen(false); requestAnimationFrame(() => { window.scrollTo(0, returnScrollY.current); document.querySelector<HTMLButtonElement>(`[data-transaction-items="${selected.id}"]`)?.focus() }) }}><span aria-hidden="true">‹</span> Back</button><h2 id="item-detail-heading">Transaction details</h2></header>
      <div className="item-detail-summary"><CategoryIcon className={categoryTone(category.icon)} name={category.icon} image={category.image} label={category.name} /><div><strong>{category.name}</strong><span>Expense · {walletNames.get(selected.walletId) ?? 'Unknown wallet'}</span><time dateTime={selected.transactionDate}>{new Date(`${selected.transactionDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time></div><strong className="activity-amount-expense">−{formatMinorUnits(selected.amountMinor)}</strong></div>
      <section className="item-detail-card" aria-labelledby="purchased-items-heading"><h3 id="purchased-items-heading">Purchased items</h3><div className="item-detail-table"><div className="item-detail-table-head"><span>Item</span><span>Qty × Price</span><span>Total</span></div>{shownItems.map((item, index) => <div className="item-detail-table-row" key={`${index}-${item.name}`}><strong>{item.name}</strong><span>{item.quantity} × {formatMinorUnits(item.unitPriceMinor)}</span><strong>{formatMinorUnits(item.lineTotalMinor)}</strong></div>)}</div>{selected.items.length > 3 && <button type="button" className="item-detail-more" aria-expanded={allItemsOpen} onClick={() => setAllItemsOpen((open) => !open)}>{allItemsOpen ? 'Show fewer items' : `+ ${selected.items.length - 3} more items`} <ChevronIcon expanded={allItemsOpen} /></button>}<div className="item-detail-total"><strong>Transaction total</strong><strong>{formatMinorUnits(selected.amountMinor)}</strong></div></section>
      <dl className="item-detail-meta"><div><dt>Payment method</dt><dd>{walletNames.get(selected.walletId) ?? 'Unknown wallet'}</dd></div><div><dt>Category</dt><dd>{category.name}</dd></div><div><dt>Notes</dt><dd>{selected.note || '—'}</dd></div></dl>
      <button type="button" className="item-detail-edit" disabled={selected.localStatus !== 'synced'} onClick={() => onEdit(selected)}>Edit transaction</button>
    </section>
  }

  return <section className="transaction-history" aria-label="Transaction history">
    <div className="history-filters" role="group" aria-label="Filter transactions">{(['all', 'income', 'expense', 'transfer'] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => { keepMatchingDate({ filter: value }); setFilter(value) }}>{value === 'all' ? 'All' : value[0].toUpperCase() + value.slice(1)}</button>)}</div>
    <button type="button" className="filters-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}><span><FunnelIcon />Filters</span><ChevronIcon expanded={filtersOpen} /></button>
    {filtersOpen && <div className="history-filter-fields"><label>Month<input type="month" value={month} onChange={(event) => { keepMatchingDate({ month: event.target.value }); setMonth(event.target.value) }} /></label><label>Wallet<select value={walletId} onChange={(event) => { keepMatchingDate({ walletId: event.target.value }); setWalletId(event.target.value) }}><option value="">All wallets</option>{wallets.map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</select></label><label>Category<select value={categoryId} onChange={(event) => { keepMatchingDate({ categoryId: event.target.value }); setCategoryId(event.target.value) }}><option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="history-search">Search notes<input type="search" value={noteSearch} onChange={(event) => { keepMatchingDate({ noteSearch: event.target.value }); setNoteSearch(event.target.value) }} placeholder="e.g. lunch" /></label></div>}
    <div className="history-results"><p className="history-count" aria-live="polite">{visible.length} transaction(s)</p>{hasFilters && <button type="button" className="text-button" onClick={clear}>Clear filters</button>}</div>
    {days.length === 0 ? <p className="empty-copy">No transactions match this filter.</p> : <div className="history-days">{days.map((day) => {
      const expanded = expandedDate === day.date
      return <section className="history-day" key={day.date}><button className="history-day-toggle" type="button" aria-expanded={expanded} aria-label={`${expanded ? 'Collapse' : 'Expand'} transactions for ${new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}`} onClick={() => toggleDay(day.date)}><span className="history-day-date"><strong>{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</strong><small>{day.transactions.length} transaction{day.transactions.length === 1 ? '' : 's'}</small></span><span className="history-day-totals">{filter !== 'expense' && <small className="activity-amount-income">Income {formatMinorUnits(day.incomeMinor)}</small>}{filter !== 'income' && <small className="activity-amount-expense">Expenses {formatMinorUnits(day.expenseMinor)}</small>}</span><span className="history-day-chevron"><ChevronIcon expanded={expanded} /></span></button>{expanded && <ul className="history-list">{day.transactions.map((transaction) => {
        const transfer = transaction.type === 'transfer'; const income = transaction.type === 'income'; const category = categoryPresentation(categories, transaction.categoryId); const icon = transfer ? 'transfer' : category.icon
        const title = transfer ? 'Transfer' : category.name
        return <li className="history-card" key={transaction.id}><div className="history-card-heading"><CategoryIcon className={categoryTone(icon)} name={icon} image={transfer ? null : category.image} label={transfer ? 'Wallet transfer' : category.name} /><span className="history-category"><strong>{transfer ? 'Wallet transfer' : category.name}</strong><small className="history-meta">{transaction.localStatus === 'synced' && <span className="history-synced" role="img" aria-label="Synced">●</span>} {income ? 'Income' : transfer ? 'Transfer' : 'Expense'} <span aria-hidden="true">&middot;</span> {walletNames.get(transaction.walletId) ?? 'Unknown wallet'}{transfer && ` → ${walletNames.get(transaction.destinationWalletId ?? '') ?? 'Unknown wallet'}`}</small></span><strong className={income ? 'activity-amount-income' : transfer ? 'activity-amount-transfer' : 'activity-amount-expense'}>{income ? '+' : transfer ? '↔' : '−'}{formatMinorUnits(transaction.amountMinor)}</strong><RecordActionsMenu label={`Actions for ${title} transaction`} editLabel="Edit" editDisabled={transaction.localStatus !== 'synced'} onEdit={() => onEdit(transaction)} dangerLabel="Delete" dangerAriaLabel={`Delete ${title} transaction`} dangerDisabled={transaction.localStatus !== 'synced'} onDanger={(trigger) => onDelete(transaction, trigger)} /></div>{transaction.note && <p className="history-note">{transaction.note}</p>}{transaction.items && transaction.items.length > 0 && <button type="button" className="history-items-summary" data-transaction-items={transaction.id} onClick={() => { returnScrollY.current = window.scrollY; setAllItemsOpen(false); setSelectedItemId(transaction.id) }}><span>{transaction.items.length} item{transaction.items.length === 1 ? '' : 's'} · {transaction.items.slice(0, 2).map((item) => item.name).join(', ')}{transaction.items.length > 2 ? '…' : ''}</span><span>View details ›</span></button>}{transaction.localStatus !== 'synced' && <p className={`history-status wallet-status-${transaction.localStatus}`}>{transaction.localStatus === 'error' ? transaction.lastError ?? 'Needs attention — retry sync' : 'Waiting to sync'}</p>}</li>
      })}</ul>}</section>
    })}</div>}
  </section>
}
