# Agent: Kavya | Sprint: 01 | Date: 2026-03-16
# Infraviz — Component Specification

> Design system reference for Rohan (Frontend Engineer).
> All components MUST use tokens from `/frontend/src/tokens/tokens.css`.
> No hardcoded colours. Dark mode is default.

---

## Design Principles

| Principle         | Guidance                                                                 |
|-------------------|--------------------------------------------------------------------------|
| **Data-dense**    | Cloud architects scan dashboards fast — maximise information per pixel   |
| **Clarity first** | Clear hierarchy: critical alerts > KPIs > detail panels                  |
| **Dark by default** | `--color-bg-base` (#0b0e14) as page background                         |
| **Consistency**   | Use only token values; no one-off overrides                              |
| **Agent-aware**   | UI must surface agent status, memory state, and LLM activity             |

---

## Layout System

### AppShell
```
┌──────────────────────────────────────────────────────┐
│  Topbar (height: --topbar-height = 56px)             │
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│ Sidebar  │  Main Content Area                        │
│ 240px    │  (scrollable)                             │
│ (collap- │                                           │
│ sible to │                                           │
│  56px)   │                                           │
│          │                                           │
└──────────┴───────────────────────────────────────────┘
```

**Tokens**: `--sidebar-width`, `--sidebar-collapsed`, `--topbar-height`
**Background**: `--color-bg-base`
**Sidebar bg**: `--color-bg-surface`
**Topbar bg**: `--color-bg-surface` + `--shadow-md`

---

## Component Catalogue

---

### 1. `<TopBar>`

**Purpose**: Global navigation, agent status summary, user context.

**Layout**: flex row, space-between
**Height**: `--topbar-height` (56px)
**Background**: `--color-bg-surface`
**Border-bottom**: 1px solid `--color-border-subtle`

**Slots**:
- Left: Logo + "Infraviz" wordmark (`--color-primary-400`)
- Center: Global search input (placeholder: "Search resources, agents, anomalies…")
- Right: Agent pulse indicator + Notification bell + User avatar

**States**:
- Normal: no indicators
- Anomaly detected: notification bell shows `--color-danger` badge count
- Agent running: pulse dot (`--color-agent-active`) on agent indicator

---

### 2. `<Sidebar>`

**Purpose**: Primary navigation between views.

**Width**: `--sidebar-width` (240px) | collapsed: `--sidebar-collapsed` (56px)
**Background**: `--color-bg-surface`
**Border-right**: 1px solid `--color-border-subtle`

**Nav items** (with icons):
| Icon | Label             | Route          |
|------|-------------------|----------------|
| 📊   | Overview          | /              |
| 🗺️   | Infrastructure    | /infra         |
| 💰   | Cost Anomalies    | /anomalies     |
| 🤖   | Agent Activity    | /agents        |
| 🧠   | Memory Explorer   | /memory        |
| ⚙️   | Settings          | /settings      |

**Active item**: `--color-primary-400` left border (3px) + `--color-bg-elevated` bg
**Hover**: `--color-bg-elevated` bg
**Collapsed**: show icon only, tooltip on hover

---

### 3. `<MetricCard>`

**Purpose**: KPI summary tile (cost, anomaly count, resource count, agent runs).

**Variants**: `default` | `warning` | `danger` | `success`

**Anatomy**:
```
┌─────────────────────────────────┐
│  [Icon]  Label           [Trend]│
│                                 │
│  Primary Value                  │
│  Secondary/context text         │
└─────────────────────────────────┘
```

**Props**:
- `label: string`
- `value: string | number`
- `unit?: string` (e.g., "$", "%", "resources")
- `trend?: { value: number; direction: "up"|"down"|"flat" }`
- `variant?: "default" | "warning" | "danger" | "success"`
- `icon?: ReactNode`

**Tokens**:
- Background: `--color-bg-surface`
- Border: `--color-border-subtle`
- Border-radius: `--radius-lg`
- Label: `--color-text-secondary`, `--font-size-sm`
- Value: `--color-text-primary`, `--font-size-3xl`, `--font-weight-bold`
- Trend up (bad for cost): `--color-danger-text`
- Trend down (good for cost): `--color-success-text`
- Variant danger: left border 3px `--color-danger` + `--shadow-glow-danger`
- Variant warning: left border 3px `--color-warning`
- Variant success: left border 3px `--color-success`

---

### 4. `<AnomalyTable>`

**Purpose**: Tabular list of detected cost anomalies with severity, service, delta.

**Columns**: Severity | Service | Resource | Detected At | Expected | Actual | Delta% | Action

**Row severity colours**:
- Critical: `--color-anomaly-critical` left border
- High: `--color-anomaly-high` left border
- Medium: `--color-anomaly-medium` left border
- Low: `--color-anomaly-low` left border

**Props**:
- `anomalies: AnomalyRecord[]`
- `onAcknowledge: (id: string) => void`
- `onDrillDown: (id: string) => void`
- `loading?: boolean`
- `pageSize?: number` (default 20)

**Tokens**:
- Table bg: `--color-bg-surface`
- Header: `--color-bg-elevated`, `--color-text-secondary`, `--font-size-sm`, `--letter-spacing-caps`
- Row hover: `--color-bg-elevated`
- Row border: `--color-border-subtle`
- Font: `--font-family-mono` for numeric columns

---

### 5. `<InfraTopologyGraph>`

**Purpose**: Interactive graph showing cloud resource relationships (VPCs, subnets, services, costs).

**Library**: Use `@xyflow/react` (React Flow) for graph layout — Recharts is NOT applicable here; this is topology not time-series.
> ⚠️ Confirm with Arjun/Kiran if React Flow is approved or if we use D3 with Recharts for a simpler tree view.

**Node types**:
| Type        | Shape     | Colour                        |
|-------------|-----------|-------------------------------|
| Region      | Rectangle | `--color-primary-700` bg      |
| VPC         | Rectangle | `--color-primary-600` bg      |
| Subnet      | Rounded   | `--color-primary-500` bg      |
| Service     | Circle    | `--color-accent-500` bg       |
| Anomalous   | Circle    | `--color-danger` bg + glow    |

**Interaction**: click node → slide-out detail panel
**Background**: `--color-bg-base`
**Edge colour**: `--color-border-default`
**Selected edge**: `--color-primary-400`

---

### 6. `<AgentStatusPanel>`

**Purpose**: Live feed of all 7 agents' status (wip/done/blocked/queue), progress bars, last action.

**Layout**: Vertical stack of agent rows
**Background**: `--color-bg-surface`

**AgentRow anatomy**:
```
┌──────────────────────────────────────────────────────────┐
│ [Avatar]  AgentName   [STATUS BADGE]                  xx%│
│           Last action: "Created tokens.css"              │
│           ████████████░░░░░░░░  Progress bar             │
└──────────────────────────────────────────────────────────┘
```

**Status badge colours**:
- `wip`: `--color-agent-wip` (amber)
- `done`: `--color-agent-done` (green)
- `blocked`: `--color-agent-blocked` (red) + `--shadow-glow-danger`
- `queue`: `--color-agent-queue` (grey)
- `active`: `--color-agent-active` (blue) + pulse animation

**Progress bar**: fill `--color-primary-400`, track `--color-bg-overlay`

---

### 7. `<AgentChatFeed>`

**Purpose**: Real-time group chat from `/group-chat.json` — shows agent messages, broadcasts, and system events.

**Layout**: Scrollable message list (bottom-anchored, auto-scroll on new)
**Background**: `--color-bg-base`
**Max-height**: `calc(100vh - --topbar-height - --space-12)`

**Message types**:
| type         | Style                                                   |
|--------------|----------------------------------------------------------|
| `system`     | Centered pill, `--color-text-tertiary`, `--font-size-sm`|
| `broadcast`  | Full-width banner, `--color-info-light` bg              |
| `analysis`   | Card with left border `--color-accent-500`              |
| `message`    | Chat bubble, sender avatar + name                       |
| `requirement`| Highlighted card, `--color-primary-700` bg             |
| `blocker`    | Red card, `--color-danger-light` bg                    |

**Sender avatars**: 2-char initials, unique `--color-primary-*` per agent

---

### 8. `<MemoryExplorer>`

**Purpose**: Visualise agent memory JSON files — shows current task, completed tasks, decisions, blockers.

**Layout**: Two-panel: agent selector (left) + memory detail (right)
**Background**: `--color-bg-surface`

**Memory detail sections**:
- Current Task: progress ring + task title + last step
- Completed Tasks: checkmark list (`--color-success`)
- Key Decisions: bullet list (`--color-accent-300`)
- Blockers: alert cards (`--color-danger-light`)
- Pending Steps: ordered list (`--color-warning-text`)
- Files Created/Modified: monospace list (`--font-family-mono`, `--color-text-secondary`)

**Progress ring**: SVG circle, stroke `--color-primary-400`, track `--color-bg-overlay`

---

### 9. `<CostTimeseriesChart>`

**Purpose**: Time-series line/area chart of AWS cost over time, with anomaly spike markers.

**Library**: Recharts `<AreaChart>` or `<ComposedChart>`

**Props**:
- `data: { timestamp: string; expected: number; actual: number }[]`
- `anomalies: { timestamp: string; severity: string }[]`
- `timeRange: "1d" | "7d" | "30d" | "90d"`

**Visual spec**:
- Expected cost: dashed line, `--chart-color-2` (teal)
- Actual cost: solid area, `--chart-color-1` (blue), 20% fill opacity
- Anomaly markers: vertical reference lines, `--color-anomaly-critical`/`high`/`medium`
- Grid: `--chart-grid-color`
- Axis labels: `--chart-axis-color`, `--font-size-sm`, `--font-family-mono`
- Tooltip: `--chart-tooltip-bg` bg, `--chart-tooltip-border` border, `--radius-md`

---

### 10. `<LLMActivityLog>`

**Purpose**: Shows LLM prompt/response activity from Claude or Azure OpenAI — token usage, latency, model.

**Layout**: Expandable log rows
**Background**: `--color-bg-surface`

**Row anatomy**:
```
▶ [timestamp]  claude-sonnet-4-6  |  tokens: 1,240 in / 380 out  |  492ms
  ─ Prompt: "Analyse cost spike for service: ec2-prod-us-east-1..."
  ─ Response: "Detected 340% increase vs 7-day baseline..."
```

**Tokens**:
- Timestamp/model: `--font-family-mono`, `--color-text-tertiary`, `--font-size-sm`
- Prompt label: `--color-warning-text`
- Response label: `--color-success-text`
- Token counts: `--font-family-mono`, `--color-text-secondary`

---

## Spacing & Grid

- Page padding: `--space-6` (24px)
- Card gap: `--space-4` (16px)
- Section gap: `--space-8` (32px)
- KPI grid: 4 columns on ≥1280px, 2 on ≥768px, 1 on mobile
- Main layout: CSS Grid `grid-template-columns: var(--sidebar-width) 1fr`

---

## Icon System

Use `lucide-react` exclusively. Sizes:
- `sm`: 14px (table cells, badges)
- `md`: 16px (buttons, nav items)
- `lg`: 20px (section headers)
- `xl`: 24px (empty states, feature icons)

Icon colour: inherit from parent text colour token.

---

## Motion & Animation

- Page transitions: fade + slide-up, 200ms (`--transition-normal`)
- Loading skeletons: `--color-bg-elevated` → `--color-bg-overlay` shimmer, 1.2s loop
- Agent pulse: `box-shadow` pulse on `--color-agent-active`, 1.5s infinite
- Anomaly alert flash: background flash `--color-danger-light`, 600ms, 2x on mount

---

## Accessibility

- All interactive elements: min 44×44px touch target
- Focus ring: 2px solid `--color-primary-400`, 2px offset
- Colour alone never conveys meaning — always pair with icon or text
- ARIA labels on all icon-only buttons
- Contrast ratio: minimum 4.5:1 for text (`--color-text-primary` on `--color-bg-surface` passes)

---

## Handoff Notes for Rohan

1. Import `tokens.css` at the root of `main.tsx` or `index.css`
2. Use `var(--token-name)` in all styled components / CSS modules
3. Recharts `<Tooltip>` and `<Legend>` styles need inline `style` props to pick up CSS vars — see `--chart-tooltip-*` tokens
4. For the topology graph: confirm library choice with Arjun before starting `<InfraTopologyGraph>`
5. All chart `stroke`/`fill` props should reference `var(--chart-color-N)` via `getComputedStyle` or use CSS custom properties where Recharts allows
6. Agent avatar colours: assign deterministically by agent name hash so they stay stable across renders
