// Agent: Rohan | Sprint: 01 | Date: 2026-03-16

// ─── Auth ─────────────────────────────────────────────
export interface User {
  username: string
  token: string
}

// ─── Projects ─────────────────────────────────────────
export interface Project {
  id: string
  name: string
  description: string
  cloud_provider: 'aws' | 'gcp' | 'azure'
  owner_email: string
  created_at: string
  updated_at: string
}

// ─── IaC ──────────────────────────────────────────────
export interface IaCGenerateRequest {
  description: string
  provider: 'terraform'
  resource_types: string[]
  region: string
  tags: Record<string, string>
  project_id?: string
}

export interface IaCGenerateResponse {
  code: string
  language: string
  provider: string
  model: string
  tokens_used: number
  session_id: string
}

export interface IaCTemplate {
  id: string
  project_id: string
  content: string
  template_type: 'terraform' | 'cloudformation'
  version: number
  created_at: string
  language: string
}

// ─── State Files ───────────────────────────────────────
export interface StateFile {
  id: string
  project_id: string
  version: number
  backend_type: 's3' | 'local'
  s3_key: string
  checksum: string
  applied_at: string
  created_at: string
}

export interface StateDiff {
  resource_changes: ResourceChange[]
  additions: number
  deletions: number
  modifications: number
}

export interface ResourceChange {
  address: string
  action: 'create' | 'update' | 'delete' | 'no-op'
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}

// ─── LLM ──────────────────────────────────────────────
export interface LLMConversation {
  id: string
  session_id: string
  agent_name: string
  model_used: string
  prompt_text: string
  response_text: string
  tokens_used: number
  latency_ms: number
  created_at: string
}

export interface LLMRefinementRequest {
  session_id: string
  message: string
  current_code: string
}

export interface LLMRefinementResponse {
  refined_code: string
  explanation: string
  session_id: string
}

// ─── Resources / Topology ─────────────────────────────
export interface InfraResource {
  id: string
  project_id: string
  resource_type: string
  resource_name: string
  cloud_provider: string
  region: string
  account_id: string
  config: Record<string, unknown>
  status: 'running' | 'stopped' | 'error' | 'unknown'
  last_synced_at: string
}

export interface ResourceConnection {
  id: string
  source_id: string
  target_id: string
  connection_type: string
}

// ─── Cost / Anomalies ─────────────────────────────────
export interface CostRecord {
  id: string
  resource_id: string
  date: string
  amount_usd: number
  service: string
  usage_type: string
}

export interface CostDataPoint {
  timestamp: string
  expected: number
  actual: number
}

export type AnomalySeverity = 'critical' | 'high' | 'medium' | 'low'
export type AnomalyStatus = 'open' | 'acknowledged' | 'resolved'

export interface AnomalyRecord {
  id: string
  resource_id: string
  resource_name: string
  service: string
  detected_at: string
  anomaly_type: string
  severity: AnomalySeverity
  description: string
  status: AnomalyStatus
  expected_cost?: number
  actual_cost?: number
  delta_percent?: number
  resolved_at?: string
}

// ─── Agents ───────────────────────────────────────────
export type AgentStatus = 'wip' | 'done' | 'blocked' | 'queue'

export interface AgentStatusEntry {
  status: AgentStatus
  progress: number
  task: string
  blocker: string
  updated: string
}

export interface AgentStatusMap {
  sprint: string
  lastSync: string
  agents: Record<string, AgentStatusEntry>
}

// ─── Chat ─────────────────────────────────────────────
export type ChatMessageType =
  | 'system'
  | 'broadcast'
  | 'analysis'
  | 'message'
  | 'requirement'
  | 'blocker'
  | 'status'
  | 'handoff'

export interface ChatMessage {
  id: string
  from: string
  role: string
  type: ChatMessageType
  message: string
  timestamp: string
  tags?: string[]
  summary?: string
  questions?: string[]
  estimate?: string
}

// ─── Memory ───────────────────────────────────────────
export interface AgentMemory {
  agent: string
  sprint: string
  lastActive: string
  sessionCount: number
  currentTask: {
    title: string
    status: 'not_started' | 'in_progress' | 'blocked' | 'done'
    progressPercent: number
    startedAt: string
    lastStepCompleted: string
  }
  completedTasks: string[]
  filesCreated: string[]
  filesModified: string[]
  keyDecisions: string[]
  pendingNextSteps: string[]
  dependenciesStatus: {
    waitingFor: string
    readyToUnblock: string
  }
  blockers: string[]
  notes: string
}

// ─── API response wrappers ────────────────────────────
export interface ApiError {
  detail: string
  status: number
}
