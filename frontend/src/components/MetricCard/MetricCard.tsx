// Agent: Rohan | Sprint: 01 | Date: 2026-03-16
import type { ReactNode } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import styles from './MetricCard.module.css'

type Variant = 'default' | 'warning' | 'danger' | 'success'
type TrendDirection = 'up' | 'down' | 'flat'

interface MetricCardProps {
  label: string
  value: string | number
  unit?: string
  trend?: { value: number; direction: TrendDirection }
  variant?: Variant
  icon?: ReactNode
  loading?: boolean
}

const TREND_ICONS = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
}

export default function MetricCard({
  label,
  value,
  unit,
  trend,
  variant = 'default',
  icon,
  loading = false,
}: MetricCardProps) {
  if (loading) {
    return (
      <div className={`${styles.card} ${styles[variant]}`}>
        <div className={`skeleton ${styles.skeletonLabel}`} />
        <div className={`skeleton ${styles.skeletonValue}`} />
        <div className={`skeleton ${styles.skeletonContext}`} />
      </div>
    )
  }

  const TrendIcon = trend ? TREND_ICONS[trend.direction] : null

  return (
    <div className={`${styles.card} ${styles[variant]}`} role="region" aria-label={label}>
      <div className={styles.header}>
        {icon && <span className={styles.icon} aria-hidden="true">{icon}</span>}
        <span className={styles.label}>{label}</span>
        {trend && TrendIcon && (
          <span
            className={`${styles.trend} ${
              trend.direction === 'up' ? styles.trendUp : trend.direction === 'down' ? styles.trendDown : styles.trendFlat
            }`}
            aria-label={`Trend: ${trend.direction} ${trend.value}%`}
          >
            <TrendIcon size={14} aria-hidden="true" />
            <span>{Math.abs(trend.value)}%</span>
          </span>
        )}
      </div>
      <div className={styles.value}>
        {unit && unit !== '$' && <span className={styles.unit}>{unit} </span>}
        {unit === '$' && <span className={styles.unit}>$</span>}
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  )
}
