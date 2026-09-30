import { useState } from 'react'
import AppIcon from '../../../components/AppIcon'
import CategoryIcon from '../../wallets/components/CategoryIcon'
import { categoryPresentation } from '../../wallets/lib/categoryPresentation'
import { formatMinorUnits } from '../../wallets/lib/money'
import type { Category, Transaction } from '../../wallets/lib/walletSync'
import type { MonthlySummary } from '../lib/monthlySummary'
import type { ExpenseCategoryTotal, MonthlyComparison } from '../lib/chartData'
import ExpensePieChart from './ExpensePieChart'
import IncomeExpenseBarChart from './IncomeExpenseBarChart'
import './HomeDashboard.css'

type Props = {
  totalBalance: string
  selectedMonth: string
  onMonthChange: (month: string) => void
  summary: MonthlySummary
  recent: Transaction[]
  categories: Category[]
  expenses: ExpenseCategoryTotal[]
  comparison: MonthlyComparison[]
  onAdd: (type: 'income' | 'expense' | 'transfer') => void
  onViewAll: () => void
}

function monthLabel(month: string, short = false) {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, { month: short ? 'short' : 'long', year: 'numeric' })
}

function Chevron({ next = false }: { next?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={next ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'} /></svg>
}

export default function HomeDashboard({ totalBalance, selectedMonth, onMonthChange, summary, recent, categories, expenses, comparison, onAdd, onViewAll }: Props) {
  const [balanceVisible, setBalanceVisible] = useState(true)
  function shiftMonth(offset: number) {
    const date = new Date(`${selectedMonth}-01T12:00:00`)
    date.setMonth(date.getMonth() + offset)
    onMonthChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  return <section className="home-dashboard" aria-labelledby="home-heading">
    <div className="home-intro"><p>Overview</p><h1 id="home-heading">Your money, at a glance</h1></div>
    <section className="home-balance" aria-label="Overall wallet balance">
      <div><span>Total balance</span><button type="button" aria-label={balanceVisible ? 'Hide total balance' : 'Show total balance'} aria-pressed={!balanceVisible} onClick={() => setBalanceVisible(!balanceVisible)}><AppIcon name={balanceVisible ? 'eye' : 'eye-off'} /></button></div>
      <strong aria-label={balanceVisible ? undefined : 'Balance hidden'}>{balanceVisible ? formatMinorUnits(totalBalance) : '••••••'}</strong>
      <p>Across your active wallets</p>
    </section>
    <div className="home-actions">
      {(['income', 'expense', 'transfer'] as const).map(type => <button key={type} type="button" className={`home-action home-action-${type}`} onClick={() => onAdd(type)}>
        <span className="home-action-icon">{type === 'expense' ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg> : <AppIcon name={type === 'income' ? 'plus' : 'transactions'} />}</span>
        <span><strong>{type[0].toUpperCase() + type.slice(1)}</strong><small>{type === 'transfer' ? 'Move money' : type === 'income' ? 'Add money' : 'Add expense'}</small></span>
      </button>)}
    </div>
    <section className="home-section" aria-labelledby="home-monthly-heading">
      <div className="home-section-heading"><h2 id="home-monthly-heading">Monthly overview</h2><div className="home-month-control">
        <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}><Chevron /></button>
        <label><span>{monthLabel(selectedMonth)}</span><input aria-label="Overview month" type="month" value={selectedMonth} min="0001-01" max="9999-12" onChange={event => { if (/^\d{4}-\d{2}$/.test(event.target.value)) onMonthChange(event.target.value) }} /></label>
        <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}><Chevron next /></button>
      </div></div>
      <div className="home-summary" aria-live="polite">
        <div><span>Income</span><strong className="home-income">{formatMinorUnits(summary.incomeMinor)}</strong></div>
        <div><span>Expenses</span><strong className="home-expense">{formatMinorUnits(summary.expenseMinor)}</strong></div>
        <div><span>Net cash flow</span><strong className={BigInt(summary.netMinor) < 0n ? 'home-expense' : 'home-income'}>{formatMinorUnits(summary.netMinor)}</strong></div>
      </div>
    </section>
    <section className="home-section" aria-labelledby="home-recent-heading">
      <div className="home-section-heading"><div><h2 id="home-recent-heading">Recent activity</h2><p>{monthLabel(selectedMonth)}</p></div><button type="button" className="home-view-all" onClick={onViewAll}>View all</button></div>
      {recent.length === 0 ? <p className="home-empty">No activity for {monthLabel(selectedMonth)}.</p> : <ul className="home-recent-list">{recent.map(transaction => {
        const category = categoryPresentation(categories, transaction.categoryId)
        const transfer = transaction.type === 'transfer'
        return <li key={transaction.id}>
          <span className={`home-category-icon home-category-${transaction.type}`}><CategoryIcon name={transfer ? 'transfer' : category.icon} image={transfer ? null : category.image} label={transfer ? 'Transfer' : category.name} /></span>
          <div className="home-recent-description"><strong>{transfer ? 'Transfer' : category.name}</strong><span><time dateTime={transaction.transactionDate}>{new Date(`${transaction.transactionDate}T12:00:00`).toLocaleDateString(undefined, { month:'short', day:'numeric' })}</time>{transaction.note && ` · ${transaction.note}`}</span>{transaction.localStatus !== 'synced' && <small className={transaction.localStatus === 'error' ? 'home-expense' : ''}>{transaction.localStatus === 'error' ? 'Needs attention' : 'Waiting to sync'}</small>}</div>
          <strong className={`home-recent-amount ${transaction.type === 'income' ? 'home-income' : transfer ? '' : 'home-expense'}`}>{transaction.type === 'income' ? '+' : transfer ? '' : '−'}{formatMinorUnits(transaction.amountMinor)}</strong>
        </li>
      })}</ul>}
    </section>
    <section className="home-section" aria-labelledby="home-spending-heading"><div className="home-section-heading"><h2 id="home-spending-heading">Spending breakdown</h2></div><div className="home-chart-panel"><ExpensePieChart key={selectedMonth} totals={expenses} /></div></section>
    <section className="home-section" aria-labelledby="home-comparison-heading"><div className="home-section-heading"><h2 id="home-comparison-heading">Income vs expenses</h2><span className="home-range">{comparison[0] && monthLabel(comparison[0].month, true)} – {monthLabel(selectedMonth, true)}</span></div><div className="home-chart-panel"><div className="home-chart-key"><span><i className="home-key-income" />Income</span><span><i className="home-key-expense" />Expenses</span></div><IncomeExpenseBarChart key={selectedMonth} months={comparison} /></div></section>
  </section>
}
