// Agent: rohan | Sprint: 01 | Date: 2026-03-16
import {
  useState,
  useCallback,
  useRef,
  type DragEvent,
  type ChangeEvent,
} from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  BackgroundVariant,
  Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Sparkles,
  FolderOpen,
  Save,
  FilePlus,
  Trash2,
  Undo2,
  Redo2,
  Upload,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Copy,
  Download,
  Globe,
} from 'lucide-react'
import Editor from '@monaco-editor/react'
import { iacApi, workspaceApi } from '../../api/client'
import type {
  InfraVizGenerateResponse,
  TerraformFile,
  AwsServiceDef,
  CanvasNodeData,
} from '../../types'
import ServiceNode from './ServiceNode'
import GroupNode from './GroupNode'
import styles from './CanvasView.module.css'

// ─── AWS Service catalogue ────────────────────────────
const AWS_SERVICES: AwsServiceDef[] = [
  // Networking
  { type: 'vpc',            label: 'VPC',             category: 'Networking',  icon: '🌐' },
  { type: 'subnet',         label: 'Subnet',          category: 'Networking',  icon: '🔲' },
  { type: 'igw',            label: 'Internet GW',     category: 'Networking',  icon: '🚪' },
  { type: 'nat',            label: 'NAT Gateway',     category: 'Networking',  icon: '🔀' },
  { type: 'sg',             label: 'Security Group',  category: 'Networking',  icon: '🛡️' },
  { type: 'alb',            label: 'Load Balancer',   category: 'Networking',  icon: '⚖️' },
  { type: 'route53',        label: 'Route 53',        category: 'Networking',  icon: '🗺️' },
  { type: 'cloudfront',     label: 'CloudFront',      category: 'Networking',  icon: '⚡' },
  // Compute
  { type: 'ec2',            label: 'EC2',             category: 'Compute',     icon: '🖥️' },
  { type: 'asg',            label: 'Auto Scaling',    category: 'Compute',     icon: '📈' },
  { type: 'ecs',            label: 'ECS',             category: 'Compute',     icon: '🐳' },
  { type: 'eks',            label: 'EKS',             category: 'Compute',     icon: '☸️' },
  // Storage
  { type: 's3',             label: 'S3',              category: 'Storage',     icon: '🪣' },
  { type: 'efs',            label: 'EFS',             category: 'Storage',     icon: '📁' },
  // Database
  { type: 'rds',            label: 'RDS',             category: 'Database',    icon: '🗄️' },
  { type: 'dynamodb',       label: 'DynamoDB',        category: 'Database',    icon: '⚡' },
  { type: 'elasticache',    label: 'ElastiCache',     category: 'Database',    icon: '🔥' },
  // Serverless
  { type: 'lambda',         label: 'Lambda',          category: 'Serverless',  icon: 'λ' },
  { type: 'apigw',          label: 'API Gateway',     category: 'Serverless',  icon: '🚦' },
  { type: 'sqs',            label: 'SQS',             category: 'Serverless',  icon: '📬' },
  { type: 'sns',            label: 'SNS',             category: 'Serverless',  icon: '📢' },
  // Security
  { type: 'secrets',        label: 'Secrets Mgr',     category: 'Security',    icon: '🔑' },
  { type: 'iam',            label: 'IAM Role',        category: 'Security',    icon: '👤' },
  // Monitoring
  { type: 'cloudwatch',     label: 'CloudWatch',      category: 'Monitoring',  icon: '📊' },
]

const GROUP_TYPES: AwsServiceDef[] = [
  { type: 'group-vpc',    label: 'VPC',    category: 'Networking', icon: '🌐' },
  { type: 'group-az',     label: 'AZ',     category: 'Networking', icon: '🏢' },
  { type: 'group-subnet', label: 'Subnet', category: 'Networking', icon: '🔲' },
]

const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-central-1', 'ap-south-1', 'ap-southeast-1',
]

// Tabs for result panel
const RESULT_TABS = [
  { id: 'terraform',    label: 'Terraform' },
  { id: 'parsed',       label: 'Parsed' },
  { id: 'architecture', label: 'Architecture' },
  { id: 'diagram',      label: 'Diagram' },
  { id: 'cost',         label: 'Cost' },
  { id: 'compliance',   label: 'Compliance' },
  { id: 'deployment',   label: 'Deployment' },
  { id: 'validate',     label: 'Validate' },
  { id: 'raw',          label: 'Raw JSON' },
] as const

type ResultTab = (typeof RESULT_TABS)[number]['id']

const NODE_TYPES: NodeTypes = {
  serviceNode: ServiceNode,
  groupNode: GroupNode,
}

const CATEGORIES = ['Networking', 'Compute', 'Storage', 'Database', 'Serverless', 'Security', 'Monitoring'] as const

export default function CanvasView() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [region, setRegion] = useState('us-east-1')
  const [generating, setGenerating] = useState(false)
  const [validating, setValidating] = useState(false)
  const [result, setResult] = useState<InfraVizGenerateResponse | null>(null)
  const [validateResult, setValidateResult] = useState<{ valid: boolean; errors: string[]; warnings: string[] } | null>(null)
  const [activeTab, setActiveTab] = useState<ResultTab>('terraform')
  const [resultOpen, setResultOpen] = useState(false)
  const [activeTfFile, setActiveTfFile] = useState(0)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([])
  const [currentWorkspace, setCurrentWorkspace] = useState<string | null>(null)
  const [paletteFilter, setPaletteFilter] = useState<string>('')

  const nodeIdRef = useRef(0)
  const historyRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([])
  const historyIndexRef = useRef(-1)
  const tfInputRef = useRef<HTMLInputElement>(null)

  // ─── History (undo/redo) ──────────────────────────
  function pushHistory(n: Node[], e: Edge[]) {
    const snapshot = { nodes: n, edges: e }
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1)
    historyRef.current.push(snapshot)
    historyIndexRef.current = historyRef.current.length - 1
  }

  function undo() {
    if (historyIndexRef.current <= 0) return
    historyIndexRef.current -= 1
    const snap = historyRef.current[historyIndexRef.current]
    setNodes(snap.nodes)
    setEdges(snap.edges)
  }

  function redo() {
    if (historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current += 1
    const snap = historyRef.current[historyIndexRef.current]
    setNodes(snap.nodes)
    setEdges(snap.edges)
  }

  // ─── Drag from palette ────────────────────────────
  function onDragStart(e: DragEvent<HTMLDivElement>, service: AwsServiceDef) {
    e.dataTransfer.setData('application/infraviz-service', JSON.stringify(service))
    e.dataTransfer.effectAllowed = 'move'
  }

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData('application/infraviz-service')
      if (!raw) return
      const service: AwsServiceDef = JSON.parse(raw) as AwsServiceDef
      const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const position = { x: e.clientX - bounds.left - 60, y: e.clientY - bounds.top - 20 }
      const isGroup = service.type.startsWith('group-')
      nodeIdRef.current += 1
      const newNode: Node = {
        id: `node-${nodeIdRef.current}`,
        type: isGroup ? 'groupNode' : 'serviceNode',
        position,
        data: {
          label: service.label,
          serviceType: service.type,
          category: service.category,
          icon: service.icon,
          config: {},
        } as CanvasNodeData & { icon: string },
        ...(isGroup ? { style: { width: 240, height: 160 } } : {}),
      }
      setNodes((prev) => {
        const next = [...prev, newNode]
        pushHistory(next, edges)
        return next
      })
    },
    [edges, setNodes]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((prev) => {
        const next = addEdge(
          { ...connection, animated: true, style: { stroke: 'var(--color-primary-400)' } },
          prev
        )
        pushHistory(nodes, next)
        return next
      })
    },
    [nodes, setEdges]
  )

  // ─── Generate IaC ─────────────────────────────────
  async function handleGenerate() {
    if (nodes.length === 0) return
    setError(null)
    setGenerating(true)
    setResultOpen(true)
    try {
      const serviceTypes = nodes
        .filter((n) => n.type === 'serviceNode')
        .map((n) => (n.data as CanvasNodeData).serviceType)
      const data = await iacApi.generateInfraViz({
        description: `Generate Terraform for infrastructure with: ${serviceTypes.join(', ')}`,
        provider: 'terraform',
        resource_types: serviceTypes,
        region,
        tags: { Environment: 'dev', Owner: 'TeamPanchayat', CostCenter: 'ADLC-Sprint01', Project: 'InfraViz' },
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

  // ─── Validate ────────────────────────────────────
  async function handleValidate() {
    if (!result?.terraform_files?.length) return
    setValidating(true)
    setActiveTab('validate')
    setResultOpen(true)
    try {
      const code = result.terraform_files.map((f) => f.content).join('\n\n')
      const res = await iacApi.validate(code, 'terraform')
      setValidateResult(res)
    } catch (e) {
      setValidateResult({ valid: false, errors: [e instanceof Error ? e.message : 'Validate failed'], warnings: [] })
    } finally {
      setValidating(false)
    }
  }

  // ─── Import .tfstate ─────────────────────────────
  function handleTfStateImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const state = JSON.parse(ev.target?.result as string) as {
          resources?: Array<{ type: string; name: string }>
        }
        const resources = state.resources ?? []
        const newNodes: Node[] = resources.slice(0, 20).map((r, i) => {
          nodeIdRef.current += 1
          const svc = AWS_SERVICES.find((s) => r.type.toLowerCase().includes(s.type)) ?? AWS_SERVICES[0]
          return {
            id: `imported-${nodeIdRef.current}`,
            type: 'serviceNode',
            position: { x: 80 + (i % 5) * 160, y: 80 + Math.floor(i / 5) * 120 },
            data: {
              label: r.name || svc.label,
              serviceType: svc.type,
              category: svc.category,
              icon: svc.icon,
              config: {},
            },
          }
        })
        setNodes((prev) => {
          const next = [...prev, ...newNodes]
          pushHistory(next, edges)
          return next
        })
      } catch {
        setError('Invalid .tfstate file')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ─── Workspace CRUD ───────────────────────────────
  async function handleSaveWorkspace() {
    try {
      if (currentWorkspace) {
        await workspaceApi.update(currentWorkspace, { nodes, edges, region, updated_at: new Date().toISOString() })
      } else {
        const name = prompt('Workspace name:') ?? 'Untitled'
        const ws = await workspaceApi.create({ name, nodes, edges, region })
        setCurrentWorkspace(ws.id)
        setWorkspaces((prev) => [...prev, { id: ws.id, name: ws.name }])
      }
    } catch {
      setError('Save failed')
    }
  }

  async function handleNewWorkspace() {
    setNodes([])
    setEdges([])
    setResult(null)
    setValidateResult(null)
    setCurrentWorkspace(null)
    historyRef.current = []
    historyIndexRef.current = -1
  }

  async function handleLoadWorkspace(id: string) {
    try {
      const ws = await workspaceApi.get(id)
      setNodes((ws.nodes ?? []) as Node[])
      setEdges((ws.edges ?? []) as Edge[])
      setRegion(ws.region)
      setCurrentWorkspace(id)
    } catch {
      setError('Load failed')
    }
  }

  async function handleDeleteWorkspace(id: string) {
    try {
      await workspaceApi.delete(id)
      setWorkspaces((prev) => prev.filter((w) => w.id !== id))
      if (currentWorkspace === id) await handleNewWorkspace()
    } catch {
      setError('Delete failed')
    }
  }

  // ─── Copy active tab content ──────────────────────
  async function handleCopy() {
    const text = getTabText()
    if (!text) return
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function getTabText(): string {
    if (!result) return ''
    switch (activeTab) {
      case 'terraform': return result.terraform_files?.[activeTfFile]?.content ?? ''
      case 'parsed': return result.parsed_requirements
      case 'architecture': return result.architecture_design
      case 'diagram': return result.architecture_diagram
      case 'cost': return result.cost_estimate
      case 'compliance': return result.compliance_checklist
      case 'deployment': return result.deployment_guide
      case 'validate': return validateResult ? JSON.stringify(validateResult, null, 2) : ''
      case 'raw': return JSON.stringify(result, null, 2)
      default: return ''
    }
  }

  function handleDownloadTf() {
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

  // ─── Palette filter ───────────────────────────────
  const filteredCategories = CATEGORIES.filter((cat) =>
    AWS_SERVICES.some(
      (s) =>
        s.category === cat &&
        s.label.toLowerCase().includes(paletteFilter.toLowerCase())
    )
  )

  return (
    <div className={styles.canvasRoot}>
      {/* ── Service Palette ── */}
      <aside className={styles.palette} aria-label="AWS service palette">
        <div className={styles.paletteHeader}>
          <span className={styles.paletteTitle}>AWS Services</span>
          <input
            className={styles.paletteSearch}
            type="search"
            placeholder="Filter…"
            value={paletteFilter}
            onChange={(e) => setPaletteFilter(e.target.value)}
            aria-label="Filter services"
          />
        </div>

        <div className={styles.paletteGroups}>
          <div className={styles.paletteCategory}>
            <span className={styles.categoryLabel}>Containers</span>
            {GROUP_TYPES.map((s) => (
              <div
                key={s.type}
                className={`${styles.serviceItem} ${styles.groupItem}`}
                draggable
                onDragStart={(e) => onDragStart(e, s)}
                title={s.label}
                aria-label={`Drag ${s.label} container`}
              >
                <span className={styles.serviceIcon}>{s.icon}</span>
                <span className={styles.serviceLabel}>{s.label}</span>
              </div>
            ))}
          </div>

          {filteredCategories.map((cat) => (
            <div key={cat} className={styles.paletteCategory}>
              <span className={styles.categoryLabel}>{cat}</span>
              {AWS_SERVICES.filter(
                (s) =>
                  s.category === cat &&
                  s.label.toLowerCase().includes(paletteFilter.toLowerCase())
              ).map((s) => (
                <div
                  key={s.type}
                  className={styles.serviceItem}
                  draggable
                  onDragStart={(e) => onDragStart(e, s)}
                  title={s.label}
                  aria-label={`Drag ${s.label}`}
                >
                  <span className={styles.serviceIcon}>{s.icon}</span>
                  <span className={styles.serviceLabel}>{s.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* ── Canvas area ── */}
      <div className={styles.canvasWrap}>
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            {/* Region */}
            <div className={styles.regionWrap}>
              <Globe size={13} className={styles.regionIcon} aria-hidden="true" />
              <select
                className={styles.regionSelect}
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                aria-label="AWS region"
              >
                {AWS_REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* Workspace controls */}
            <button className={styles.toolBtn} onClick={() => void handleNewWorkspace()} title="New workspace" aria-label="New workspace">
              <FilePlus size={14} />
            </button>
            <button className={styles.toolBtn} onClick={() => void handleSaveWorkspace()} title="Save workspace" aria-label="Save workspace">
              <Save size={14} />
            </button>
            {workspaces.length > 0 && (
              <select
                className={styles.workspaceSelect}
                value={currentWorkspace ?? ''}
                onChange={(e) => { if (e.target.value) void handleLoadWorkspace(e.target.value) }}
                aria-label="Load workspace"
              >
                <option value="">Open workspace…</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            )}
            {currentWorkspace && (
              <button
                className={`${styles.toolBtn} ${styles.danger}`}
                onClick={() => void handleDeleteWorkspace(currentWorkspace)}
                title="Delete workspace"
                aria-label="Delete workspace"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div className={styles.toolbarCenter}>
            {/* Undo / Redo */}
            <button className={styles.toolBtn} onClick={undo} title="Undo" aria-label="Undo">
              <Undo2 size={14} />
            </button>
            <button className={styles.toolBtn} onClick={redo} title="Redo" aria-label="Redo">
              <Redo2 size={14} />
            </button>

            {/* Import .tfstate */}
            <input
              ref={tfInputRef}
              type="file"
              accept=".json,.tfstate"
              className={styles.hiddenInput}
              onChange={handleTfStateImport}
              aria-label="Import .tfstate file"
            />
            <button
              className={styles.toolBtn}
              onClick={() => tfInputRef.current?.click()}
              title="Import .tfstate"
              aria-label="Import Terraform state file"
            >
              <Upload size={14} />
              <span className={styles.btnLabel}>Import</span>
            </button>
          </div>

          <div className={styles.toolbarRight}>
            {/* Validate */}
            <button
              className={styles.toolBtn}
              onClick={() => void handleValidate()}
              disabled={validating || !result}
              aria-busy={validating}
              title="Validate Terraform"
            >
              <CheckCircle size={14} />
              <span className={styles.btnLabel}>{validating ? 'Validating…' : 'Validate'}</span>
            </button>

            {/* Generate */}
            <button
              className={styles.generateBtn}
              onClick={() => void handleGenerate()}
              disabled={generating || nodes.length === 0}
              aria-busy={generating}
            >
              <Sparkles size={14} aria-hidden="true" />
              {generating ? 'Generating…' : 'Generate IaC'}
            </button>
          </div>
        </div>

        {error && (
          <div className={styles.errorBar} role="alert">
            {error}
            <button className={styles.errorClose} onClick={() => setError(null)} aria-label="Dismiss error">×</button>
          </div>
        )}

        {/* React Flow */}
        <div
          className={styles.flowWrap}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={NODE_TYPES}
            fitView
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="var(--color-border-subtle)"
            />
            <Controls />
            <MiniMap
              nodeColor="var(--color-primary-400)"
              maskColor="rgba(11,14,20,0.7)"
              style={{ background: 'var(--color-bg-elevated)' }}
            />
            {nodes.length === 0 && (
              <Panel position="top-center">
                <div className={styles.emptyHint}>
                  Drag AWS services from the palette to start designing
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>
      </div>

      {/* ── Result Panel ── */}
      {resultOpen && (
        <div className={styles.resultPanel} aria-label="Generation results">
          <div className={styles.resultHeader}>
            <span className={styles.resultTitle}>
              {generating ? 'Generating…' : 'Results'}
            </span>
            <div className={styles.resultActions}>
              <button
                className={styles.resultToolBtn}
                onClick={() => void handleCopy()}
                disabled={!result}
                title="Copy"
                aria-label="Copy current tab"
              >
                {copied ? <CheckCircle size={13} color="var(--color-success)" /> : <Copy size={13} />}
              </button>
              <button
                className={styles.resultToolBtn}
                onClick={handleDownloadTf}
                disabled={!result?.terraform_files?.length}
                title="Download .tf files"
                aria-label="Download Terraform files"
              >
                <Download size={13} />
              </button>
              <button
                className={styles.closeResultBtn}
                onClick={() => setResultOpen(false)}
                aria-label="Close result panel"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className={styles.resultTabs} role="tablist">
            {RESULT_TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={activeTab === t.id}
                className={`${styles.resultTab} ${activeTab === t.id ? styles.activeTab : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className={styles.resultBody} role="tabpanel">
            {generating && (
              <div className={styles.generatingMsg}>
                <span className={styles.spinnerSm} aria-hidden="true" />
                Claude is generating your infrastructure…
              </div>
            )}

            {!generating && result && (
              <>
                {activeTab === 'terraform' && (
                  <div className={styles.tfFilesWrap}>
                    {result.terraform_files?.length > 0 && (
                      <div className={styles.tfFileTabs}>
                        {result.terraform_files.map((f: TerraformFile, i: number) => (
                          <button
                            key={f.filename}
                            className={`${styles.tfFileTab} ${activeTfFile === i ? styles.activeTfTab : ''}`}
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
                          fontSize: 12,
                          fontFamily: 'var(--font-family-mono)',
                          lineNumbers: 'on',
                          scrollBeyondLastLine: false,
                          wordWrap: 'on',
                          padding: { top: 8 },
                        }}
                      />
                    </div>
                  </div>
                )}
                {activeTab === 'diagram' && (
                  <pre className={styles.diagramPre}>{result.architecture_diagram}</pre>
                )}
                {activeTab === 'validate' && validateResult && (
                  <div className={styles.validateResult}>
                    <div className={validateResult.valid ? styles.validBadge : styles.invalidBadge}>
                      {validateResult.valid ? '✓ Valid' : '✗ Invalid'}
                    </div>
                    {validateResult.errors.length > 0 && (
                      <ul className={styles.errorList}>
                        {validateResult.errors.map((err, i) => (
                          <li key={i} className={styles.errorItem}>{err}</li>
                        ))}
                      </ul>
                    )}
                    {validateResult.warnings.length > 0 && (
                      <ul className={styles.warnList}>
                        {validateResult.warnings.map((w, i) => (
                          <li key={i} className={styles.warnItem}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {activeTab === 'raw' && (
                  <div className={styles.monacoWrap}>
                    <Editor
                      height="100%"
                      defaultLanguage="json"
                      value={JSON.stringify(result, null, 2)}
                      theme="vs-dark"
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 12,
                        fontFamily: 'var(--font-family-mono)',
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        padding: { top: 8 },
                      }}
                    />
                  </div>
                )}
                {(activeTab === 'parsed' ||
                  activeTab === 'architecture' ||
                  activeTab === 'cost' ||
                  activeTab === 'compliance' ||
                  activeTab === 'deployment') && (
                  <div className={styles.markdownPane}>
                    <pre className={styles.mdPre}>
                      {activeTab === 'parsed' && result.parsed_requirements}
                      {activeTab === 'architecture' && result.architecture_design}
                      {activeTab === 'cost' && result.cost_estimate}
                      {activeTab === 'compliance' && result.compliance_checklist}
                      {activeTab === 'deployment' && result.deployment_guide}
                    </pre>
                  </div>
                )}
              </>
            )}

            {!generating && !result && activeTab !== 'validate' && (
              <div className={styles.emptyResult}>
                Click <strong>Generate IaC</strong> to produce Terraform from your canvas.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toggle result panel when closed */}
      {!resultOpen && (
        <button
          className={styles.openResultBtn}
          onClick={() => setResultOpen(true)}
          aria-label="Open results panel"
          title="Open results"
        >
          <ChevronLeft size={16} />
          <span>Results</span>
        </button>
      )}
    </div>
  )
}
