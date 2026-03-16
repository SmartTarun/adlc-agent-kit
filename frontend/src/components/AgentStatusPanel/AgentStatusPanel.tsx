// Agent: Rohan | Sprint: 01 | Date: 2026-03-16
import { useEffect, useState, useCallback } from 'react'
import { agentApi } from '../../api/client'
import type { AgentStatusMap, AgentStatus } from '../../types'
import styles from './AgentStatusPanel.module.css'

const AGENT_NAMES = ['arjun', 'vikram', 'rasool', 'kiran', 'kavya', 'rohan', 'keerthi']

const STATUS_LABEL: Record<AgentStatus, string> = {
  wip: 'WIP',
  done: 'DONE',
  blocked: 'BLOCKED',
  queue: 'QUEUE',
}

function AgentAvatar({ name }: { name: string }) {
  const colours = [
    'var(--color-primary-600)',
    'var(--color-accent-600)',
    'var(--color-primary-700)',
    'var(--color-accent-700)',
    'var(--color-primary-500)',
    'var(--color-accent-500)',
    'var(--color-primary-800)',
  ]
  const idx = AGENT_NAMES.indexOf(name) % colours.length
  return (
    <div
      className={styles.avatar}
      style={{ background: colours[idx] }}
      aria-hidden="true"
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}

export default function AgentStatusPanel() {
  const [data, setData] = useState<AgentStatusMap | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const result = await agentApi.status()
      setData(result)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 10_000)
    return () => clearInterval(interval)
  }, [load])

  if (loading) {
    return (
      <div className={styles.panel}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className={styles.row}>
            <div className={`skeleton ${styles.avatarSkeleton}`} />
            <div className={styles.info}>
              <div className={`skeleton`} style={{ height: 12, width: 80 }} />
              <div className={`skeleton`} style={{ height: 10, width: 160, marginTop: 4 }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className={styles.panel} role="region" aria-label="Agent status panel">
      {AGENT_NAMES.map((name) => {
        const entry = data.agents[name]
        if (!entry) return null
        return (
          <div key={name} className={styles.row}>
            <AgentAvatar name={name} />
            <div className={styles.info}>
              <div className={styles.nameRow}>
                <span className={styles.name}>{name.charAt(0).toUpperCase() + name.slice(1)}</span>
                <span className={`${styles.badge} ${styles[`badge_${entry.status}`]}`}>
                  {STATUS_LABEL[entry.status]}
                </span>
                <span className={styles.progress}>{entry.progress}%</span>
              </div>
              <p className={styles.task} title={entry.task}>{entry.task || '—'}</p>
              <div
                className={styles.progressBar}
                role="progressbar"
                aria-valuenow={entry.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${name} progress`}
              >
                <div
                  className={`${styles.progressFill} ${entry.status === 'blocked' ? styles.progressBlocked : ''}`}
                  style={{ width: `${entry.progress}%` }}
                />
              </div>
              {entry.blocker && (
                <p className={styles.blocker} title={entry.blocker}>
                  ⚠ {entry.blocker}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
