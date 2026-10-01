import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import TransactionHistory from '../../transactions/components/TransactionHistory'
import type { FormEvent } from 'react'
import {
  calculateWalletBalance,
  archiveWalletAndOperation,
  deleteTransactionAndOperation,
  downloadServerRecords,
  listBudgets,
  listCategories,
  listTransactions,
  listWallets,
  pendingOperationCount,
  saveCategoryAndOperation,
  saveBudgetAndOperation,
  saveTransferAndOperation,
  saveTransactionAndOperation,
  saveWalletAndOperation,
  syncPendingOperations,
  updateCategoryAndOperation,
  updateTransactionAndOperation,
  updateWalletAndOperation,
  decimalAmountFromMinor,
  type Wallet,
  type Budget,
  type Category,
  type CategoryType,
  type Transaction,
  type WalletType,
} from '../lib/walletSync'
import { formatMinorUnits } from '../lib/money'
import { calculateBudgetProgress } from '../lib/budgetSummary'
import { itemizedTotalMinor, itemizedTransactionItems, type ItemInput } from '../lib/itemizedTotals'
import { activeWalletRecords } from '../lib/walletVisibility'
import CategoryIcon from '../components/CategoryIcon'
import { categoryIcons } from '../components/categoryIconCatalog'
import AppIcon from '../../../components/AppIcon'
import RecordActionsMenu from '../../../components/RecordActionsMenu'
import ConfirmActionDialog from '../../../components/ConfirmActionDialog'
import './WalletsPage.css'

const maxCategoryImageBytes = 60 * 1024

async function makeCategoryThumbnail(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.')
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.')
  const source = await createImageBitmap(file)
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image processing is not available in this browser.')
  const scale = Math.max(128 / source.width, 128 / source.height)
  const width = source.width * scale; const height = source.height * scale
  context.drawImage(source, (128 - width) / 2, (128 - height) / 2, width, height); source.close()
  const result = canvas.toDataURL('image/webp', 0.78)
  if (result.length > maxCategoryImageBytes) throw new Error('This image cannot be reduced to a small enough category thumbnail.')
  return result
}

type WalletsPageProps = {
  userId: string
  view: 'wallets' | 'transactions' | 'more' | 'data-only'
  initialTransactionType?: 'income' | 'expense' | 'transfer'
  transactionMode?: 'history' | 'create'
  initialHistoryMonth?: string
  selectedMonth?: string
  onSelectedMonthChange?: (month: string) => void
  onCancelTransaction?: () => void
  onTransactionSaved?: (type: 'income' | 'expense' | 'transfer', transactionId: string, updated?: boolean) => void
  onTransactionDeleted?: (transactionId: string, offline: boolean) => void
  onTransactionSyncState?: (transactionId: string, state: 'waiting' | 'synced' | 'error') => void
  moreSection?: 'categories' | 'budgets'
  onWalletsChange: (wallets: Wallet[]) => void
  onCategoriesChange: (categories: Category[]) => void
  onTransactionsChange: (transactions: Transaction[]) => void
}

const today = new Date().toISOString().slice(0, 10)
const currentMonth = () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

export default function WalletsPage({
  userId,
  view,
  initialTransactionType = 'expense',
  transactionMode = 'history',
  initialHistoryMonth,
  selectedMonth,
  onSelectedMonthChange,
  onCancelTransaction,
  onTransactionSaved,
  onTransactionDeleted,
  onTransactionSyncState,
  moreSection = 'categories',
  onWalletsChange,
  onCategoriesChange,
  onTransactionsChange,
}: WalletsPageProps) {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [name, setName] = useState('')
  const [type, setType] = useState<WalletType>('cash')
  const [walletFormOpen, setWalletFormOpen] = useState(false)
  const [editingWalletId, setEditingWalletId] = useState<string | null>(null)
  const [amountsVisible, setAmountsVisible] = useState(true)
  const walletTriggerRef = useRef<HTMLButtonElement | null>(null)
  const walletNameRef = useRef<HTMLInputElement | null>(null)
  const [openingBalance, setOpeningBalance] = useState('0.00')
  const [openingDate, setOpeningDate] = useState(today)
  const [formError, setFormError] = useState('')
  const [storageError, setStorageError] = useState('')
  const [status, setStatus] = useState('')
  const [walletNotice, setWalletNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryName, setCategoryName] = useState('')
  const [categoryDescription, setCategoryDescription] = useState('')
  const [categoryType, setCategoryType] = useState<CategoryType>('expense')
  const [categoryIcon, setCategoryIcon] = useState('tag')
  const [categoryIconImage, setCategoryIconImage] = useState<string | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [categoryTab, setCategoryTab] = useState<CategoryType>('expense')
  const [openCategoryMenu, setOpenCategoryMenu] = useState<string | null>(null)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [iconQuery, setIconQuery] = useState('')
  const categoryTriggerRef = useRef<HTMLButtonElement | null>(null)
  const categoryNameRef = useRef<HTMLInputElement | null>(null)
  const categoryDialogRef = useRef<HTMLFormElement | null>(null)
  const categoryListRef = useRef<HTMLUListElement | null>(null)
  const categoryScrollTop = useRef(0)
  const categoryInitialRef = useRef({ name: '', description: '', type: 'expense' as CategoryType, icon: 'tag', image: null as string | null })
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [budgetCategoryId, setBudgetCategoryId] = useState('')
  const [budgetLimit, setBudgetLimit] = useState('')
  const [localBudgetMonth, setLocalBudgetMonth] = useState(currentMonth)
  const [expenseWalletId, setExpenseWalletId] = useState('')
  const [destinationWalletId, setDestinationWalletId] = useState('')
  const [expenseCategoryId, setExpenseCategoryId] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDate, setExpenseDate] = useState(today)
  const [expenseNote, setExpenseNote] = useState('')
  const [itemizedExpense, setItemizedExpense] = useState(false)
  const [expenseItems, setExpenseItems] = useState<ItemInput[]>([{ name: '', quantity: '1', unitPrice: '' }])
  const [transactionType, setTransactionType] =
  useState<'income' | 'expense' | 'transfer'>(initialTransactionType)
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<
    | { kind: 'transaction'; record: Transaction; trigger: HTMLButtonElement }
    | { kind: 'wallet'; record: Wallet; trigger: HTMLButtonElement }
    | null
  >(null)
  const [actionProcessing, setActionProcessing] = useState(false)
  const actionProcessingRef = useRef(false)
  const [confirmationError, setConfirmationError] = useState('')
  const transactionHeadingRef = useRef<HTMLHeadingElement>(null)
  const transactionFormWasOpen = useRef(false)

  useEffect(() => {
    const formOpen = view === 'transactions' && transactionMode === 'create'
    if (transactionFormWasOpen.current && view === 'transactions' && !formOpen) {
      transactionHeadingRef.current?.focus({ preventScroll: true })
    }
    transactionFormWasOpen.current = formOpen
  }, [view, transactionMode])

  useEffect(() => {
    if (!walletNotice) return
    const timeout = window.setTimeout(() => setWalletNotice(''), 5000)
    return () => window.clearTimeout(timeout)
  }, [walletNotice])

  const refreshWallets = useCallback(async () => {
    const [savedWallets, savedCategories, savedTransactions, savedBudgets, pending] = await Promise.all([
      listWallets(userId),
      listCategories(userId),
      listTransactions(userId),
      listBudgets(userId),
      pendingOperationCount(userId),
    ])
    setWallets(savedWallets)
    setPendingCount(pending)
    setCategories(savedCategories)
    onCategoriesChange(savedCategories)
    setTransactions(savedTransactions)
    setBudgets(savedBudgets)
    onTransactionsChange(savedTransactions)
    onWalletsChange(savedWallets)
  }, [onCategoriesChange, onTransactionsChange, onWalletsChange, userId])

  const syncWallets = useCallback(async () => {
    const result = await syncPendingOperations(userId)
    try {
      await downloadServerRecords(userId)
    } catch {
      // Keep working from the local workspace when the server cannot be reached.
    }
    await refreshWallets()

    if (result.errorCount > 0) {
      setStatus('Some changes need attention. Review the message and retry sync.')
    } else if (result.pendingCount === 0) {
      setStatus('All changes synced.')
    }
  }, [refreshWallets, userId])

  useEffect(() => {
    let active = true

    async function initialize() {
      try {
        await refreshWallets()
        await syncWallets()
      } catch {
        if (active) setStorageError('Unable to open local wallet storage.')
      }
    }

    void initialize()

    function handleOnline() {
      void syncWallets().catch(() => setStatus('Could not sync yet. Your changes remain saved locally.'))
    }

    window.addEventListener('online', handleOnline)
    return () => {
      active = false
      window.removeEventListener('online', handleOnline)
    }
  }, [syncWallets, refreshWallets, userId])

  useEffect(() => {
    if (walletFormOpen) walletNameRef.current?.focus()
  }, [walletFormOpen])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    setStorageError('')
    setSubmitting(true)

    try {
      const editingWallet = wallets.find((wallet) => wallet.id === editingWalletId)
      if (editingWallet) {
        await updateWalletAndOperation(userId, editingWallet, { name, type, openingDate, openingBalance })
      } else {
        await saveWalletAndOperation(userId, { name, type, openingDate, openingBalance })
      }
      setName('')
      setOpeningBalance('0.00')
      setEditingWalletId(null)
      setWalletFormOpen(false)
      requestAnimationFrame(() => walletTriggerRef.current?.focus())
      setStatus(editingWallet ? 'Wallet updated successfully. Waiting to sync.' : 'Saved on this device. Waiting to sync.')
      if (editingWallet) setWalletNotice('Wallet updated successfully.')
      await refreshWallets()
      await syncWallets()
    } catch (error) {
      if (error instanceof Error) setFormError(error.message)
      else setStorageError('Could not save this wallet on your device. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function beginWalletEdit(wallet: Wallet, trigger: HTMLButtonElement): void {
    walletTriggerRef.current = trigger
    setEditingWalletId(wallet.id)
    setName(wallet.name)
    setType(wallet.type)
    setOpeningBalance(decimalAmountFromMinor(wallet.openingBalanceMinor))
    setOpeningDate(wallet.openingDate)
    setFormError('')
    setWalletFormOpen(true)
  }

  function beginTransactionEdit(transaction: Transaction): void {
    setEditingTransactionId(transaction.id)
    setTransactionType(transaction.type)
    setExpenseWalletId(transaction.walletId)
    setDestinationWalletId(transaction.destinationWalletId ?? '')
    setExpenseCategoryId(transaction.categoryId ?? '')
    setExpenseAmount(decimalAmountFromMinor(transaction.amountMinor))
    setExpenseDate(transaction.transactionDate)
    setExpenseNote(transaction.note ?? '')
    setItemizedExpense(Boolean(transaction.items?.length))
    setExpenseItems(transaction.items?.map((item) => ({ name: item.name, quantity: String(item.quantity), unitPrice: decimalAmountFromMinor(item.unitPriceMinor) })) ?? [{ name: '', quantity: '1', unitPrice: '' }])
    setFormError('')
  }

  async function confirmRecordAction(): Promise<void> {
    if (!confirmAction || actionProcessingRef.current) return
    const action = confirmAction
    const offline = !navigator.onLine
    actionProcessingRef.current = true
    setActionProcessing(true)
    setConfirmationError('')

    try {
      if (action.kind === 'transaction') {
        const deleted = await deleteTransactionAndOperation(userId, action.record)
        setConfirmAction(null)
        setStatus(offline ? 'Transaction deleted on this device. Waiting to sync.' : 'Transaction deleted.')
        onTransactionDeleted?.(deleted.id, offline)
        await refreshWallets()
        requestAnimationFrame(() => (action.trigger.isConnected ? action.trigger : transactionHeadingRef.current)?.focus())
        if (!offline) {
          void (async () => {
            try {
              await syncWallets()
              const saved = (await listTransactions(userId)).find((transaction) => transaction.id === deleted.id)
              onTransactionSyncState?.(deleted.id, saved?.localStatus === 'synced' ? 'synced' : saved?.localStatus === 'error' ? 'error' : 'waiting')
            } catch {
              onTransactionSyncState?.(deleted.id, 'waiting')
            }
          })()
        }
      } else {
        await archiveWalletAndOperation(userId, action.record)
        setConfirmAction(null)
        setStatus(offline ? 'Wallet archived on this device. Waiting to sync.' : 'Wallet archived.')
        setWalletNotice('Wallet archived.')
        await refreshWallets()
        requestAnimationFrame(() => (action.trigger.isConnected ? action.trigger : document.getElementById('wallets-heading'))?.focus())
        if (!offline) void syncWallets().catch(() => setStatus('Could not sync yet. Your changes remain saved locally.'))
      }
    } catch (error) {
      setConfirmationError(error instanceof Error ? error.message : 'Could not complete this action.')
    } finally {
      actionProcessingRef.current = false
      setActionProcessing(false)
    }
  }

  async function handleRetry() {
    setRetrying(true)
    setStatus('Syncing…')
    try {
      await syncWallets()
    } catch {
      setStatus('Could not sync yet. Your changes remain saved locally.')
    } finally {
      setRetrying(false)
    }
  }

  async function handleCategorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    setSubmitting(true)

    try {
      const editingCategory = categories.find((category) => category.id === editingCategoryId)
      if (editingCategory) {
        await updateCategoryAndOperation(userId, editingCategory, { name: categoryName, description: categoryDescription, type: categoryType, icon: categoryIcon, iconImage: categoryIconImage })
      } else {
        await saveCategoryAndOperation(userId, { name: categoryName, description: categoryDescription, type: categoryType, icon: categoryIcon, iconImage: categoryIconImage })
      }
      closeCategoryDialog(true)
      setStatus('Saved on this device. Waiting to sync.')
      await refreshWallets()
      await syncWallets()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save this category.')
    } finally {
      setSubmitting(false)
    }
  }

  function beginCategoryEdit(category: Category): void {
    categoryScrollTop.current = categoryListRef.current?.scrollTop ?? 0
    setEditingCategoryId(category.id)
    setCategoryName(category.name)
    setCategoryDescription(category.description ?? '')
    setCategoryType(category.type)
    setCategoryIcon(category.icon)
    setCategoryIconImage(category.iconImage ?? null)
    categoryInitialRef.current = { name: category.name, description: category.description ?? '', type: category.type, icon: category.icon, image: category.iconImage ?? null }
    setFormError('')
    setIconPickerOpen(false)
    setCategoryDialogOpen(true)
  }

  function openCategoryDialog(trigger: HTMLButtonElement, type = categoryTab): void {
    categoryTriggerRef.current = trigger
    categoryScrollTop.current = categoryListRef.current?.scrollTop ?? 0
    categoryInitialRef.current = { name: '', description: '', type, icon: 'tag', image: null }
    setEditingCategoryId(null); setCategoryName(''); setCategoryDescription(''); setCategoryType(type); setCategoryIcon('tag'); setCategoryIconImage(null); setIconQuery(''); setIconPickerOpen(false); setFormError(''); setCategoryDialogOpen(true)
  }

  async function chooseCategoryImage(file: File | undefined): Promise<void> {
    if (!file) return
    setFormError('')
    try { setCategoryIconImage(await makeCategoryThumbnail(file)) } catch (error) { setFormError(error instanceof Error ? error.message : 'Could not prepare this image.') }
  }

  function closeCategoryDialog(saved = false): void {
    const initial = categoryInitialRef.current
    if (!saved && (categoryName !== initial.name || categoryDescription !== initial.description || categoryType !== initial.type || categoryIcon !== initial.icon || categoryIconImage !== initial.image) && !window.confirm('Discard unsaved category changes?')) return
    setCategoryDialogOpen(false); setIconPickerOpen(false); setFormError('')
    requestAnimationFrame(() => { if (categoryListRef.current) categoryListRef.current.scrollTop = categoryScrollTop.current; categoryTriggerRef.current?.focus() })
  }

  useEffect(() => {
    if (!categoryDialogOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (iconPickerOpen) setIconPickerOpen(false)
        else closeCategoryDialog()
      }
      if (event.key === 'Tab') {
        const controls = categoryDialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')
        if (!controls?.length) return
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // closeCategoryDialog intentionally reads current draft values for Escape confirmation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryDialogOpen, iconPickerOpen, categoryName, categoryDescription, categoryType, categoryIcon, categoryIconImage])

  useEffect(() => {
    if (categoryDialogOpen && !iconPickerOpen) requestAnimationFrame(() => categoryNameRef.current?.focus())
  }, [categoryDialogOpen, iconPickerOpen])

  async function archiveCategory(category: Category): Promise<void> {
    setFormError('')
    setSubmitting(true)
    try {
      await updateCategoryAndOperation(userId, category, { name: category.name, description: category.description ?? '', type: category.type, icon: category.icon, archive: true })
      setStatus('Saved on this device. Waiting to sync.')
      await refreshWallets()
      await syncWallets()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not archive this category.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleBudgetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    setSubmitting(true)

    try {
      if (budgets.some((budget) => budget.deletedAt == null && budget.categoryId === budgetCategoryId && budget.monthStart === `${budgetMonth}-01`)) {
        throw new Error('A budget already exists for this category and month.')
      }
      await saveBudgetAndOperation(userId, { categoryId: budgetCategoryId, limit: budgetLimit, month: budgetMonth })
      setBudgetLimit('')
      setStatus('Saved on this device. Waiting to sync.')
      await refreshWallets()
      await syncWallets()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not save this budget.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleExpenseSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    setSubmitting(true)
    let savedTransactionId = ''
    const editingTransaction = transactions.find((transaction) => transaction.id === editingTransactionId)
    const itemsToSave = transactionType === 'expense' && (itemizedExpense || Boolean(editingTransaction?.items?.length)) ? expenseItems : undefined

    try {
      if (editingTransaction) {
        const savedTransaction = await updateTransactionAndOperation(userId, editingTransaction, {
          type: transactionType,
          walletId: expenseWalletId,
          destinationWalletId,
          categoryId: expenseCategoryId,
          amount: expenseAmount,
          transactionDate: expenseDate,
          note: expenseNote,
          items: itemsToSave,
        })
        savedTransactionId = savedTransaction.id
      } else if (transactionType === 'transfer') {
        const savedTransaction = await saveTransferAndOperation(userId, {
          sourceWalletId: expenseWalletId,
          destinationWalletId,
          amount: expenseAmount,
          transactionDate: expenseDate,
          note: expenseNote,
        })
        savedTransactionId = savedTransaction.id
      } else {
        const savedTransaction = await saveTransactionAndOperation(userId, {
          type: transactionType,
          walletId: expenseWalletId,
          categoryId: expenseCategoryId,
          amount: expenseAmount,
          transactionDate: expenseDate,
          note: expenseNote,
          items: itemsToSave,
        })
        savedTransactionId = savedTransaction.id
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : `Could not save this ${transactionType}.`)
      return
    } finally {
      setSubmitting(false)
    }

    setExpenseAmount('')
    setExpenseNote('')
    setDestinationWalletId('')
    setItemizedExpense(false)
    setExpenseItems([{ name: '', quantity: '1', unitPrice: '' }])
    const wasUpdated = editingTransactionId !== null
    setEditingTransactionId(null)
    setStatus(wasUpdated ? 'Transaction updated successfully. Waiting to sync.' : 'Saved on this device. Waiting to sync.')
    onTransactionSaved?.(transactionType, savedTransactionId, wasUpdated)

    void (async () => {
      try {
        await refreshWallets()
        await syncWallets()
      } catch {
        setStatus('Could not sync yet. Your change remains saved locally.')
      }
      try {
        const savedTransaction = (await listTransactions(userId)).find((transaction) => transaction.id === savedTransactionId)
        const syncState = savedTransaction?.localStatus === 'synced' ? 'synced' : savedTransaction?.localStatus === 'error' ? 'error' : 'waiting'
        onTransactionSyncState?.(savedTransactionId, syncState)
      } catch {
        onTransactionSyncState?.(savedTransactionId, 'waiting')
      }
    })()
  }

  const budgetMonth = selectedMonth ?? localBudgetMonth
  const budgetProgress = calculateBudgetProgress(budgets, categories, transactions, budgetMonth)
  const expenseCategories = categories.filter((category) => category.type === 'expense' && !category.isArchived)
  const itemizedTotal = (() => {
    try {
      return itemizedTotalMinor(expenseItems)
    } catch {
      return ''
    }
  })()

  function updateExpenseItem(index: number, changes: Partial<ItemInput>) {
    setExpenseItems((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item))
  }

  if (view === 'data-only') return null

  const activeWallets = activeWalletRecords(wallets)
  const totalWalletBalance = activeWallets.reduce((total, wallet) => total + BigInt(calculateWalletBalance(wallet, transactions)), 0n).toString()
  const totalIncome = transactions.filter((transaction) => transaction.type === 'income' && transaction.deletedAt == null).reduce((total, transaction) => total + BigInt(transaction.amountMinor), 0n).toString()
  const totalExpense = transactions.filter((transaction) => transaction.type === 'expense' && transaction.deletedAt == null).reduce((total, transaction) => total + BigInt(transaction.amountMinor), 0n).toString()
  const visibleCategories = categories.filter((category) => category.type === categoryTab)
  const isCategoriesView = view === 'more' && moreSection === 'categories'
  const isTransactionForm = view === 'transactions' && (transactionMode === 'create' || editingTransactionId !== null)
  const selectedTransactionCategory = categories.find((category) => category.id === expenseCategoryId)
  const headingId = isCategoriesView ? 'categories-heading' : 'wallets-heading'
  const visibleAmount = (amount: string) => amountsVisible ? formatMinorUnits(amount) : '••••••'

  return (
    <section className={`wallets-panel wallets-view-${view}`} aria-labelledby={isTransactionForm ? 'transaction-form-title' : headingId}>
      {!isTransactionForm && <div className="section-heading">
        <div>
          <h2 id={headingId} ref={view === 'transactions' ? transactionHeadingRef : undefined} tabIndex={view === 'transactions' || view === 'wallets' ? -1 : undefined}>
            {view === 'transactions'
              ? transactionMode === 'create' ? transactionType === 'transfer' ? 'Transfer between wallets' : `Add ${transactionType}` : 'Transactions'
              : view === 'more' ? moreSection === 'budgets' ? 'Monthly budgets' : 'Categories' : 'Wallets'}
          </h2>
        </div>
        {isCategoriesView ? <button type="button" className="add-category-button" onClick={(event) => openCategoryDialog(event.currentTarget)}><AppIcon name="plus" /> Add category</button> : pendingCount > 0 && <span className="pending-badge">{pendingCount} waiting</span>}
      </div>}

      {storageError && (
        <p className="form-error" role="alert">{storageError}</p>
      )}
      {walletNotice && <p className="wallet-update-notice" role="status">{walletNotice}</p>}

      {view === 'transactions' && transactionMode === 'history' && editingTransactionId === null && (
        <TransactionHistory key={initialHistoryMonth} transactions={transactions} wallets={wallets} categories={categories} initialMonth={initialHistoryMonth} onEdit={beginTransactionEdit} onDelete={(record, trigger) => { setConfirmationError(''); setConfirmAction({ kind: 'transaction', record, trigger }) }} />
      )}

      {view === 'wallets' && (
        <section className="wallet-balance-summary" aria-label="Wallet balance summary">
          <div className="wallet-summary-heading">
            <div><span>Total balance</span><strong aria-label={amountsVisible ? undefined : 'Amount hidden'}>{visibleAmount(totalWalletBalance)}</strong></div>
            <button type="button" className="wallet-visibility-button" aria-label={amountsVisible ? 'Hide wallet amounts' : 'Show wallet amounts'} aria-pressed={!amountsVisible} onClick={() => setAmountsVisible((visible) => !visible)}><AppIcon name={amountsVisible ? 'eye' : 'eye-off'} /></button>
          </div>
          <div className="wallet-summary-totals"><div><span>Total income</span><strong aria-label={amountsVisible ? undefined : 'Amount hidden'}>{visibleAmount(totalIncome)}</strong></div><div><span>Total expense</span><strong aria-label={amountsVisible ? undefined : 'Amount hidden'}>{visibleAmount(totalExpense)}</strong></div></div>
        </section>
      )}

      {view === 'wallets' && activeWallets.length > 0 && (
        <div className="wallet-list">
          {activeWallets.map((wallet) => (
            <article className="wallet-item" key={wallet.id}>
              <span className="wallet-type-icon"><AppIcon name={wallet.type === 'bank' ? 'bank' : wallet.type === 'ewallet' ? 'card' : /savings?/i.test(wallet.name) ? 'savings' : 'wallet'} /></span>
              <div className="wallet-details">
                <strong>{wallet.name}</strong>
                <span>{wallet.type === 'ewallet' ? 'E-wallet' : wallet.type[0].toUpperCase() + wallet.type.slice(1)}</span>
              </div>
              <div className="wallet-amount">
                <strong aria-label={amountsVisible ? undefined : 'Amount hidden'}>{visibleAmount(calculateWalletBalance(wallet, transactions))}</strong>
                <span className={`wallet-status wallet-status-${wallet.localStatus}`}>
                  {wallet.localStatus === 'synced' ? 'Synced' : wallet.localStatus === 'error' ? wallet.lastError ?? 'Needs attention' : 'Waiting to sync'}
                </span>
              </div>
              <RecordActionsMenu label={`Actions for ${wallet.name} wallet`} editLabel="Edit wallet" editDisabled={submitting || wallet.localStatus !== 'synced'} onEdit={(trigger) => beginWalletEdit(wallet, trigger)} dangerLabel="Archive wallet" dangerDisabled={submitting || wallet.localStatus !== 'synced'} onDanger={(trigger) => { setConfirmationError(''); setConfirmAction({ kind: 'wallet', record: wallet, trigger }) }} />
            </article>
          ))}
        </div>
      )}

      {view === 'wallets' && activeWallets.length === 0 && <p className="wallet-empty-state">No active wallets. Add a wallet to start tracking your money.</p>}

      {view === 'wallets' && !walletFormOpen && <button ref={walletTriggerRef} type="button" className="add-wallet-button" onClick={() => { setEditingWalletId(null); setName(''); setType('cash'); setOpeningBalance('0.00'); setOpeningDate(today); setWalletFormOpen(true) }}><AppIcon name="plus" /> Add wallet</button>}

      {view === 'wallets' && walletFormOpen && <form className="wallet-form" onSubmit={handleSubmit}>
        <h3>{editingWalletId ? 'Edit wallet' : 'Add wallet'}</h3>
        <label htmlFor="wallet-name">Wallet name</label>
        <input
          id="wallet-name"
          ref={walletNameRef}
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Cash"
          required
        />

        <label htmlFor="wallet-type">Wallet type</label>
        <select id="wallet-type" value={type} onChange={(event) => setType(event.target.value as WalletType)}>
          <option value="cash">Cash</option>
          <option value="ewallet">E-wallet</option>
          <option value="bank">Bank</option>
        </select>

        <label htmlFor="opening-balance">Opening balance (₱)</label>
        <input
          id="opening-balance"
          inputMode="decimal"
          value={openingBalance}
          onChange={(event) => setOpeningBalance(event.target.value)}
          required
        />

        <label htmlFor="opening-date">Opening date</label>
        <input
          id="opening-date"
          type="date"
          max={today}
          value={openingDate}
          onChange={(event) => setOpeningDate(event.target.value)}
          required
        />

        {formError && <p className="form-error" role="alert">{formError}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving wallet…' : editingWalletId ? 'Save changes' : 'Save wallet'}
        </button>
        <button type="button" className="secondary-button" disabled={submitting} onClick={() => { setWalletFormOpen(false); setEditingWalletId(null); setFormError(''); requestAnimationFrame(() => walletTriggerRef.current?.focus()) }}>Cancel</button>
      </form>}

      <div className="sync-status" aria-live="polite">
        <span>{status || (pendingCount > 0 ? 'Saved on this device. Waiting to sync.' : 'All changes synced.')}</span>
        {pendingCount > 0 && (
          <button type="button" className="retry-button" onClick={handleRetry} disabled={retrying}>
            {retrying ? 'Retrying…' : 'Retry sync'}
          </button>
        )}
      </div>

      {view === 'more' && <section className={`categories-panel categories-section-${moreSection}`} aria-labelledby={headingId}>
        {moreSection === 'categories' && <>
        <p className="category-page-subtitle">Manage your income and expense categories to keep your records organized.</p>
        <div className="category-tabs" role="group" aria-label="Category type"><button type="button" aria-pressed={categoryTab === 'expense'} onClick={() => setCategoryTab('expense')}>Expense</button><button type="button" aria-pressed={categoryTab === 'income'} onClick={() => setCategoryTab('income')}>Income</button></div>
        {visibleCategories.length === 0 ? <p className="empty-copy">No {categoryTab} categories yet.</p> : <ul className="category-list" ref={categoryListRef}>
          {visibleCategories.map((category) => <li key={category.id}>
            <span className="category-name-with-icon"><CategoryIcon name={category.icon} image={category.iconImage} label={category.name} /><span><strong>{category.name}</strong>{category.description && <small className="category-description">{category.description}</small>}<small>{category.type === 'income' ? 'Income' : 'Expense'}{category.isArchived ? ' · Archived' : ''}<span className={`category-sync wallet-status-${category.localStatus}`}>{category.localStatus === 'synced' ? 'Synced' : category.localStatus === 'error' ? category.lastError ?? 'Needs attention' : 'Waiting to sync'}</span></small></span></span>
            <span className="category-actions"><button type="button" className="icon-button" aria-label={`Edit ${category.name}`} onClick={(event) => { categoryTriggerRef.current = event.currentTarget; beginCategoryEdit(category) }} disabled={submitting}><AppIcon name="edit" /></button><button type="button" className="icon-button" aria-label={`More actions for ${category.name}`} aria-expanded={openCategoryMenu === category.id} onClick={() => setOpenCategoryMenu(openCategoryMenu === category.id ? null : category.id)} disabled={submitting}><AppIcon name="more-vertical" /></button>{openCategoryMenu === category.id && <span className="category-overflow">{!category.isArchived ? <button type="button" onClick={() => { setOpenCategoryMenu(null); void archiveCategory(category) }}>Archive</button> : 'Archived'}</span>}</span>
          </li>)}
        </ul>}
        </>}
        {categoryDialogOpen && createPortal(<div className="category-dialog-backdrop" role="presentation"><form ref={categoryDialogRef} className="category-dialog" role="dialog" aria-modal="true" aria-labelledby="category-dialog-title" onSubmit={handleCategorySubmit}>
          <div className="dialog-handle" /><header><button type="button" className="back-button" aria-label={iconPickerOpen ? 'Back to category details' : 'Close'} onClick={() => iconPickerOpen ? setIconPickerOpen(false) : closeCategoryDialog()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button><h3 id="category-dialog-title">{iconPickerOpen ? 'Choose an icon' : editingCategoryId ? 'Edit category' : 'Add category'}</h3></header>
          {iconPickerOpen ? <><section className="custom-image-section"><CategoryIcon name={categoryIcon} image={categoryIconImage} label="Custom image preview" /><span><strong>Custom image</strong><small>{categoryIconImage ? 'Image selected' : 'Use a square thumbnail'}</small></span><label className="upload-icon-button">{categoryIconImage ? 'Replace' : 'Upload image'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void chooseCategoryImage(event.target.files?.[0])} /></label>{categoryIconImage && <button type="button" className="secondary-button" onClick={() => setCategoryIconImage(null)}>Remove</button>}</section><label className="sr-only" htmlFor="icon-search">Search icons</label><input id="icon-search" autoFocus type="search" value={iconQuery} onChange={(event) => setIconQuery(event.target.value)} placeholder="Search icons" /><div className="icon-grid">{categoryIcons.filter(([, label]) => label.toLowerCase().includes(iconQuery.toLowerCase())).map(([id, label]) => <button key={id} type="button" className={categoryIcon === id && !categoryIconImage ? 'icon-choice icon-choice-selected' : 'icon-choice'} onClick={() => { setCategoryIcon(id); setCategoryIconImage(null); setIconPickerOpen(false) }}><CategoryIcon name={id} /><span>{label}</span></button>)}</div></> : <><div className="category-preview"><CategoryIcon name={categoryIcon} image={categoryIconImage} label="Category icon preview" /><div><strong>{categoryName || 'Category name'}</strong><small>{categoryDescription || 'Optional category description'}</small><small>{categoryType === 'income' ? 'Income' : 'Expense'} category</small></div><button type="button" className="text-button" onClick={() => setIconPickerOpen(true)}>Change icon</button></div><label htmlFor="category-dialog-name">Category name<input ref={categoryNameRef} id="category-dialog-name" maxLength={60} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Food" required /></label><label htmlFor="category-dialog-description">Description <span className="field-optional">Optional</span><input id="category-dialog-description" maxLength={160} value={categoryDescription} onChange={(event) => setCategoryDescription(event.target.value)} placeholder="Meals and dining out" /></label><label htmlFor="category-dialog-type">Category type<select id="category-dialog-type" value={categoryType} onChange={(event) => setCategoryType(event.target.value as CategoryType)} disabled={editingCategoryId !== null && transactions.some((transaction) => transaction.categoryId === editingCategoryId)}><option value="expense">Expense</option><option value="income">Income</option></select></label>{formError && <p className="form-error" role="alert">{formError}</p>}<footer><button type="button" className="secondary-button" onClick={() => closeCategoryDialog()} disabled={submitting}>Cancel</button><button type="submit" className="primary-button" disabled={submitting}>{submitting ? 'Saving…' : editingCategoryId ? 'Save changes' : 'Add category'}</button></footer></>}</form></div>, document.body)}
        {moreSection === 'budgets' && <section className="budgets-panel" aria-labelledby="budgets-heading">
          <div className="section-heading compact-heading">
            <div><p className="eyebrow">Spending plans</p><h3 id="budgets-heading">Monthly budgets</h3></div>
            <label className="month-selector" htmlFor="budget-month"><span>Budget month</span><input id="budget-month" type="month" value={budgetMonth} onChange={(event) => onSelectedMonthChange ? onSelectedMonthChange(event.target.value) : setLocalBudgetMonth(event.target.value)} /></label>
          </div>
          {budgetProgress.length === 0 ? <p className="empty-copy">No budgets for this month.</p> : (
            <div className="budget-list">
              {budgetProgress.map((budget) => (
                <article className="budget-card" key={budget.id}>
                  <div className="budget-card-heading"><strong>{budget.categoryName}</strong><span>{budget.percentageUsed}% used</span></div>
                  <div className="budget-progress" aria-label={`${budget.percentageUsed}% of budget used`}><span style={{ width: `${budget.progressPercent}%` }} /></div>
                  <p>{formatMinorUnits(budget.spentMinor)} of {formatMinorUnits(budget.limitMinor)}</p>
                  <strong className={BigInt(budget.remainingMinor) < 0n ? 'budget-over' : 'budget-remaining'}>{BigInt(budget.remainingMinor) < 0n ? `${formatMinorUnits(budget.remainingMinor.slice(1))} over budget` : `${formatMinorUnits(budget.remainingMinor)} remaining`}</strong>
                </article>
              ))}
            </div>
          )}
          <form className="category-form" onSubmit={handleBudgetSubmit}>
            <h3>Set a monthly budget</h3>
            <label htmlFor="budget-category">Expense category</label>
            <select id="budget-category" value={budgetCategoryId} onChange={(event) => setBudgetCategoryId(event.target.value)} required>
              <option value="">Choose a category</option>
              {expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <label htmlFor="budget-limit">Monthly limit (â‚±)</label>
            <input id="budget-limit" inputMode="decimal" value={budgetLimit} onChange={(event) => setBudgetLimit(event.target.value)} required />
            <button type="submit" disabled={submitting || expenseCategories.length === 0}>{submitting ? 'Saving budgetâ€¦' : 'Save budget'}</button>
          </form>
        </section>}
      </section>}

      {isTransactionForm && <section className={`expense-panel transaction-form transaction-form-${transactionType}`}>
        <header className="transaction-form-header">
          <h2 id="transaction-form-title">{editingTransactionId ? 'Edit transaction' : transactionType === 'transfer' ? 'Transfer between wallets' : `Add ${transactionType}`}</h2>
          {onCancelTransaction && (
            <button type="button" className="transaction-cancel" onClick={() => { if (editingTransactionId) { setEditingTransactionId(null); setFormError('') } else onCancelTransaction() }} disabled={submitting}>Cancel</button>
          )}
        </header>
        <form className="transaction-entry-form" onSubmit={handleExpenseSubmit}>
          <div className="transaction-form-surface">
            <div className="transaction-field transaction-amount-field">
              <label htmlFor="transaction-amount">Amount<span className="sr-only"> in Philippine pesos</span></label>
              <div className="transaction-amount-control">
                <span aria-hidden="true">₱</span>
                <input id="transaction-amount" inputMode="decimal" placeholder="0.00" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} required />
              </div>
            </div>
            <div className="transaction-field">
              <label htmlFor="transaction-type">Type</label>
              <select
                id="transaction-type"
                value={transactionType}
                onChange={(event) => {
                  setTransactionType(event.target.value as 'income' | 'expense' | 'transfer')
                  setExpenseCategoryId('')
                  setDestinationWalletId('')
                  setFormError('')
                }}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="transfer">Transfer</option>
              </select>
              <svg className="transaction-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </div>
            <div className="transaction-field transaction-field-with-icon">
              <label htmlFor="expense-wallet">{transactionType === 'transfer' ? 'From wallet' : 'Wallet'}</label>
              <span className="transaction-field-icon transaction-wallet-icon"><AppIcon name="wallet" /></span>
              <select id="expense-wallet" value={expenseWalletId} onChange={(event) => setExpenseWalletId(event.target.value)} required>
                <option value="">Choose a wallet</option>
                {wallets.filter((wallet) => !wallet.isArchived && !wallet.deletedAt).map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
              </select>
              <svg className="transaction-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </div>
            {transactionType === 'transfer' ? (
              <div className="transaction-field transaction-field-with-icon">
                <label htmlFor="destination-wallet">To wallet</label>
                <span className="transaction-field-icon transaction-wallet-icon"><AppIcon name="wallet" /></span>
                <select id="destination-wallet" value={destinationWalletId} onChange={(event) => setDestinationWalletId(event.target.value)} required>
                  <option value="">Choose a destination wallet</option>
                  {wallets.filter((wallet) => wallet.id !== expenseWalletId && !wallet.isArchived && !wallet.deletedAt).map((wallet) => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}
                </select>
                <svg className="transaction-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </div>
            ) : (
              <div className="transaction-field transaction-field-with-icon">
                <label htmlFor="expense-category">{transactionType === 'income' ? 'Income category' : 'Expense category'}</label>
                <span className={`transaction-field-icon transaction-category-icon-${transactionType}`}>
                  <CategoryIcon name={selectedTransactionCategory?.icon ?? (transactionType === 'income' ? 'salary' : 'food')} image={selectedTransactionCategory?.iconImage} />
                </span>
                <select id="expense-category" value={expenseCategoryId} onChange={(event) => setExpenseCategoryId(event.target.value)} required>
                  <option value="">Choose a category</option>
                  {categories.filter((category) => category.type === transactionType && !category.isArchived).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
                <svg className="transaction-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </div>
            )}
            <div className="transaction-field transaction-date-field">
              <label htmlFor="expense-date">Date</label>
              <input id="expense-date" type="date" max={today} value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} required />
            </div>
            <div className="transaction-field transaction-field-with-icon transaction-note-field">
              <label htmlFor="expense-note">Note (optional)</label>
              <span className="transaction-field-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l5 5v13H6zM15 3v6h5M9 13h8M9 17h8" /></svg></span>
              <input id="expense-note" maxLength={500} value={expenseNote} onChange={(event) => setExpenseNote(event.target.value)} placeholder="Add a note..." />
            </div>
            {transactionType === 'expense' && (
              <button className="transaction-items-toggle" type="button" aria-expanded={itemizedExpense} aria-controls="transaction-items" onClick={() => setItemizedExpense(!itemizedExpense)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h12M9 12h12M9 18h8" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></svg>
                <span>Add item details</span>
                <svg className="transaction-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </button>
            )}
            {itemizedExpense && transactionType === 'expense' && <section id="transaction-items" className="itemized-expense" aria-label="Expense items">
              <header className="itemized-heading"><h3>Item details</h3><p>Add individual purchases</p></header>
              {expenseItems.map((item, index) => {
                const lineTotal = (() => {
                  try {
                    return itemizedTransactionItems([item])[0]?.lineTotalMinor ?? ''
                  } catch {
                    return ''
                  }
                })()
                return <div className="item-row" key={index}>
                  <div className="item-row-top"><label htmlFor={`item-name-${index}`}>Name<input id={`item-name-${index}`} value={item.name} onChange={(event) => updateExpenseItem(index, { name: event.target.value })} placeholder="Item name" required /></label><button type="button" className="item-remove" aria-label={`Remove ${item.name.trim() || `item ${index + 1}`}`} onClick={() => setExpenseItems((items) => items.length === 1 ? [{ name: '', quantity: '1', unitPrice: '' }] : items.filter((_, itemIndex) => itemIndex !== index))}><AppIcon name="trash" /></button></div>
                  <div className="item-row-bottom"><label htmlFor={`item-qty-${index}`}>Qty<input id={`item-qty-${index}`} inputMode="numeric" value={item.quantity} onChange={(event) => updateExpenseItem(index, { quantity: event.target.value })} required /></label><label htmlFor={`item-price-${index}`}>Unit price (₱)<input id={`item-price-${index}`} inputMode="decimal" value={item.unitPrice} onChange={(event) => updateExpenseItem(index, { unitPrice: event.target.value })} placeholder="0.00" required /></label><div className="item-line-total"><span>Total</span><strong>{lineTotal ? formatMinorUnits(lineTotal) : '—'}</strong></div></div>
                </div>
              })}
              <button type="button" className="item-add-button" onClick={() => setExpenseItems((items) => [...items, { name: '', quantity: '1', unitPrice: '' }])}><AppIcon name="plus" /> Add another item</button>
            </section>}
          </div>
          {itemizedExpense && transactionType === 'expense' && <div className="itemized-subtotal"><div><strong>Items subtotal</strong><span>{expenseItems.length} item{expenseItems.length === 1 ? '' : 's'}</span></div><strong>{itemizedTotal ? formatMinorUnits(itemizedTotal) : '—'}</strong></div>}
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <button className="transaction-save-button" type="submit" disabled={submitting || wallets.filter((wallet) => !wallet.isArchived && !wallet.deletedAt).length < (transactionType === 'transfer' ? 2 : 1) || (transactionType !== 'transfer' && categories.filter((category) => category.type === transactionType).length === 0)}>{submitting ? `Saving ${transactionType}…` : transactionType === 'transfer' ? 'Save transfer' : `Save ${transactionType}`}</button>
        </form>
      </section>}
      {confirmAction && <ConfirmActionDialog
        title={confirmAction.kind === 'transaction' ? 'Delete this transaction?' : 'Archive this wallet?'}
        description={confirmAction.kind === 'transaction' ? <>
          <p>This removes the transaction from balances, budgets, charts, and active history.</p>
          <dl className="confirm-action-details">
            <dt>Type</dt><dd>{confirmAction.record.type[0].toUpperCase() + confirmAction.record.type.slice(1)}</dd>
            <dt>Category</dt><dd>{confirmAction.record.type === 'transfer' ? 'Wallet transfer' : categories.find((category) => category.id === confirmAction.record.categoryId)?.name ?? 'Unknown category'}</dd>
            <dt>Date</dt><dd>{new Date(`${confirmAction.record.transactionDate}T00:00:00`).toLocaleDateString()}</dd>
            <dt>Amount</dt><dd>{formatMinorUnits(confirmAction.record.amountMinor)}</dd>
          </dl>
        </> : <><p>Existing transactions will remain in your history.</p><p>The wallet will be removed from active wallet lists and totals.</p></>}
        confirmLabel={confirmAction.kind === 'transaction' ? 'Delete transaction' : 'Archive wallet'}
        confirmFirst={confirmAction.kind === 'wallet'}
        processing={actionProcessing}
        error={confirmationError}
        returnFocus={confirmAction.trigger}
        onCancel={() => { setConfirmAction(null); setConfirmationError('') }}
        onConfirm={() => { void confirmRecordAction() }}
      />}
    </section>
  )
}
