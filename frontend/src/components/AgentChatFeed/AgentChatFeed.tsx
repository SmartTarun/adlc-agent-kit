// Agent: Rohan | Sprint: 01 | Date: 2026-03-16
import { useEffect, useRef, useState, useCallback } from 'react'
import { agentApi } from '../../api/client'
import type { ChatMessage, ChatMessageType } from '../../types'
import styles from './AgentChatFeed.module.css'

const AGENT_COLOURS: Record<string, string> = {
  ARJUN:   'var(--color-primary-600)',
  VIKRAM:  'var(--color-accent-600)',
  RASOOL:  'var(--color-primary-500)',
  KIRAN:   'var(--color-accent-500)',
  KAVYA:   'var(--color-primary-400)',
  ROHAN:   'var(--color-accent-400)',
  KEERTHI: 'var(--color-primary-700)',
  TARUN:   'var(--color-primary-300)',
  SYSTEM:  'var(--color-bg-overlay)',
}

function getAvatar(from: string) {
  return from.slice(0, 2).toUpperCase()
}

function getAvatarColour(from: string) {
  return AGENT_COLOURS[from.toUpperCase()] ?? 'var(--color-bg-overlay)'
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const type = msg.type as ChatMessageType

  if (type === 'system') {
    return (
      <div className={styles.systemMsg}>
        <span>{msg.message}</span>
      </div>
    )
  }

  if (type === 'broadcast') {
    return (
      <div className={styles.broadcast}>
        <span className={styles.broadcastFrom}>{msg.from}</span>
        <span>{msg.message}</span>
      </div>
    )
  }

  if (type === 'requirement') {
    return (
      <div className={styles.requirement}>
        <div className={styles.requirementHeader}>
          <span className={styles.requirementBadge}>REQUIREMENT</span>
          <span className={styles.msgTime}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
        </div>
        <p className={styles.msgText}>{msg.message}</p>
      </div>
    )
  }

  if (type === 'analysis') {
    return (
      <div className={styles.analysis}>
        <div className={styles.msgHeader}>
          <div
            className={styles.avatar}
            style={{ background: getAvatarColour(msg.from) }}
          >
            {getAvatar(msg.from)}
          </div>
          <div>
            <span className={styles.msgFrom}>{msg.from}</span>
            <span className={styles.msgRole}> · {msg.role}</span>
          </div>
          <span className={styles.msgTime}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
          <span className={styles.analysisBadge}>ANALYSIS</span>
        </div>
        <p className={styles.msgText}>{msg.summary || msg.message.split('\n')[0]}</p>
        {msg.questions && msg.questions.length > 0 && (
          <ul className={styles.questions}>
            {msg.questions.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className={styles.chat}>
      <div
        className={styles.avatar}
        style={{ background: getAvatarColour(msg.from) }}
        aria-hidden="true"
      >
        {getAvatar(msg.from)}
      </div>
      <div className={styles.chatBubble}>
        <div className={styles.msgHeader}>
          <span className={styles.msgFrom}>{msg.from}</span>
          <span className={styles.msgRole}> · {msg.role}</span>
          <span className={styles.msgTime}>{new Date(msg.timestamp).toLocaleTimeString()}</span>
        </div>
        <p className={styles.msgText}>{msg.message}</p>
      </div>
    </div>
  )
}

export default function AgentChatFeed() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const result = await agentApi.chat()
      setMessages(result.messages)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 5_000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className={styles.feed} role="log" aria-label="Team chat feed" aria-live="polite">
      {loading ? (
        <div className={styles.loading}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={styles.skeletonMsg}>
              <div className={`skeleton ${styles.skeletonAvatar}`} />
              <div className={styles.skeletonContent}>
                <div className="skeleton" style={{ height: 10, width: 100 }} />
                <div className="skeleton" style={{ height: 14, width: '80%', marginTop: 4 }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
      )}
      <div ref={bottomRef} />
    </div>
  )
}
