import { useCallback, useState } from 'react'
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
import ProfileSettingsPage from '../../profile/pages/ProfileSettingsPage'
import AccountMenu from '../../auth/components/AccountMenu'
import AppIcon from '../../../components/AppIcon'

export type DashboardView = 'home' | 'wallets' | 'transactions' | 'more' | 'data-only'

type DashboardPageProps = {
  userId: string
  onViewChange: (view: DashboardView) => void
  onLogout: () => void
}

export default function DashboardPage({ userId, onViewChange, onLogout }: DashboardPageProps) {
  const [view, setView] = useState<DashboardView>('home')
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedMonth, setSelectedMonth] = useState(() => currentLocalMonth())
  const [transactionType, setTransactionType] = useState<'income' | 'expense' | 'transfer'>('expense')
  const [transactionMode, setTransactionMode] = useState<'history' | 'create'>('history')
  const [settingsPage, setSettingsPage] = useState<'menu' | 'profile' | 'categories' | 'budgets'>('menu')

  const changeView = useCallback((nextView: DashboardView) => {
    setView(nextView)
    if (nextView !== 'more') setSettingsPage('menu')
    setTransactionMode('history')
    onViewChange(nextView)
    window.scrollTo(0, 0)
  }, [onViewChange])

  function openTransactionForm(type: 'income' | 'expense' | 'transfer') {
    setTransactionType(type)
    changeView('transactions')
    setTransactionMode('create')
  }

  const activeWallets = wallets.filter((wallet) => wallet.deletedAt == null)
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
    <div className={view === 'home' ? 'app-shell home-shell' : 'app-shell'}>
      <header className="app-header">
        <div className="brand-lockup"><span className="brand-logo" aria-hidden="true"><AppIcon name="brand" /></span><p className="app-name">Money Tracker</p></div>
        <div className="header-actions">
          <AccountMenu userId={userId} onOpenProfile={() => changeView('more')} onLogout={onLogout} />
        </div>
      </header>

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
            onCancelTransaction={() => changeView('home')}
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

      {view !== 'data-only' && (
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
