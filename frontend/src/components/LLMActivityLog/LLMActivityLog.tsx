// Agent: Rohan | Sprint: 01 | Date: 2026-03-16
import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { LLMConversation } from '../../types'
import styles from './LLMActivityLog.module.css'

interface LLMActivityLogProps {
  entries: LLMConversation[]
  loading?: boolean
}

function LogRow({ entry }: { entry: LLMConversation }) {
  const [expanded, setExpanded] = useState(false)
  const ChevronIcon = expanded ? ChevronDown : ChevronRight

  return (
    <div className={styles.logRow}>
      <button
        className={styles.rowHeader}
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        aria-label={`LLM call at ${new Date(entry.created_at).toLocaleTimeString()}`}
      >
        <ChevronIcon size={14} aria-hidden="true" />
        <span className={styles.timestamp}>{new Date(entry.created_at).toLocaleTimeString()}</span>
        <span className={styles.model}>{entry.model_used}</span>
        <span className={styles.separator}>|</span>
        <span className={styles.tokens}>
          tokens: {entry.tokens_used.toLocaleString()}
        </span>
        <span className={styles.separator}>|</span>
        <span className={styles.latency}>{entry.latency_ms}ms</span>
      </button>

      {expanded && (
        <div className={styles.rowBody}>
          <div className={styles.promptBlock}>
            <span className={styles.promptLabel}>Prompt</span>
            <p className={styles.promptText}>{entry.prompt_text}</p>
          </div>
          <div className={styles.responseBlock}>
            <span className={styles.responseLabel}>Response</span>
            <p className={styles.responseText}>{entry.response_text}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LLMActivityLog({ entries, loading = false }: LLMActivityLogProps) {
  if (loading) {
    return (
      <div className={styles.log}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`skeleton ${styles.skeletonRow}`} />
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return <div className={styles.empty}>No LLM activity yet</div>
  }

  return (
    <div className={styles.log} role="list" aria-label="LLM activity log">
      {entries.map((e) => (
        <LogRow key={e.id} entry={e} />
      ))}
    </div>
  )
}
