import { useState } from 'react'
import { formatMinorUnits } from '../../wallets/lib/money'
import type { MonthlyComparison } from '../lib/chartData'

type IncomeExpenseBarChartProps = { months: MonthlyComparison[] }

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function IncomeExpenseBarChart({ months }: IncomeExpenseBarChartProps) {
  const [selectedMonth, setSelectedMonth] = useState(months.at(-1)?.month ?? '')
  const largest = months.reduce((max, month) => {
    const value = BigInt(month.incomeMinor) > BigInt(month.expenseMinor) ? BigInt(month.incomeMinor) : BigInt(month.expenseMinor)
    return value > max ? value : max
  }, 0n)

  if (largest === 0n) return <p className="chart-empty">No income or expense data for these six months yet.</p>

  const selected = months.find((month) => month.month === selectedMonth) ?? months.at(-1)

  return <>
    <div className="bar-chart" aria-label="Income and expenses across six months">
    {months.map((month) => {
      const incomeHeight = Number(BigInt(month.incomeMinor) * 100n / largest)
      const expenseHeight = Number(BigInt(month.expenseMinor) * 100n / largest)
      const description = `${month.month}: income ${formatMinorUnits(month.incomeMinor)}, expenses ${formatMinorUnits(month.expenseMinor)}`
      return <button type="button" className={selected?.month === month.month ? 'bar-chart-month bar-chart-month-active' : 'bar-chart-month'} key={month.month} onClick={() => setSelectedMonth(month.month)} aria-pressed={selected?.month === month.month} aria-label={description} title={description}>
        <div className="bar-pair">
          <span className="bar-income" style={{ height: `${incomeHeight}%` }} />
          <span className="bar-expense" style={{ height: `${expenseHeight}%` }} />
        </div>
        <span>{monthNames[Number(month.month.slice(5)) - 1]}</span>
      </button>
    })}
    </div>
    {selected && <p className="chart-detail" aria-live="polite"><strong>{selected.month}</strong> · Income {formatMinorUnits(selected.incomeMinor)} · Expenses {formatMinorUnits(selected.expenseMinor)}</p>}
  </>
}
