// Agent: Rohan | Sprint: 01 | Date: 2026-03-28
import type { RiskLevel } from '../../../types/cbre'
import styles from './RiskBadge.module.css'

interface RiskBadgeProps {
  level: RiskLevel
  showDot?: boolean
}

export default function RiskBadge({ level, showDot = true }: RiskBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[`badge_${level.toLowerCase()}`]}`}>
      {showDot && <span className={styles.dot} aria-hidden="true" />}
      {level}
    </span>
  )
}
