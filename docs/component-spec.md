# Agent: kavya | Sprint: 01 | Date: 2026-03-28
# CBRE Unified Asset Intelligence Platform — Component Specification

> Design system reference for Rohan (Frontend Engineer).
> All components MUST use tokens from `/frontend/src/tokens/tokens.css`.
> Stack: React 18 + TypeScript. Charts: Recharts ONLY. No hardcoded colours.

---

## Table of Contents

| # | Component | Screen |
|---|-----------|--------|
| 1 | [PageShell](#1-pageshell) | Global |
| 2 | [TopBar](#2-topbar) | Global |
| 3 | [SideNav](#3-sidenav) | Global |
| 4 | [KpiCard](#4-kpicard) | Portfolio Overview |
| 5 | [PortfolioBarChart](#5-portfoliobarchart) | Portfolio Overview |
| 6 | [PropertyPieChart](#6-propertypiechare) | Portfolio Overview |
| 7 | [RiskBadge](#7-riskbadge) | Lease Risk Engine |
| 8 | [LeaseRiskTable](#8-leaserisktable) | Lease Risk Engine |
| 9 | [CarbonEmissionsChart](#9-carbonemissionschart) | ESG & Carbon Tracker |
| 10 | [EnergyKpiPanel](#10-energykpipanel) | ESG & Carbon Tracker |
| 11 | [SpaceHeatmap](#11-spaceheatmap) | Tenant Experience Hub |
| 12 | [SatisfactionGauge](#12-satisfactiongauge) | Tenant Experience Hub |
| 13 | [MaintenanceTicketList](#13-maintenanceticketlist) | Tenant Experience Hub |
| 14 | [AiChatPanel](#14-aichatpanel) | AI Deal Assistant |
| 15 | [ChatMessage](#15-chatmessage) | AI Deal Assistant |

---

## 1. PageShell

**Purpose:** Top-level layout wrapper. Composes TopBar + SideNav + scrollable content area. All 5 screens render inside this shell.

**Props:**
```typescript
interface PageShellProps {
  children: React.ReactNode;
  activeScreen: 'portfolio' | 'lease-risk' | 'esg' | 'tenant' | 'ai-assistant';
}
```

**Layout:**
- Full-viewport height grid: `topbar (56px) / [sidenav (224px) | content]`
- Content area: `overflow-y: auto`, `padding: var(--page-padding-y) var(--page-padding-x)`
- Background: `var(--color-bg-primary)`

**Tokens used:**
- `--topbar-height`, `--sidenav-width`, `--color-bg-primary`, `--page-padding-x`, `--page-padding-y`

---

## 2. TopBar

**Purpose:** Fixed header. CBRE logo + app title, screen title, user avatar/initials. No nav items (nav lives in SideNav).

**Props:**
```typescript
interface TopBarProps {
  screenTitle: string;
  userName: string;      // For avatar initials
}
```

**Layout:**
- Height: `var(--topbar-height)` (56px), `position: sticky; top: 0`
- Flex row: `[CBRE logo | app name | flex-grow | screen title | avatar]`
- Border bottom: `1px solid var(--color-border-subtle)`
- Background: `var(--color-bg-surface)`, `z-index: var(--z-sticky)`

**Design notes:**
- CBRE logo: SVG at 24px height, coloured with `var(--color-brand-primary)`
- App name: `"CBRE Asset Intelligence"` — `var(--font-size-base)`, `var(--font-weight-semibold)`
- Screen title: right of centre, `var(--font-size-sm)`, `var(--color-text-secondary)`
- Avatar: 32px circle, `var(--color-brand-primary)` fill, `var(--color-text-inverse)` initials

**Tokens used:**
- `--topbar-height`, `--color-bg-surface`, `--color-border-subtle`, `--color-brand-primary`
- `--color-text-primary`, `--color-text-secondary`, `--color-text-inverse`
- `--font-size-base`, `--font-size-sm`, `--font-weight-semibold`, `--z-sticky`

---

## 3. SideNav

**Purpose:** Left navigation rail. Links to all 5 screens. Collapsible to icon-only mode.

**Props:**
```typescript
interface SideNavProps {
  activeScreen: 'portfolio' | 'lease-risk' | 'esg' | 'tenant' | 'ai-assistant';
  collapsed?: boolean;
  onToggle?: () => void;
}
```

**Nav items:**
| Icon | Label | Screen key |
|------|-------|-----------|
| BarChart2 | Portfolio Overview | `portfolio` |
| AlertTriangle | Lease Risk Engine | `lease-risk` |
| Leaf | ESG & Carbon | `esg` |
| Users | Tenant Experience | `tenant` |
| MessageSquare | AI Deal Assistant | `ai-assistant` |

**Layout:**
- Width: `var(--sidenav-width)` expanded / `var(--sidenav-collapsed-width)` collapsed
- Height: `calc(100vh - var(--topbar-height))`, `position: sticky; top: var(--topbar-height)`
- Background: `var(--color-bg-surface)`, border-right: `1px solid var(--color-border-subtle)`
- Each nav item: 44px height, flex row `[icon | label]`, `gap: var(--space-3)`

**Active state:**
- Background: `var(--color-bg-selected)`
- Left border: `3px solid var(--color-brand-primary)`
- Text colour: `var(--color-text-primary)`, icon: `var(--color-brand-primary)`

**Tokens used:**
- `--sidenav-width`, `--sidenav-collapsed-width`, `--topbar-height`
- `--color-bg-surface`, `--color-bg-selected`, `--color-border-subtle`, `--color-brand-primary`
- `--color-text-primary`, `--color-text-secondary`, `--space-3`, `--transition-fast`

---

## 4. KpiCard

**Purpose:** Displays a single CRE metric (NOI, occupancy rate, cap rate, asset value, property count) with trend arrow.

**Props:**
```typescript
interface KpiCardProps {
  label: string;                        // e.g. "Net Operating Income"
  value: string;                        // Pre-formatted: "$4.2M" | "91.3%" | "6.8%"
  trend: 'up' | 'down' | 'neutral';
  trendValue?: string;                  // e.g. "+2.1% vs last month"
  icon?: React.ReactNode;
  loading?: boolean;
}
```

**Layout:**
- Background: `var(--kpi-card-bg)`, border: `1px solid var(--kpi-card-border)`
- Border-radius: `var(--kpi-card-radius)`, padding: `var(--card-padding)`
- Shadow: `var(--shadow-sm)`
- Flex column: `[icon + label | value | trend]`

**Typography:**
- Label: `var(--font-size-sm)`, `var(--kpi-card-label-color)`, uppercase, `var(--letter-spacing-caps)`
- Value: `var(--kpi-card-value-size)`, `var(--kpi-card-value-font)` (monospace), `var(--font-weight-bold)`
- Trend: `var(--font-size-xs)` + arrow icon
  - Positive: `var(--kpi-card-trend-positive)` (green)
  - Negative: `var(--kpi-card-trend-negative)` (red)
  - Neutral: `var(--kpi-card-trend-neutral)` (muted)

**Loading state:** Skeleton shimmer using `var(--color-bg-interactive)` animated gradient.

**Tokens used:**
- `--kpi-card-bg`, `--kpi-card-border`, `--kpi-card-radius`, `--kpi-card-value-font`
- `--kpi-card-value-size`, `--kpi-card-label-color`
- `--kpi-card-trend-positive`, `--kpi-card-trend-negative`, `--kpi-card-trend-neutral`
- `--card-padding`, `--shadow-sm`, `--font-size-sm`, `--font-size-xs`, `--letter-spacing-caps`

---

## 5. PortfolioBarChart

**Purpose:** Recharts BarChart showing property distribution by class (A / B / C) across metrics (count, NOI, occupancy).

**Props:**
```typescript
interface PortfolioBarChartProps {
  data: Array<{ class: string; count: number; noi: number; occupancy: number }>;
  metric: 'count' | 'noi' | 'occupancy';
  height?: number;  // default 280
}
```

**Recharts config:**
- Component: `<BarChart>` inside `<ResponsiveContainer width="100%">`
- Grid: `<CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-color)"`
- X-axis: `stroke="var(--chart-axis-color)"`, `tick={{ fill: 'var(--chart-axis-color)' }}`
- Y-axis: same as X-axis
- Tooltip: `contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)' }}`
- Bar fill: `var(--chart-color-1)` (CBRE green), active fill: `var(--chart-color-2)` (lime)
- Legend: `wrapperStyle={{ color: 'var(--chart-legend-color)' }}`

**Tokens used:**
- `--chart-color-1`, `--chart-color-2`, `--chart-grid-color`, `--chart-axis-color`
- `--chart-tooltip-bg`, `--chart-tooltip-border`, `--chart-legend-color`

---

## 6. PropertyPieChart

**Purpose:** Recharts PieChart showing property type breakdown (Office A/B/C by percentage of portfolio value).

**Props:**
```typescript
interface PropertyPieChartProps {
  data: Array<{ name: string; value: number; color: string }>;
  height?: number;  // default 260
  innerRadius?: number;  // default 60 — donut chart
}
```

**Recharts config:**
- Component: `<PieChart>` inside `<ResponsiveContainer>`
- `<Pie dataKey="value" cx="50%" cy="50%">` with `<Cell fill={entry.color}>`
- Colours from `--chart-color-1` through `--chart-color-4`
- `<Legend>` at bottom, `wrapperStyle={{ color: 'var(--chart-legend-color)' }}`
- Tooltip with same style as PortfolioBarChart

**Tokens used:**
- `--chart-color-1` through `--chart-color-4`, `--chart-tooltip-bg`, `--chart-tooltip-border`
- `--chart-legend-color`

---

## 7. RiskBadge

**Purpose:** Displays a tenant's AI-scored lease risk level with colour-coded pill badge.

**Props:**
```typescript
interface RiskBadgeProps {
  level: 'High' | 'Medium' | 'Low';
  showDot?: boolean;  // default true
}
```

**Styles per level:**

| Level | Text colour | Background | Border |
|-------|-------------|------------|--------|
| High | `--color-risk-high` | `--color-risk-high-bg` | `--color-risk-high` at 30% opacity |
| Medium | `--color-risk-medium` | `--color-risk-medium-bg` | `--color-risk-medium` at 30% opacity |
| Low | `--color-risk-low` | `--color-risk-low-bg` | `--color-risk-low` at 30% opacity |

**Layout:**
- `display: inline-flex; align-items: center; gap: var(--space-1)`
- Padding: `var(--space-1) var(--space-2)`
- Border-radius: `var(--risk-badge-radius)` (4px — corporate sharp)
- Font: `var(--risk-badge-font-size)`, `var(--risk-badge-font-weight)`, `var(--risk-badge-letter-spacing)`
- Optional dot: 6px circle, same colour as text

**Tokens used:**
- `--color-risk-high`, `--color-risk-high-bg`, `--color-risk-medium`, `--color-risk-medium-bg`
- `--color-risk-low`, `--color-risk-low-bg`
- `--risk-badge-radius`, `--risk-badge-font-size`, `--risk-badge-font-weight`, `--risk-badge-letter-spacing`
- `--space-1`, `--space-2`

---

## 8. LeaseRiskTable

**Purpose:** Sortable data table showing all tenants with AI risk scores, lease expiry, DSCR, and broker action recommendations.

**Props:**
```typescript
interface LeaseRiskTableRow {
  tenantName: string;
  property: string;
  leaseExpiryDays: number;    // Days remaining
  riskLevel: 'High' | 'Medium' | 'Low';
  riskScore: number;          // 0–100
  dscr: number;               // e.g. 1.35
  recommendation: string;     // AI-generated broker action
}

interface LeaseRiskTableProps {
  data: LeaseRiskTableRow[];
  loading?: boolean;
  onSort?: (column: keyof LeaseRiskTableRow, direction: 'asc' | 'desc') => void;
}
```

**Layout:**
- Full-width table, `border-collapse: collapse`
- Header: `background: var(--risk-table-header-bg)`, text `var(--risk-table-header-color)`, uppercase, `var(--letter-spacing-caps)`
- Row hover: `background: var(--risk-table-row-hover)`, `transition: var(--transition-fast)`
- Row border-bottom: `1px solid var(--risk-table-border)`
- Numeric columns (riskScore, dscr, leaseExpiryDays): `font-family: var(--risk-table-font-mono)`

**Column details:**
| Column | Width | Notes |
|--------|-------|-------|
| Tenant | 20% | Bold, primary text |
| Property | 15% | Secondary text |
| Lease Expiry | 12% | Mono font, red if < 90 days |
| Risk | 10% | `<RiskBadge>` |
| Score | 8% | Mono, 0–100 |
| DSCR | 8% | Mono, coloured: green ≥ 1.25, amber 1.0–1.25, red < 1.0 |
| Recommendation | auto | Secondary text, truncated with tooltip |

**Tokens used:**
- `--risk-table-header-bg`, `--risk-table-header-color`, `--risk-table-row-hover`
- `--risk-table-row-selected`, `--risk-table-border`, `--risk-table-font-mono`
- `--color-text-primary`, `--color-text-secondary`, `--letter-spacing-caps`
- `--transition-fast`, `--color-error`, `--color-warning`, `--color-success`

---

## 9. CarbonEmissionsChart

**Purpose:** Recharts ComposedChart showing monthly CO2 emissions per building as line(s) with a flat 2030 net-zero target reference line and optional area fill.

**Props:**
```typescript
interface MonthlyEmission {
  month: string;            // "Jan 2025"
  emissions: number;        // Actual CO2 tonnes
  target: number;           // Net-zero target (same value each month)
}

interface CarbonEmissionsChartProps {
  data: MonthlyEmission[];
  buildingName: string;
  height?: number;          // default 300
  showArea?: boolean;       // default true — fill under actual emissions
}
```

**Recharts config:**
- Component: `<ComposedChart>` inside `<ResponsiveContainer>`
- Actual line: `<Line type="monotone" dataKey="emissions" stroke="var(--carbon-chart-actual)" strokeWidth={2} dot={{ r: var(--carbon-chart-dot-radius) }}`
- Target line: `<ReferenceLine y={targetValue} stroke="var(--chart-reference-line)" strokeDasharray="6 3" label={{ value: '2030 Target', fill: 'var(--chart-reference-line)' }}`
- Optional area: `<Area dataKey="emissions" fill="var(--carbon-chart-actual)" fillOpacity={var(--carbon-chart-area-opacity)}`
- Grid, axes, tooltip: same pattern as PortfolioBarChart

**Tokens used:**
- `--carbon-chart-actual`, `--chart-reference-line`, `--carbon-chart-area-opacity`
- `--carbon-chart-dot-radius`, `--chart-grid-color`, `--chart-axis-color`
- `--chart-tooltip-bg`, `--chart-tooltip-border`

---

## 10. EnergyKpiPanel

**Purpose:** Row of energy intensity KPI cards for the ESG screen (kWh/sqft, CO2/sqft, water intensity, energy star score).

**Props:**
```typescript
interface EnergyKpi {
  label: string;       // e.g. "Energy Intensity"
  value: string;       // e.g. "18.4 kWh/sqft"
  target: string;      // e.g. "Target: 15.0"
  onTarget: boolean;   // Drives colour
}

interface EnergyKpiPanelProps {
  kpis: EnergyKpi[];
}
```

**Layout:**
- Flex row, `gap: var(--space-4)`, wraps on smaller screens
- Each KPI: same structure as `KpiCard` but smaller (`--font-size-2xl` value, `--font-size-xs` label)
- `onTarget=true`: value colour `var(--color-success)` | `onTarget=false`: `var(--color-warning)`

**Tokens used:**
- Same as KpiCard plus `--color-success`, `--color-warning`, `--font-size-2xl`, `--font-size-xs`

---

## 11. SpaceHeatmap

**Purpose:** Grid-based floor-plan heatmap showing room-level occupancy (0–100%). Data from Kaggle occupancy CSV.

**Props:**
```typescript
interface HeatmapCell {
  roomId: string;
  label: string;      // e.g. "Room 3B"
  occupancy: number;  // 0–100 (percentage)
}

interface SpaceHeatmapProps {
  cells: HeatmapCell[];
  columns: number;             // Grid columns, default 8
  floorLabel: string;
  onCellClick?: (cell: HeatmapCell) => void;
}
```

**Layout:**
- CSS Grid: `grid-template-columns: repeat(columns, 1fr)`, `gap: var(--heatmap-cell-gap)`
- Each cell: `aspect-ratio: 1`, `border-radius: var(--heatmap-cell-radius)`, `cursor: pointer`
- Occupancy → background colour mapping (CSS custom properties):
  - 0%: `var(--heatmap-cell-empty)`
  - 1–30%: `var(--heatmap-cell-low)`
  - 31–70%: `var(--heatmap-cell-medium)`
  - 71–99%: `var(--heatmap-cell-high)`
  - 100%: `var(--heatmap-cell-full)`
- Tooltip on hover: room label + occupancy %

**Legend:** Horizontal gradient strip below grid from `--heatmap-cell-empty` to `--heatmap-cell-full`, labelled "0% — 100%".

**Tokens used:**
- `--heatmap-cell-gap`, `--heatmap-cell-radius`
- `--heatmap-cell-empty`, `--heatmap-cell-low`, `--heatmap-cell-medium`
- `--heatmap-cell-high`, `--heatmap-cell-full`

---

## 12. SatisfactionGauge

**Purpose:** Recharts RadialBarChart showing a tenant satisfaction score (0–100) as a partial arc gauge.

**Props:**
```typescript
interface SatisfactionGaugeProps {
  score: number;          // 0–100
  label?: string;         // default "Satisfaction"
  size?: number;          // diameter in px, default 160
}
```

**Recharts config:**
- `<RadialBarChart innerRadius="70%" outerRadius="100%" startAngle={210} endAngle={-30}`
- Single `<RadialBar>` with `data={[{ value: score }]}`
- Fill colour derived from score:
  - ≥ 80: `var(--gauge-excellent)` (green)
  - 60–79: `var(--gauge-good)` (brand green)
  - 40–59: `var(--gauge-fair)` (amber)
  - < 40: `var(--gauge-poor)` (red)
- Track: `<RadialBar>` at 100% with fill `var(--gauge-track)` (behind the score arc)
- Score value displayed as centred text inside arc: `var(--font-size-3xl)`, `var(--font-mono)`, `var(--font-weight-bold)`
- Label below arc: `var(--font-size-xs)`, `var(--color-text-secondary)`

**Tokens used:**
- `--gauge-track`, `--gauge-excellent`, `--gauge-good`, `--gauge-fair`, `--gauge-poor`
- `--font-size-3xl`, `--font-size-xs`, `--font-mono`, `--font-weight-bold`
- `--color-text-secondary`

---

## 13. MaintenanceTicketList

**Purpose:** List of open maintenance tickets for the selected building/floor. Shows status, priority, description, and assigned team.

**Props:**
```typescript
interface MaintenanceTicket {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'resolved';
  priority: 'high' | 'medium' | 'low';
  floor: string;
  assignedTo: string;
  createdAt: string;    // ISO date
}

interface MaintenanceTicketListProps {
  tickets: MaintenanceTicket[];
  maxVisible?: number;  // default 8, with "show more"
}
```

**Layout:**
- Vertical list, `gap: var(--space-3)` between items
- Each ticket: flex row `[status-dot | title + meta | priority badge | assignee]`
- Status dot (6px circle):
  - `open`: `var(--ticket-dot-open)` (red)
  - `in_progress`: `var(--ticket-dot-progress)` (amber)
  - `resolved`: `var(--ticket-dot-resolved)` (green)
- Title: `var(--font-size-sm)`, `var(--font-weight-medium)`
- Meta (floor, date): `var(--font-size-xs)`, `var(--color-text-muted)`
- Priority badge: reuses `<RiskBadge>` with `High/Medium/Low` mapped from `priority`

**Tokens used:**
- `--ticket-dot-open`, `--ticket-dot-progress`, `--ticket-dot-resolved`
- `--font-size-sm`, `--font-size-xs`, `--font-weight-medium`
- `--color-text-muted`, `--space-3`, `--color-border-subtle`

---

## 14. AiChatPanel

**Purpose:** Full-height chat interface for the AI Deal Assistant powered by Claude (claude-sonnet-4-6). Supports streaming SSE responses.

**Props:**
```typescript
interface AiChatPanelProps {
  onSend: (message: string) => Promise<void>;
  streaming?: boolean;        // true when Claude is responding
  disabled?: boolean;
}
```

**Layout:**
- Flex column: `[message list (flex-grow, overflow-y: auto) | input bar (fixed bottom)]`
- Background: `var(--chat-panel-bg)`
- Message list: `padding: var(--space-4)`, `gap: var(--space-4)`

**Input bar:**
- Background: `var(--chat-input-bg)`, border: `1px solid var(--chat-input-border)`
- Focus: border `var(--chat-input-focus-border)`, `box-shadow: var(--shadow-focus)`
- Send button: background `var(--color-brand-primary)`, disabled when `streaming=true`
- Placeholder: "Ask about properties, leases, deals…", colour `var(--color-text-muted)`

**Streaming indicator:** Animated blinking cursor (3 dots pulse) in `var(--chat-streaming-accent)` (lime) shown while `streaming=true`.

**Suggested prompts:** 4 pre-set chip buttons shown on empty state (e.g. "What's our highest NOI property?"). Chips: `var(--color-bg-elevated)`, border `var(--color-border-default)`, hover `var(--color-bg-interactive)`.

**Tokens used:**
- `--chat-panel-bg`, `--chat-input-bg`, `--chat-input-border`, `--chat-input-focus-border`
- `--color-brand-primary`, `--color-text-muted`, `--color-bg-elevated`
- `--color-border-default`, `--color-bg-interactive`
- `--chat-streaming-accent`, `--shadow-focus`, `--space-4`, `--transition-fast`

---

## 15. ChatMessage

**Purpose:** Individual message bubble in the AiChatPanel. Handles both user messages and Claude assistant responses (with citation links).

**Props:**
```typescript
interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;            // Plain text or markdown (assistant only)
  timestamp?: string;
  streaming?: boolean;        // Show streaming cursor on last assistant message
  citations?: string[];       // Property IDs / data source refs
}
```

**Layout:**
- User message: right-aligned, max-width 70%
  - Background: `var(--chat-user-bg)`, border-left: `3px solid var(--chat-user-border)`
  - Border-radius: `var(--radius-lg)`
- Assistant message: left-aligned, max-width 80%
  - Background: `var(--chat-assistant-bg)`, border: `1px solid var(--chat-assistant-border)`
  - Border-radius: `var(--radius-lg)`

**Typography:**
- Content: `var(--font-size-base)`, `var(--line-height-relaxed)`
- Timestamp: `var(--font-size-xs)`, `var(--color-text-muted)`
- Citations: `var(--font-size-xs)`, `var(--chat-citation-color)` (link teal), comma-separated

**Streaming cursor:** `|` character in `var(--chat-streaming-accent)`, 700ms blink animation. Only shown on last assistant message while `streaming=true`.

**Tokens used:**
- `--chat-user-bg`, `--chat-user-border`, `--chat-assistant-bg`, `--chat-assistant-border`
- `--chat-streaming-accent`, `--chat-citation-color`
- `--radius-lg`, `--font-size-base`, `--font-size-xs`
- `--line-height-relaxed`, `--color-text-muted`

---

## Screen-to-Component Map

| Screen | Components |
|--------|-----------|
| Portfolio Overview | PageShell, TopBar, SideNav, KpiCard (×5), PortfolioBarChart, PropertyPieChart |
| Predictive Lease Risk Engine | PageShell, TopBar, SideNav, RiskBadge, LeaseRiskTable |
| ESG & Carbon Tracker | PageShell, TopBar, SideNav, CarbonEmissionsChart, EnergyKpiPanel |
| Tenant Experience Hub | PageShell, TopBar, SideNav, SpaceHeatmap, SatisfactionGauge, MaintenanceTicketList |
| AI Deal Assistant | PageShell, TopBar, SideNav, AiChatPanel, ChatMessage |

---

## Token Quick-Reference for Rohan

```css
/* Import once in main.tsx or App.tsx */
import '../tokens/tokens.css';

/* Usage pattern — never hardcode colours */
style={{ color: 'var(--color-text-primary)' }}
className="..."  /* or use CSS modules with var() */
```

No hardcoded hex values anywhere. All colours, spacing, and typography must reference `var(--token-name)` from `tokens.css`.
