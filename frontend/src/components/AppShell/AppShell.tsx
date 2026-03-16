// Agent: Rohan | Sprint: 01 | Date: 2026-03-16
import type { ReactNode } from 'react'
import TopBar from '../TopBar/TopBar'
import Sidebar from '../Sidebar/Sidebar'
import styles from './AppShell.module.css'

interface AppShellProps {
  children: ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <TopBar />
      <div className={styles.body}>
        <Sidebar />
        <main className={styles.main} id="main-content">
          {children}
        </main>
      </div>
    </div>
  )
}
