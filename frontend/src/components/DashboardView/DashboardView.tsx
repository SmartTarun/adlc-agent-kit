// Agent: rohan | Sprint: 01 | Date: 2026-03-16
import { useState, useRef } from 'react'
import { Sparkles, Copy, Download, CheckCircle, ChevronDown } from 'lucide-react'
import Editor from '@monaco-editor/react'
import { iacApi } from '../../api/client'
import type { InfraVizGenerateResponse, TerraformFile } from '../../types'
import styles from './DashboardView.module.css'

const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-central-1', 'ap-south-1', 'ap-southeast-1',
]

const RESULT_TABS = [
  { id: 'terraform',    label: 'Terraform Files' },
  { id: 'parsed',       label: 'Parsed' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'diagram',      label: 'Diagram' },
  { id: 'cost',         label: 'Cost' },
  { id: 'compliance',   label: 'Compliance' },
  { id: 'deployment',   label: 'Deployment' },
] as const

type ResultTab = (typeof RESULT_TABS)[number]['id']

export default function DashboardView() {
  const [prompt, setPrompt] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<InfraVizGenerateResponse | null>(null)
  const [activeTab, setActiveTab] = useState<ResultTab>('terraform')
  const [activeTfFile, setActiveTfFile] = useState(0)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  async function handleGenerate() {
    if (!prompt.trim()) return
    setError(null)
    setGenerating(true)
    setResult(null)
    try {
      const data = await iacApi.generateInfraViz({
        description: prompt.trim(),
        provider: 'terraform',
        resource_types: [],
        region,
        tags: {
          Environment: 'dev',
          Owner: 'TeamPanchayat',
          CostCenter: 'ADLC-Sprint01',
          Project: 'InfraViz',
        },
      })
      setResult(data)
      setActiveTab('terraform')
      setActiveTfFile(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void handleGenerate()
    }
  }

  function getTabContent(): string {
    if (!result) return ''
    switch (activeTab) {
      case 'terraform':    return result.terraform_files?.[activeTfFile]?.content ?? ''
      case 'parsed':       return result.parsed_requirements
      case 'architecture': return result.architecture_design
      case 'diagram':      return result.architecture_diagram
      case 'cost':         return result.cost_estimate
      case 'compliance':   return result.compliance_checklist
      case 'deployment':   return result.deployment_guide
      default:             return ''
    }
  }

  async function handleCopy() {
    const text = getTabContent()
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownloadAll() {
    if (!result?.terraform_files?.length) return
    result.terraform_files.forEach((f: TerraformFile) => {
      const blob = new Blob([f.content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = f.filename
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const isCodeTab = activeTab === 'terraform'
  const isDiagramTab = activeTab === 'diagram'
  const hasResult = result !== null

  return (
    <div className={styles.dashboard}>
      {/* ── Prompt panel ── */}
      <section className={styles.promptPanel} aria-label="IaC generation prompt">
        <div className={styles.promptHeader}>
          <div className={styles.promptTitle}>
            <Sparkles size={16} color="var(--color-accent-400)" aria-hidden="true" />
            <h2>IaC Generator</h2>
            <span className={styles.modelBadge}>claude-sonnet-4-6</span>
          </div>

          <div className={styles.promptControls}>
            <div className={styles.regionWrap}>
              <label htmlFor="dash-region" className={styles.regionLabel}>Region</label>
              <div className={styles.selectWrap}>
                <select
                  id="dash-region"
                  className={styles.select}
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  disabled={generating}
                  aria-label="AWS region"
                >
                  {AWS_REGIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <ChevronDown size={12} className={styles.selectArrow} aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>

        <div className={styles.textareaWrap}>
          <label htmlFor="dash-prompt" className={styles.textareaLabel}>
            Describe your infrastructure
          </label>
          <textarea
            id="dash-prompt"
            ref={textareaRef}
            className={styles.textarea}
            placeholder={
              'e.g. Create a highly available web application with:\n' +
              '• VPC with 2 public + 2 private subnets across 2 AZs\n' +
              '• EC2 Auto Scaling Group (t3.medium) behind an Application Load Balancer\n' +
              '• RDS PostgreSQL db.t3.micro in private subnets\n' +
              '• S3 bucket for static assets with CloudFront distribution\n' +
              '• All resources tagged with Environment=dev, CostCenter=ADLC-Sprint01'
            }
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={8}
            disabled={generating}
            aria-describedby={error ? 'dash-error' : 'dash-hint'}
          />
          <span id="dash-hint" className={styles.shortcutHint}>Ctrl+Enter to generate</span>
        </div>

        {error && (
          <p id="dash-error" className={styles.errorMsg} role="alert">{error}</p>
        )}

        <button
          className={styles.generateBtn}
          onClick={() => void handleGenerate()}
          disabled={generating || !prompt.trim()}
          aria-busy={generating}
        >
          {generating ? (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles size={15} aria-hidden="true" />
              Generate Terraform
            </>
          )}
        </button>

        {result && (
          <div className={styles.meta}>
            <span className={styles.metaItem}>{result.model}</span>
            <span className={styles.metaDot}>·</span>
            <span className={styles.metaItem}>{result.tokens_used.toLocaleString()} tokens</span>
            <span className={styles.metaDot}>·</span>
            <span className={styles.metaItem}>{result.terraform_files?.length ?? 0} files</span>
          </div>
        )}
      </section>

      {/* ── Result panel ── */}
      <section className={styles.resultSection} aria-label="Generation results">
        {!hasResult && !generating && (
          <div className={styles.emptyResult}>
            <div className={styles.emptyIcon} aria-hidden="true">🏗️</div>
            <p className={styles.emptyTitle}>Describe your infrastructure above</p>
            <p className={styles.emptySubtitle}>
              Claude will generate production-ready Terraform including architecture docs,
              cost estimates, and deployment guides.
            </p>
          </div>
        )}

        {generating && (
          <div className={styles.generatingOverlay}>
            <span className={styles.generatingSpinner} aria-hidden="true" />
            <p className={styles.generatingText}>
              Claude is designing your infrastructure…
            </p>
            <p className={styles.generatingSubtext}>
              Running 7-step pipeline: parse → design → terraform → diagram → cost → compliance → deployment
            </p>
          </div>
        )}

        {hasResult && !generating && (
          <div className={styles.resultWrap}>
            {/* Tab bar */}
            <div className={styles.tabBar} role="tablist">
              {RESULT_TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={activeTab === t.id}
                  className={`${styles.tab} ${activeTab === t.id ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab(t.id)}
                >
                  {t.label}
                </button>
              ))}

              {/* Tab actions */}
              <div className={styles.tabActions}>
                <button
                  className={styles.actionBtn}
                  onClick={() => void handleCopy()}
                  title="Copy"
                  aria-label="Copy current tab content"
                >
                  {copied
                    ? <CheckCircle size={14} color="var(--color-success)" />
                    : <Copy size={14} />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>

                {activeTab === 'terraform' && (
                  <button
                    className={styles.actionBtn}
                    onClick={handleDownloadAll}
                    title="Download .tf files"
                    aria-label="Download all Terraform files"
                  >
                    <Download size={14} />
                    <span>Download</span>
                  </button>
                )}
              </div>
            </div>

            {/* Tab content */}
            <div className={styles.tabContent} role="tabpanel">
              {isCodeTab && (
                <div className={styles.tfWrap}>
                  {result.terraform_files?.length > 0 && (
                    <div className={styles.tfFileTabs}>
                      {result.terraform_files.map((f: TerraformFile, i: number) => (
                        <button
                          key={f.filename}
                          className={`${styles.tfFileTab} ${activeTfFile === i ? styles.activeTfFileTab : ''}`}
                          onClick={() => setActiveTfFile(i)}
                        >
                          {f.filename}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className={styles.monacoWrap}>
                    <Editor
                      height="100%"
                      defaultLanguage="hcl"
                      value={result.terraform_files?.[activeTfFile]?.content ?? ''}
                      theme="vs-dark"
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 13,
                        fontFamily: 'var(--font-family-mono)',
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                        padding: { top: 12 },
                      }}
                    />
                  </div>
                </div>
              )}

              {isDiagramTab && (
                <pre className={styles.diagramPre}>{result.architecture_diagram}</pre>
              )}

              {!isCodeTab && !isDiagramTab && (
                <div className={styles.markdownPane}>
                  <pre className={styles.mdPre}>{getTabContent()}</pre>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
