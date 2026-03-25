// Agent: rohan | Sprint: 01 | Date: 2026-03-16
import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Network,
  Terminal,
  MessageSquareCode,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import styles from './Sidebar.module.css'

const NAV_ITEMS = [
  { icon: LayoutDashboard,  label: 'Overview',   to: '/' },
  { icon: Network,          label: 'Canvas',     to: '/canvas' },
  { icon: MessageSquareCode, label: 'Dashboard', to: '/dashboard' },
  { icon: Terminal,         label: 'Terminal',   to: '/terminal' },
] as const

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <nav
      className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}
      aria-label="Primary navigation"
    >
      <ul className={styles.navList} role="list">
        {NAV_ITEMS.map(({ icon: Icon, label, to }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.active : ''}`
              }
              title={collapsed ? label : undefined}
              aria-label={collapsed ? label : undefined}
            >
              <Icon size={18} aria-hidden="true" className={styles.navIcon} />
              {!collapsed && <span className={styles.navLabel}>{label}</span>}
            </NavLink>
          </li>
        ))}
      </ul>

      <button
        className={styles.collapseBtn}
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </nav>
  )
}
