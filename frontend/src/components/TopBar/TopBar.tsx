// Agent: Rohan | Sprint: 01 | Date: 2026-03-16
import { Bell, Search, Zap, LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import styles from './TopBar.module.css'

interface TopBarProps {
  anomalyCount?: number
  agentRunning?: boolean
}

export default function TopBar({ anomalyCount = 0, agentRunning = false }: TopBarProps) {
  const { user, logout } = useAuth()
  const initials = user ? user.username.slice(0, 2).toUpperCase() : 'IV'

  return (
    <header className={styles.topbar} role="banner">
      <div className={styles.left}>
        <Zap size={20} color="var(--color-primary-400)" aria-hidden="true" />
        <span className={styles.wordmark}>Infraviz</span>
      </div>

      <div className={styles.center}>
        <Search size={14} className={styles.searchIcon} aria-hidden="true" />
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search resources, agents, anomalies…"
          aria-label="Global search"
        />
      </div>

      <div className={styles.right}>
        {agentRunning && (
          <span
            className={`${styles.agentDot} agent-pulse`}
            aria-label="Agent running"
            title="Agent is running"
          />
        )}

        <button className={styles.iconBtn} aria-label={`Notifications (${anomalyCount} anomalies)`}>
          <Bell size={18} aria-hidden="true" />
          {anomalyCount > 0 && (
            <span className={styles.badge} aria-hidden="true">
              {anomalyCount > 9 ? '9+' : anomalyCount}
            </span>
          )}
        </button>

        <div className={styles.avatar} title={user?.username} aria-label={`User: ${user?.username}`}>
          {initials}
        </div>

        <button className={styles.iconBtn} onClick={logout} aria-label="Log out">
          <LogOut size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
