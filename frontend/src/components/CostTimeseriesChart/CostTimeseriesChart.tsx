// Agent: Rohan | Sprint: 01 | Date: 2026-03-16
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import type { CostDataPoint } from '../../types'
import type { AnomalyRecord } from '../../types'
import styles from './CostTimeseriesChart.module.css'

interface CostTimeseriesChartProps {
  data: CostDataPoint[]
  anomalies?: Pick<AnomalyRecord, 'detected_at' | 'severity'>[]
  timeRange?: '1d' | '7d' | '30d' | '90d'
}

// Recharts tooltip needs inline styles to pick up CSS vars
const TOOLTIP_STYLE = {
  backgroundColor: 'var(--chart-tooltip-bg, #242d40)',
  border: '1px solid var(--chart-tooltip-border, #3d4f6e)',
  borderRadius: '6px',
  fontSize: '12px',
  color: 'var(--color-text-primary, #e8ecf4)',
  fontFamily: 'var(--font-family-mono)',
}

const ANOMALY_COLOURS: Record<string, string> = {
  critical: 'var(--color-anomaly-critical)',
  high:     'var(--color-anomaly-high)',
  medium:   'var(--color-anomaly-medium)',
  low:      'var(--color-anomaly-low)',
}

function formatDate(ts: string) {
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function CostTimeseriesChart({ data, anomalies = [], timeRange = '30d' }: CostTimeseriesChartProps) {
  if (data.length === 0) {
    return <div className={styles.empty}>No cost data available</div>
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.label}>Cost Trend — Last {timeRange}</div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <defs>
            <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-color-1)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--chart-color-1)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--chart-grid-color)"
            vertical={false}
          />

          <XAxis
            dataKey="timestamp"
            tickFormatter={formatDate}
            tick={{ fill: 'var(--chart-axis-color)', fontSize: 11, fontFamily: 'var(--font-family-mono)' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />

          <YAxis
            tickFormatter={formatCurrency}
            tick={{ fill: 'var(--chart-axis-color)', fontSize: 11, fontFamily: 'var(--font-family-mono)' }}
            axisLine={false}
            tickLine={false}
            width={72}
          />

          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(label: string) => `Date: ${formatDate(label)}`}
            formatter={(value: number, name: string) => [
              formatCurrency(value),
              name === 'actual' ? 'Actual' : 'Expected',
            ]}
          />

          <Legend
            wrapperStyle={{ fontSize: 12, fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-secondary)' }}
          />

          {/* Anomaly reference lines */}
          {anomalies.map((a, i) => (
            <ReferenceLine
              key={i}
              x={a.detected_at}
              stroke={ANOMALY_COLOURS[a.severity] ?? 'var(--color-danger)'}
              strokeDasharray="4 2"
              strokeWidth={1.5}
            />
          ))}

          {/* Expected cost — dashed teal line */}
          <Line
            type="monotone"
            dataKey="expected"
            stroke="var(--chart-color-2)"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            name="expected"
          />

          {/* Actual cost — solid blue area */}
          <Area
            type="monotone"
            dataKey="actual"
            stroke="var(--chart-color-1)"
            strokeWidth={2}
            fill="url(#actualGradient)"
            dot={false}
            name="actual"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
