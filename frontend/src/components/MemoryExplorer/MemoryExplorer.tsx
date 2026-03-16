// Agent: Rohan | Sprint: 01 | Date: 2026-03-16
import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, AlertTriangle, ChevronRight, FileCode, FilePen } from 'lucide-react'
import { agentApi } from '../../api/client'
import type { AgentMemory } from '../../types'
import styles from './MemoryExplorer.module.css'

const AGENTS = ['arjun', 'vikram', 'rasool', 'kiran', 'kavya', 'rohan', 'keerthi']

function ProgressRing({ value }: { value: number }) {
  const r = 20
  const circumference = 2 * Math.PI * r
  const offset = circumference - (value / 100) * circumference
  return (
    <svg width="52" height="52" aria-hidden="true">
      <circle cx="26" cy="26" r={r} fill="none" stroke="var(--color-bg-overlay)" strokeWidth="4" />
      <circle
        cx="26"
        cy="26"
        r={r}
        fill="none"
        stroke="var(--color-primary-400)"
        strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 26 26)"
      />
      <text x="26" y="31" textAnchor="middle" fill="var(--color-text-primary)" fontSize="11" fontFamily="var(--font-family-mono)" fontWeight="600">
        {value}%
      </text>
    </svg>
  )
}

export default function MemoryExplorer() {
  const [selected, setSelected] = useState('rohan')
  const [memory, setMemory] = useState<AgentMemory | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (name: string) => {
    setLoading(true)
    setMemory(null)
    try {
      const m = await agentApi.memory(name)
      setMemory(m)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(selected) }, [selected, load])

  return (
    <div className={styles.explorer}>
      {/* Agent selector */}
      <div className={styles.agentList} role="listbox" aria-label="Select agent">
        {AGENTS.map((a) => (
          <button
            key={a}
            role="option"
            aria-selected={selected === a}
            className={`${styles.agentBtn} ${selected === a ? styles.agentBtnActive : ''}`}
            onClick={() => setSelected(a)}
          >
            {a.charAt(0).toUpperCase() + a.slice(1)}
          </button>
        ))}
      </div>

      {/* Memory detail */}
      <div className={styles.detail}>
        {loading && (
          <div className={styles.loading}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`skeleton ${styles.skeletonBlock}`} />
            ))}
          </div>
        )}
        {!loading && memory && (
          <>
            {/* Current task */}
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Current Task</h3>
              <div className={styles.taskCard}>
                <ProgressRing value={memory.currentTask.progressPercent} />
                <div>
                  <p className={styles.taskTitle}>{memory.currentTask.title || '—'}</p>
                  <p className={styles.taskStep}>{memory.currentTask.lastStepCompleted || 'Not started'}</p>
                  <span className={`${styles.statusBadge} ${styles[`status_${memory.currentTask.status}`]}`}>
                    {memory.currentTask.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </section>

            {/* Completed tasks */}
            {memory.completedTasks.length > 0 && (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Completed</h3>
                <ul className={styles.checkList}>
                  {memory.completedTasks.map((t, i) => (
                    <li key={i} className={styles.checkItem}>
                      <CheckCircle size={14} color="var(--color-success)" aria-hidden="true" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Key decisions */}
            {memory.keyDecisions.length > 0 && (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Key Decisions</h3>
                <ul className={styles.bulletList}>
                  {memory.keyDecisions.map((d, i) => (
                    <li key={i} className={styles.bulletItem}>
                      <ChevronRight size={12} color="var(--color-accent-300)" aria-hidden="true" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Blockers */}
            {memory.blockers.length > 0 && (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Blockers</h3>
                <ul className={styles.blockerList}>
                  {memory.blockers.map((b, i) => (
                    <li key={i} className={styles.blockerItem}>
                      <AlertTriangle size={14} color="var(--color-danger)" aria-hidden="true" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Files */}
            {(memory.filesCreated.length > 0 || memory.filesModified.length > 0) && (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Files</h3>
                <ul className={styles.fileList}>
                  {memory.filesCreated.map((f, i) => (
                    <li key={`c-${i}`} className={styles.fileItem}>
                      <FileCode size={12} color="var(--color-success)" aria-hidden="true" />
                      <span className={styles.filePath}>{f}</span>
                    </li>
                  ))}
                  {memory.filesModified.map((f, i) => (
                    <li key={`m-${i}`} className={styles.fileItem}>
                      <FilePen size={12} color="var(--color-warning)" aria-hidden="true" />
                      <span className={styles.filePath}>{f}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Pending steps */}
            {memory.pendingNextSteps.length > 0 && (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Pending Steps</h3>
                <ol className={styles.pendingList}>
                  {memory.pendingNextSteps.map((s, i) => (
                    <li key={i} className={styles.pendingItem}>{s}</li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
        {!loading && !memory && (
          <p className={styles.empty}>No memory found for {selected}</p>
        )}
      </div>
    </div>
  )
}
