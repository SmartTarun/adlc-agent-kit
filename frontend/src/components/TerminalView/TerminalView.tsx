// Agent: rohan | Sprint: 01 | Date: 2026-03-16
import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { Terminal, X } from 'lucide-react'
import styles from './TerminalView.module.css'

interface TerminalLine {
  id: string
  type: 'input' | 'output' | 'error' | 'system' | 'streaming'
  text: string
}

const WELCOME_LINES: TerminalLine[] = [
  { id: 'w1', type: 'system', text: 'InfraViz Terminal — claude-sonnet-4-6' },
  { id: 'w2', type: 'system', text: 'Type your infrastructure description and press Enter to generate Terraform.' },
  { id: 'w3', type: 'system', text: 'Commands: help  clear  history' },
  { id: 'w4', type: 'system', text: '' },
]

const HELP_TEXT = `InfraViz Terminal — Available commands:

  <description>    Natural language infrastructure description
                   Claude generates Terraform via streaming SSE.

  help             Show this help message
  clear            Clear the terminal
  history          Show command history

Examples:
  > Create a VPC with 2 public subnets and an EC2 instance
  > RDS PostgreSQL with read replica in us-east-1
  > Lambda + API Gateway + DynamoDB serverless stack`

export default function TerminalView() {
  const [lines, setLines] = useState<TerminalLine[]>(WELCOME_LINES)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)

  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const streamingLineIdRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  function scrollToBottom() {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [lines])

  function lineId() {
    return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }

  function appendLine(line: Omit<TerminalLine, 'id'>) {
    setLines((prev) => [...prev, { ...line, id: lineId() }])
  }

  function updateStreamingLine(id: string, text: string) {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, text } : l))
    )
  }

  function handleClear() {
    setLines(WELCOME_LINES)
    streamingLineIdRef.current = null
  }

  function handleAbort() {
    abortRef.current?.abort()
    setStreaming(false)
    appendLine({ type: 'system', text: '[Stream aborted]' })
  }

  async function handleSubmit() {
    const cmd = input.trim()
    if (!cmd) return
    setInput('')
    setHistoryIdx(-1)

    // Echo input
    appendLine({ type: 'input', text: `> ${cmd}` })

    // Update history
    setHistory((prev) => [cmd, ...prev.slice(0, 49)])

    // Built-in commands
    if (cmd === 'clear') { handleClear(); return }
    if (cmd === 'help') { appendLine({ type: 'output', text: HELP_TEXT }); return }
    if (cmd === 'history') {
      appendLine({ type: 'output', text: history.length === 0 ? '(no history)' : history.map((h, i) => `  ${i + 1}  ${h}`).join('\n') })
      return
    }

    // Generate via SSE
    await streamGenerate(cmd)
  }

  async function streamGenerate(description: string) {
    setStreaming(true)
    appendLine({ type: 'system', text: 'Connecting to Claude (claude-sonnet-4-6)…' })

    const token = (() => {
      try { return (JSON.parse(localStorage.getItem('infraviz_user') ?? '{}') as { token?: string }).token ?? '' }
      catch { return '' }
    })()

    const ctrl = new AbortController()
    abortRef.current = ctrl

    // Create the streaming output line
    const sLineId = lineId()
    streamingLineIdRef.current = sLineId
    setLines((prev) => [
      ...prev,
      { id: sLineId, type: 'streaming', text: '' },
    ])

    try {
      const resp = await fetch('/api/v1/iac/generate/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          description,
          provider: 'terraform',
          resource_types: [],
          region: 'us-east-1',
          tags: { Environment: 'dev', Owner: 'TeamPanchayat', CostCenter: 'ADLC-Sprint01', Project: 'InfraViz' },
        }),
        signal: ctrl.signal,
      })

      if (!resp.ok) {
        const msg = await resp.text()
        updateStreamingLine(sLineId, `[Error ${resp.status}] ${msg}`)
        setStreaming(false)
        return
      }

      const reader = resp.body?.getReader()
      if (!reader) {
        updateStreamingLine(sLineId, '[Error] No response body')
        setStreaming(false)
        return
      }

      const decoder = new TextDecoder()
      let accumulated = ''
      let finished = false

      while (!finished) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const rawLine of lines) {
          if (!rawLine.startsWith('data: ')) continue
          const data = rawLine.slice(6).trim()
          if (data === '[DONE]') { finished = true; break }
          try {
            const parsed = JSON.parse(data) as { delta?: string; error?: string }
            if (parsed.error) {
              updateStreamingLine(sLineId, `[Claude error] ${parsed.error}`)
              finished = true
              break
            }
            if (parsed.delta) {
              accumulated += parsed.delta
              updateStreamingLine(sLineId, accumulated)
            }
          } catch {
            // partial SSE chunk — continue
          }
        }
      }

      if (!accumulated) {
        updateStreamingLine(sLineId, '[No output received]')
      } else {
        appendLine({ type: 'system', text: '\n[Generation complete]' })
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      updateStreamingLine(sLineId, `[Connection error] ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setStreaming(false)
      streamingLineIdRef.current = null
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      void handleSubmit()
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(historyIdx + 1, history.length - 1)
      setHistoryIdx(next)
      setInput(history[next] ?? '')
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIdx <= 0) { setHistoryIdx(-1); setInput(''); return }
      const next = historyIdx - 1
      setHistoryIdx(next)
      setInput(history[next] ?? '')
      return
    }
    if (e.key === 'c' && e.ctrlKey) {
      handleAbort()
      setInput('')
      return
    }
  }

  return (
    <div className={styles.terminal} onClick={() => inputRef.current?.focus()} aria-label="InfraViz terminal">
      {/* Header */}
      <div className={styles.termHeader}>
        <Terminal size={14} className={styles.termIcon} aria-hidden="true" />
        <span className={styles.termTitle}>infraviz-terminal</span>
        {streaming && (
          <span className={styles.streamBadge} aria-label="Streaming">
            <span className={styles.streamDot} aria-hidden="true" />
            streaming
          </span>
        )}
        {streaming && (
          <button
            className={styles.abortBtn}
            onClick={handleAbort}
            title="Abort (Ctrl+C)"
            aria-label="Abort streaming"
          >
            <X size={12} />
            <span>Abort</span>
          </button>
        )}
      </div>

      {/* Output */}
      <div ref={outputRef} className={styles.outputArea} aria-live="polite" aria-label="Terminal output">
        {lines.map((line) => {
          const typeClass = line.type === 'output' ? styles.outputLine : styles[line.type]
          return (
          <div key={line.id} className={`${styles.line} ${typeClass}`}>
            {line.type === 'streaming' && line.text === '' ? (
              <span className={styles.cursor} aria-label="Cursor">▊</span>
            ) : (
              <span className={styles.lineText}>{line.text}</span>
            )}
            {line.type === 'streaming' && line.text !== '' && (
              <span className={styles.cursor} aria-hidden="true">▊</span>
            )}
          </div>
          )
        })}
      </div>

      {/* Input */}
      <div className={styles.inputRow}>
        <span className={styles.prompt} aria-hidden="true">{'>'}</span>
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={streaming}
          placeholder={streaming ? 'Streaming… (Ctrl+C to abort)' : 'Describe infrastructure or type help…'}
          autoComplete="off"
          spellCheck={false}
          aria-label="Terminal input"
        />
      </div>
    </div>
  )
}
