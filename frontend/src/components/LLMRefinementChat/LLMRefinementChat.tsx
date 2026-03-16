// Agent: Rohan | Sprint: 01 | Date: 2026-03-16
import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User } from 'lucide-react'
import { llmApi } from '../../api/client'
import type { LLMRefinementResponse } from '../../types'
import styles from './LLMRefinementChat.module.css'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface LLMRefinementChatProps {
  currentCode: string
  sessionId: string
  onRefined: (response: LLMRefinementResponse) => void
}

export default function LLMRefinementChat({ currentCode, sessionId, onRefined }: LLMRefinementChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { role: 'user', content: text, timestamp: new Date() }
    setMessages((m) => [...m, userMsg])
    setInput('')
    setLoading(true)

    try {
      const response = await llmApi.refine({
        session_id: sessionId,
        message: text,
        current_code: currentCode,
      })

      const assistantMsg: Message = {
        role: 'assistant',
        content: response.explanation,
        timestamp: new Date(),
      }
      setMessages((m) => [...m, assistantMsg])
      onRefined(response)
    } catch {
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: 'Sorry, refinement failed. Please try again.', timestamp: new Date() },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className={styles.chat}>
      <div className={styles.header}>
        <Bot size={16} color="var(--color-accent-400)" aria-hidden="true" />
        <h3 className={styles.title}>Refine with Claude</h3>
      </div>

      <div className={styles.messages} role="log" aria-live="polite" aria-label="Chat messages">
        {messages.length === 0 && (
          <div className={styles.emptyState}>
            <Bot size={24} color="var(--color-text-tertiary)" aria-hidden="true" />
            <p>Ask Claude to refine your Terraform code.</p>
            <p className={styles.examples}>
              e.g. "Add encryption to the S3 bucket" or "Add lifecycle policies"
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`${styles.message} ${msg.role === 'user' ? styles.userMsg : styles.assistantMsg}`}
          >
            <div className={styles.msgAvatar}>
              {msg.role === 'user'
                ? <User size={14} aria-label="You" />
                : <Bot size={14} aria-label="Claude" />
              }
            </div>
            <div className={styles.msgBody}>
              <span className={styles.msgSender}>
                {msg.role === 'user' ? 'You' : 'Claude'}
              </span>
              <p className={styles.msgText}>{msg.content}</p>
              <span className={styles.msgTime}>
                {msg.timestamp.toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}

        {loading && (
          <div className={`${styles.message} ${styles.assistantMsg}`}>
            <div className={styles.msgAvatar}><Bot size={14} aria-hidden="true" /></div>
            <div className={styles.msgBody}>
              <span className={styles.msgSender}>Claude</span>
              <p className={`${styles.msgText} stream-cursor`}>Thinking</p>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className={styles.inputArea}>
        <textarea
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Claude to refine… (Enter to send, Shift+Enter for newline)"
          rows={2}
          disabled={loading || !currentCode}
          aria-label="Refinement prompt"
        />
        <button
          className={styles.sendBtn}
          onClick={() => void handleSend()}
          disabled={loading || !input.trim() || !currentCode}
          aria-label="Send refinement request"
        >
          <Send size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
