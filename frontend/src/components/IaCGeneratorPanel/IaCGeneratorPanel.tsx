// Agent: Rohan | Sprint: 01 | Date: 2026-03-16
import { useState, useRef } from 'react'
import { Sparkles, Send, ChevronDown } from 'lucide-react'
import { iacApi } from '../../api/client'
import type { IaCGenerateResponse } from '../../types'
import styles from './IaCGeneratorPanel.module.css'

const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-central-1', 'ap-south-1', 'ap-southeast-1',
]

interface IaCGeneratorPanelProps {
  onCodeGenerated: (response: IaCGenerateResponse) => void
  projectId?: string
}

export default function IaCGeneratorPanel({ onCodeGenerated, projectId }: IaCGeneratorPanelProps) {
  const [description, setDescription] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  async function handleGenerate() {
    if (!description.trim()) return
    setError(null)
    setLoading(true)
    setStreaming(true)

    try {
      // Try SSE streaming first; fall back to regular POST
      const useSSE = true
      if (useSSE) {
        await streamGenerate()
      } else {
        const response = await iacApi.generate({
          description: description.trim(),
          provider: 'terraform',
          resource_types: [],
          region,
          tags: {
            Environment: 'dev',
            Owner: 'TeamPanchayat',
            CostCenter: 'ADLC-Sprint01',
            Project: 'CostAnomalyPlatform',
          },
          project_id: projectId,
        })
        onCodeGenerated(response)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setLoading(false)
      setStreaming(false)
    }
  }

  async function streamGenerate() {
    const resp = await fetch('/api/v1/iac/generate/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${JSON.parse(localStorage.getItem('infraviz_user') || '{}').token ?? ''}`,
      },
      body: JSON.stringify({
        description: description.trim(),
        provider: 'terraform',
        resource_types: [],
        region,
        tags: { Environment: 'dev', Owner: 'TeamPanchayat' },
        project_id: projectId,
      }),
    })

    if (!resp.ok) {
      // Fall back to non-streaming
      const data = await resp.json() as IaCGenerateResponse
      onCodeGenerated(data)
      return
    }

    const reader = resp.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let accumulated = ''
    let sessionId = ''
    let model = ''
    let tokensUsed = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') {
            onCodeGenerated({
              code: accumulated,
              language: 'terraform',
              provider: 'terraform',
              model,
              tokens_used: tokensUsed,
              session_id: sessionId,
            })
            return
          }
          try {
            const parsed = JSON.parse(data) as {
              delta?: string
              session_id?: string
              model?: string
              tokens_used?: number
            }
            if (parsed.delta) accumulated += parsed.delta
            if (parsed.session_id) sessionId = parsed.session_id
            if (parsed.model) model = parsed.model
            if (parsed.tokens_used) tokensUsed = parsed.tokens_used

            // Live preview while streaming
            onCodeGenerated({
              code: accumulated,
              language: 'terraform',
              provider: 'terraform',
              model,
              tokens_used: tokensUsed,
              session_id: sessionId,
            })
          } catch {
            // partial JSON chunk — skip
          }
        }
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void handleGenerate()
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <Sparkles size={16} color="var(--color-accent-400)" aria-hidden="true" />
        <h2 className={styles.title}>IaC Generator</h2>
        <span className={styles.hint}>Powered by claude-sonnet-4-6</span>
      </div>

      <div className={styles.controls}>
        <div className={styles.regionSelect}>
          <label htmlFor="region-select" className={styles.selectLabel}>Region</label>
          <div className={styles.selectWrap}>
            <select
              id="region-select"
              className={styles.select}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              disabled={loading}
            >
              {AWS_REGIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <ChevronDown size={14} className={styles.selectArrow} aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className={styles.inputWrap}>
        <label htmlFor="iac-description" className={styles.inputLabel}>
          Describe your infrastructure
        </label>
        <textarea
          id="iac-description"
          ref={textareaRef}
          className={styles.textarea}
          placeholder={`e.g. Create a VPC with 2 public and 2 private subnets, an EC2 t3.micro web server, an RDS PostgreSQL db.t3.micro, and an S3 bucket for static assets. Tag everything with CostCenter=ADLC-Sprint01.`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={5}
          disabled={loading}
          aria-describedby={error ? 'iac-error' : undefined}
        />
        <span className={styles.shortcutHint}>Ctrl+Enter to generate</span>
      </div>

      {error && (
        <p id="iac-error" className={styles.error} role="alert">{error}</p>
      )}

      <button
        className={styles.generateBtn}
        onClick={() => void handleGenerate()}
        disabled={loading || !description.trim()}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <span className={`${styles.spinner}`} aria-hidden="true" />
            {streaming ? 'Streaming…' : 'Generating…'}
          </>
        ) : (
          <>
            <Send size={15} aria-hidden="true" />
            Generate Terraform
          </>
        )}
      </button>
    </div>
  )
}
