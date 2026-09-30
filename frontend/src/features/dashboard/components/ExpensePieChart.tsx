import { useState } from 'react'
import { formatMinorUnits } from '../../wallets/lib/money'
import { percentageOfTotal, totalExpenseMinor, type ExpenseCategoryTotal } from '../lib/chartData'

type ExpensePieChartProps = { totals: ExpenseCategoryTotal[] }

const colors = ['#4f46e5', '#a78bfa', '#059669', '#7c3aed', '#0284c7', '#d97706']

export default function ExpensePieChart({ totals }: ExpensePieChartProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState(totals[0]?.categoryId ?? '')
  if (totals.length === 0) return <p className="chart-empty">No expense data for this month yet.</p>

  const totalMinor = totalExpenseMinor(totals)
  const total = BigInt(totalMinor)
  const selected = totals.find((item) => item.categoryId === selectedCategoryId) ?? totals[0]

  return <div className="pie-chart-wrap">
    <div className="pie-chart-area">
      <svg className="pie-chart" viewBox="0 0 42 42" role="img" aria-label={`Total expenses ${formatMinorUnits(totalMinor)}`}>
        <circle cx="21" cy="21" r="15.9155" fill="transparent" stroke="#ede9fe" strokeWidth="8" />
        {totals.map((item, index) => {
          const percent = Number(BigInt(item.amountMinor) * 10000n / total) / 100
          const offset = totals.slice(0, index).reduce((sum, prior) => sum + Number(BigInt(prior.amountMinor) * 10000n / total) / 100, 0)
          return <circle key={item.categoryId} cx="21" cy="21" r="15.9155" fill="transparent" stroke={colors[index % colors.length]} strokeWidth="8" strokeDasharray={`${percent} ${100 - percent}`} strokeDashoffset={-offset}><title>{item.categoryName}: {formatMinorUnits(item.amountMinor)} ({percentageOfTotal(item.amountMinor, totalMinor)}%)</title></circle>
        })}
      </svg>
      <div className="pie-chart-center"><span>Expenses</span><strong>{formatMinorUnits(totalMinor)}</strong></div>
    </div>
    <ul className="chart-legend">
      {totals.map((item, index) => <li key={item.categoryId}>
        <button type="button" aria-pressed={selected?.categoryId === item.categoryId} className={selected?.categoryId === item.categoryId ? 'chart-legend-button chart-legend-button-active' : 'chart-legend-button'} onClick={() => setSelectedCategoryId(item.categoryId)}>
          <span style={{ background: colors[index % colors.length] }} />
          <span>{item.categoryName}</span>
          <strong>{formatMinorUnits(item.amountMinor)}</strong>
          <em>{percentageOfTotal(item.amountMinor, totalMinor)}%</em>
        </button>
      </li>)}
    </ul>
    {selected && <p className="chart-detail" aria-live="polite"><strong>{selected.categoryName}</strong>: {formatMinorUnits(selected.amountMinor)} ({percentageOfTotal(selected.amountMinor, totalMinor)}% of expenses)</p>}
  </div>
}
