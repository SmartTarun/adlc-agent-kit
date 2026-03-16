// Agent: Rohan | Sprint: 01 | Date: 2026-03-16
import { CheckCircle, ZoomIn, AlertCircle, AlertTriangle, Info, Minus } from 'lucide-react'
import type { AnomalyRecord, AnomalySeverity } from '../../types'
import styles from './AnomalyTable.module.css'

interface AnomalyTableProps {
  anomalies: AnomalyRecord[]
  onAcknowledge: (id: string) => void
  onDrillDown: (id: string) => void
  loading?: boolean
  pageSize?: number
}

const SEVERITY_ICONS: Record<AnomalySeverity, typeof AlertCircle> = {
  critical: AlertCircle,
  high: AlertTriangle,
  medium: AlertTriangle,
  low: Info,
}

const SEVERITY_LABELS: Record<AnomalySeverity, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
}

function formatDelta(delta?: number) {
  if (delta == null) return '—'
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toFixed(1)}%`
}

function formatCost(value?: number) {
  if (value == null) return '—'
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function AnomalyTable({
  anomalies,
  onAcknowledge,
  onDrillDown,
  loading = false,
  pageSize = 20,
}: AnomalyTableProps) {
  const displayed = anomalies.slice(0, pageSize)

  if (loading) {
    return (
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label="Anomalies loading">
          <thead className={styles.thead}>
            <tr>
              {['Severity', 'Service', 'Resource', 'Detected', 'Expected', 'Actual', 'Delta', 'Action'].map((h) => (
                <th key={h} className={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className={styles.skeletonRow}>
                <td colSpan={8}><div className="skeleton" style={{ height: 18, borderRadius: 4 }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (anomalies.length === 0) {
    return (
      <div className={styles.empty} role="status">
        <Minus size={24} aria-hidden="true" />
        <span>No anomalies detected</span>
      </div>
    )
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} aria-label="Cost anomalies">
        <thead className={styles.thead}>
          <tr>
            <th className={styles.th} scope="col">Severity</th>
            <th className={styles.th} scope="col">Service</th>
            <th className={styles.th} scope="col">Resource</th>
            <th className={styles.th} scope="col">Detected</th>
            <th className={styles.th} scope="col">Expected</th>
            <th className={styles.th} scope="col">Actual</th>
            <th className={styles.th} scope="col">Delta %</th>
            <th className={styles.th} scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {displayed.map((a) => {
            const SevIcon = SEVERITY_ICONS[a.severity]
            return (
              <tr key={a.id} className={`${styles.row} ${styles[`row_${a.severity}`]}`}>
                <td className={styles.td}>
                  <span className={`${styles.severityBadge} ${styles[`badge_${a.severity}`]}`}>
                    <SevIcon size={12} aria-hidden="true" />
                    {SEVERITY_LABELS[a.severity]}
                  </span>
                </td>
                <td className={`${styles.td} ${styles.mono}`}>{a.service}</td>
                <td className={`${styles.td} ${styles.mono}`}>{a.resource_name}</td>
                <td className={`${styles.td} ${styles.mono} ${styles.muted}`}>
                  {new Date(a.detected_at).toLocaleString()}
                </td>
                <td className={`${styles.td} ${styles.mono}`}>{formatCost(a.expected_cost)}</td>
                <td className={`${styles.td} ${styles.mono}`}>{formatCost(a.actual_cost)}</td>
                <td className={`${styles.td} ${styles.mono} ${a.delta_percent && a.delta_percent > 0 ? styles.deltaUp : styles.deltaDown}`}>
                  {formatDelta(a.delta_percent)}
                </td>
                <td className={styles.td}>
                  <div className={styles.actions}>
                    {a.status === 'open' && (
                      <button
                        className={styles.actionBtn}
                        onClick={() => onAcknowledge(a.id)}
                        aria-label={`Acknowledge anomaly for ${a.resource_name}`}
                        title="Acknowledge"
                      >
                        <CheckCircle size={14} aria-hidden="true" />
                      </button>
                    )}
                    <button
                      className={styles.actionBtn}
                      onClick={() => onDrillDown(a.id)}
                      aria-label={`Drill down into ${a.resource_name}`}
                      title="Drill down"
                    >
                      <ZoomIn size={14} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
