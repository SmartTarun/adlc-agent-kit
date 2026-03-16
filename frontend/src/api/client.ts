// Agent: Rohan | Sprint: 01 | Date: 2026-03-16
import axios from 'axios'
import type {
  Project,
  IaCGenerateRequest,
  IaCGenerateResponse,
  IaCTemplate,
  StateFile,
  StateDiff,
  LLMRefinementRequest,
  LLMRefinementResponse,
  InfraResource,
  ResourceConnection,
  AnomalyRecord,
  CostDataPoint,
  AgentStatusMap,
  ChatMessage,
  AgentMemory,
} from '../types'

const http = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use((config) => {
  const stored = localStorage.getItem('infraviz_user')
  if (stored) {
    const user = JSON.parse(stored) as { token: string }
    config.headers.Authorization = `Bearer ${user.token}`
  }
  return config
})

// ─── Projects ─────────────────────────────────────────
export const projectsApi = {
  list: () => http.get<Project[]>('/projects').then((r) => r.data),
  create: (data: Omit<Project, 'id' | 'created_at' | 'updated_at'>) =>
    http.post<Project>('/projects', data).then((r) => r.data),
}

// ─── IaC ──────────────────────────────────────────────
export const iacApi = {
  generate: (data: IaCGenerateRequest) =>
    http.post<IaCGenerateResponse>('/iac/generate', data).then((r) => r.data),
  templates: (projectId: string) =>
    http.get<IaCTemplate[]>(`/iac/templates?project_id=${projectId}`).then((r) => r.data),
  saveTemplate: (data: Omit<IaCTemplate, 'id' | 'created_at'>) =>
    http.post<IaCTemplate>('/iac/templates', data).then((r) => r.data),
  validate: (code: string, provider: string) =>
    http.post<{ valid: boolean; errors: string[] }>('/iac/validate', { code, provider }).then((r) => r.data),
  /** Returns SSE stream URL — caller uses EventSource directly */
  generateStreamUrl: () => '/api/v1/iac/generate/stream',
}

// ─── State ────────────────────────────────────────────
export const stateApi = {
  list: (projectId: string) =>
    http.get<StateFile[]>(`/state?project_id=${projectId}`).then((r) => r.data),
  get: (id: string) => http.get<StateFile>(`/state/${id}`).then((r) => r.data),
  diff: (fromId: string, toId: string) =>
    http.get<StateDiff>(`/state/${fromId}/diff?to=${toId}`).then((r) => r.data),
}

// ─── LLM Refinement ───────────────────────────────────
export const llmApi = {
  refine: (data: LLMRefinementRequest) =>
    http.post<LLMRefinementResponse>('/llm/refine', data).then((r) => r.data),
}

// ─── Resources / Topology ─────────────────────────────
export const resourcesApi = {
  list: (projectId: string) =>
    http.get<InfraResource[]>(`/resources?project_id=${projectId}`).then((r) => r.data),
  connections: (resourceId: string) =>
    http.get<ResourceConnection[]>(`/resources/${resourceId}/connections`).then((r) => r.data),
}

// ─── Anomalies ────────────────────────────────────────
export const anomaliesApi = {
  list: () => http.get<AnomalyRecord[]>('/anomalies').then((r) => r.data),
  acknowledge: (id: string) =>
    http.patch<AnomalyRecord>(`/anomalies/${id}/acknowledge`).then((r) => r.data),
}

// ─── Cost ─────────────────────────────────────────────
export const costApi = {
  timeseries: (params: { resource_id?: string; days?: number }) =>
    http.get<CostDataPoint[]>('/cost/timeseries', { params }).then((r) => r.data),
}

// ─── Local file reads (for agent status / chat) ───────
/** Reads agent-status.json served from /public or backend proxy */
export const agentApi = {
  status: () => fetch('/agent-status.json').then((r) => r.json() as Promise<AgentStatusMap>),
  chat: () =>
    fetch('/group-chat.json').then((r) => r.json() as Promise<{ messages: ChatMessage[] }>),
  memory: (agentName: string) =>
    fetch(`/agent-memory/${agentName}-memory.json`).then((r) => r.json() as Promise<AgentMemory>),
}

export default http
