import { useCallback, useEffect, useState } from 'react'
import WalletsPage from '../../wallets/pages/WalletsPage'
import HomeDashboard from '../components/HomeDashboard'
import {
  calculateWalletBalance,
  type Transaction,
  type Wallet,
  type Category,
} from '../../wallets/lib/walletSync'
import { calculateMonthlySummary, currentLocalMonth, transactionsForMonth } from '../lib/monthlySummary'
import { expenseTotalsByCategory, incomeExpenseByMonth } from '../lib/chartData'
import { activeWalletRecords } from '../../wallets/lib/walletVisibility'
import ProfileSettingsPage from '../../profile/pages/ProfileSettingsPage'
import AccountMenu from '../../auth/components/AccountMenu'
import AppIcon from '../../../components/AppIcon'
import BrandLogo from '../../../components/BrandLogo'
import '../../transactions/components/TransactionForm.css'

export type DashboardView = 'home' | 'wallets' | 'transactions' | 'more' | 'data-only'

type DashboardPageProps = {
  userId: string
  registrationNotice?: boolean
  onViewChange: (view: DashboardView) => void
  onLogout: () => void
}

export default function DashboardPage({ userId, registrationNotice = false, onViewChange, onLogout }: DashboardPageProps) {
  const [view, setView] = useState<DashboardView>('home')
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedMonth, setSelectedMonth] = useState(() => currentLocalMonth())
  const [transactionType, setTransactionType] = useState<'income' | 'expense' | 'transfer'>('expense')
  const [transactionMode, setTransactionMode] = useState<'history' | 'create'>('history')
  const [transactionNotice, setTransactionNotice] = useState<{ id: string; title: string; detail: string } | null>(null)
  const [settingsPage, setSettingsPage] = useState<'menu' | 'profile' | 'categories' | 'budgets'>('menu')
  const transactionNoticeId = transactionNotice?.id

  useEffect(() => {
    if (!transactionNoticeId) return
    const timeout = window.setTimeout(() => setTransactionNotice(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [transactionNoticeId])

  const changeView = useCallback((nextView: DashboardView) => {
    setView(nextView)
    if (nextView !== 'more') setSettingsPage('menu')
    setTransactionMode('history')
    onViewChange(nextView)
    window.scrollTo(0, 0)
  }, [onViewChange])

  function openTransactionForm(type: 'income' | 'expense' | 'transfer') {
    setTransactionNotice(null)
    setTransactionType(type)
    changeView('transactions')
    setTransactionMode('create')
  }

  function closeTransactionForm(): void {
    setTransactionMode('history')
    window.scrollTo(0, 0)
  }

  function handleTransactionSaved(type: 'income' | 'expense' | 'transfer', transactionId: string, updated = false): void {
    setTransactionMode('history')
    setTransactionNotice({
      id: transactionId,
      title: updated ? 'Transaction updated successfully.' : type === 'transfer' ? 'Transfer saved' : `${type === 'income' ? 'Income' : 'Expense'} saved`,
      detail: 'Waiting to sync',
    })
    window.scrollTo(0, 0)
  }

  function handleTransactionDeleted(transactionId: string, offline: boolean): void {
    setTransactionMode('history')
    setTransactionNotice({
      id: transactionId,
      title: offline ? 'Transaction deleted on this device. Waiting to sync.' : 'Transaction deleted.',
      detail: 'Waiting to sync',
    })
    window.scrollTo(0, 0)
  }

  function handleTransactionSyncState(transactionId: string, state: 'waiting' | 'synced' | 'error'): void {
    setTransactionNotice((notice) => notice?.id === transactionId
      ? { ...notice, detail: state === 'synced' ? 'Synced' : state === 'error' ? 'Needs attention' : 'Waiting to sync' }
      : notice)
  }

  const transactionFormOpen = view === 'transactions' && transactionMode === 'create'
  const visibleTransactionNotice = view === 'transactions' && !transactionFormOpen ? transactionNotice : null

  const activeWallets = activeWalletRecords(wallets)
  const totalBalance = activeWallets
    .reduce((total, wallet) => total + BigInt(calculateWalletBalance(wallet, transactions)), 0n)
    .toString()
  const monthTransactions = transactionsForMonth(transactions, selectedMonth)
  const recentTransactions = monthTransactions
    .sort((left, right) => right.transactionDate.localeCompare(left.transactionDate) || right.id.localeCompare(left.id))
    .slice(0, 3)
  const monthlySummary = calculateMonthlySummary(transactions, selectedMonth)
  const expenseByCategory = expenseTotalsByCategory(transactions, categories, selectedMonth)
  const sixMonthComparison = incomeExpenseByMonth(transactions, selectedMonth)

  return (
    <div className={`app-shell${view === 'home' ? ' home-shell' : ''}${transactionFormOpen ? ' transaction-form-open' : ''}`}>
      <header className={`app-header${transactionFormOpen ? ' app-header-form' : ''}`}>
        {transactionFormOpen && <button type="button" className="app-header-back" aria-label="Back to Transactions" onClick={closeTransactionForm}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button>}
        <div className="brand-lockup"><BrandLogo /><p className="app-name">Money Tracker</p></div>
        <div className="header-actions">
          <AccountMenu userId={userId} onOpenProfile={() => changeView('more')} onLogout={onLogout} />
        </div>
      </header>

      <div className={registrationNotice ? 'account-created-notice app-content' : 'sr-only'} role="status" aria-live="polite" aria-atomic="true">
        {registrationNotice && 'Account created successfully.'}
      </div>

      <div className={visibleTransactionNotice ? 'transaction-save-notice' : 'sr-only'}>
        {visibleTransactionNotice && <span className="transaction-notice-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg></span>}
        <div className="transaction-notice-copy" role="status" aria-live="polite" aria-atomic="true">
          {visibleTransactionNotice && <><strong>{visibleTransactionNotice.title}</strong><span>{visibleTransactionNotice.detail}</span></>}
        </div>
        {visibleTransactionNotice && <button type="button" className="transaction-notice-dismiss" aria-label="Dismiss save notification" onClick={() => setTransactionNotice(null)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>}
      </div>

      <main className="app-content">
        {view === 'home' && <HomeDashboard
          totalBalance={totalBalance}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          summary={monthlySummary}
          recent={recentTransactions}
          categories={categories}
          expenses={expenseByCategory}
          comparison={sixMonthComparison}
          onAdd={openTransactionForm}
          onViewAll={() => changeView('transactions')}
        />}
        {view !== 'home' && view !== 'data-only' && (
          <>
          {view === 'more' && settingsPage === 'menu' && <section className="settings-menu" aria-labelledby="settings-heading"><p className="eyebrow">More</p><h1 id="settings-heading">Settings</h1><p className="settings-intro">Manage your account and app preferences.</p><div className="settings-menu-card"><button type="button" onClick={() => setSettingsPage('profile')}><span className="settings-menu-icon">◉</span><span><strong>Personal details</strong><small>Profile, photo and security</small></span><b>›</b></button><button type="button" onClick={() => setSettingsPage('categories')}><span className="settings-menu-icon">◇</span><span><strong>Categories</strong><small>Income and expense categories</small></span><b>›</b></button><button type="button" onClick={() => setSettingsPage('budgets')}><span className="settings-menu-icon">▥</span><span><strong>Monthly budgets</strong><small>Plan your spending</small></span><b>›</b></button></div></section>}
          {view === 'more' && settingsPage === 'profile' && <section className="settings-subview"><div className="subview-header"><button type="button" className="back-button" aria-label="Back to settings" onClick={() => setSettingsPage('menu')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button><strong>Personal details</strong></div><ProfileSettingsPage userId={userId} onLogout={onLogout} /></section>}
          <WalletsPage
            userId={userId}
            view={view === 'more' && settingsPage !== 'categories' && settingsPage !== 'budgets' ? 'data-only' : view}
            initialTransactionType={transactionType}
            transactionMode={transactionMode}
            initialHistoryMonth={selectedMonth}
            selectedMonth={selectedMonth}
            onSelectedMonthChange={setSelectedMonth}
            onCancelTransaction={closeTransactionForm}
            onTransactionSaved={handleTransactionSaved}
            onTransactionDeleted={handleTransactionDeleted}
            onTransactionSyncState={handleTransactionSyncState}
            moreSection={settingsPage === 'budgets' ? 'budgets' : 'categories'}
            onWalletsChange={setWallets}
            onCategoriesChange={setCategories}
            onTransactionsChange={setTransactions}
          />
          </>
        )}
        {view === 'home' && (
          <WalletsPage
            userId={userId}
            view="data-only"
            initialHistoryMonth={selectedMonth}
            selectedMonth={selectedMonth}
            onSelectedMonthChange={setSelectedMonth}
            onWalletsChange={setWallets}
            onCategoriesChange={setCategories}
            onTransactionsChange={setTransactions}
          />
        )}
      </main>

      {view !== 'data-only' && !transactionFormOpen && (
        <nav className="bottom-nav" aria-label="Main navigation">
          <button type="button" aria-current={view === 'home' ? 'page' : undefined} className={view === 'home' ? 'nav-item nav-item-active' : 'nav-item'} onClick={() => changeView('home')}>
            <AppIcon name="home" />Home
          </button>
          <button type="button" aria-current={view === 'wallets' ? 'page' : undefined} className={view === 'wallets' ? 'nav-item nav-item-active' : 'nav-item'} onClick={() => changeView('wallets')}>
            <AppIcon name="wallets" />Wallets
          </button>
          <button type="button" aria-current={view === 'transactions' ? 'page' : undefined} className={view === 'transactions' ? 'nav-item nav-item-active' : 'nav-item'} onClick={() => changeView('transactions')}>
            <AppIcon name="transactions" />Transactions
          </button>
          <button type="button" aria-current={view === 'more' ? 'page' : undefined} className={view === 'more' ? 'nav-item nav-item-active' : 'nav-item'} onClick={() => changeView('more')}>
            <AppIcon name="more" />More
          </button>
        </nav>
      )}
    </div>
  )
}
