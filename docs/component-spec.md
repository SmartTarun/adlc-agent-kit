# Agent: Kavya | Sprint: 01 | Date: 2026-03-16 (revised 2026-03-25)
# InfraViz — Component Specification

> Design system reference for Rohan (Frontend Engineer).
> All components MUST use tokens from `/frontend/src/tokens/tokens.css`.
> No hardcoded colours. Dark mode is default.
> Stack: React 18 + TypeScript + React Flow (@xyflow/react) + Recharts + lucide-react + react-syntax-highlighter + react-markdown

---

## Design Principles

| Principle           | Guidance                                                                    |
|---------------------|-----------------------------------------------------------------------------|
| **Power-user first**| Cloud architects expect dense, efficient UIs — no excessive whitespace      |
| **Dark by default** | `--color-bg-base` (#0b0e14) as page background                              |
| **AI-centric**      | Generation status, streaming output, and loading states are first-class     |
| **No hardcoded colours** | Every colour via CSS variable from tokens.css                          |
| **Recharts for charts** | Only Recharts for any data viz. React Flow only for canvas topology.    |

---

## Layout System

### AppShell

```
┌─────────────────────────────────────────────────────┐
│  TopBar (height: --topbar-height = 56px)             │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ ViewNav  │  <Outlet> (Canvas / Dashboard / Terminal) │
│  56px    │  full height, scrollable                 │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

**Tokens**: `--topbar-height`, `--sidebar-collapsed`
**Background**: `--color-bg-base`
**ViewNav bg**: `--color-bg-surface`
**TopBar bg**: `--color-bg-surface` + `--shadow-md`

---

## Component Catalogue

---

### 1. `<TopBar>`

**Purpose**: Global header — workspace name, region indicator, view switcher, user info.

**Layout**: flex row, space-between
**Height**: `--topbar-height` (56px)
**Background**: `--color-bg-surface`
**Border-bottom**: 1px solid `--color-border-subtle`

**Slots**:
- Left: "InfraViz" logo + wordmark (`--color-primary-400`)
- Center: Workspace name display + dropdown (current workspace)
- Right: Region badge + Theme toggle + User avatar (initials)

**Props**:
```typescript
interface TopBarProps {
  workspaceName: string;
  region: string;
  onThemeToggle: () => void;
  isDarkMode: boolean;
}
```

**Tokens**:
- Logo text: `--color-primary-400`, `--font-weight-bold`, `--font-size-lg`
- Workspace name: `--color-text-primary`, `--font-size-md`
- Region badge: `--color-bg-elevated`, `--color-text-secondary`, `--radius-full`, `--font-size-sm`, `--font-family-mono`

---

### 2. `<ViewNav>`

**Purpose**: Icon-only left navigation rail between the 3 main views.

**Width**: `--sidebar-collapsed` (56px) — always collapsed, icon-only with tooltips
**Background**: `--color-bg-surface`
**Border-right**: 1px solid `--color-border-subtle`

**Nav items**:
| Icon (lucide) | View           | Route      |
|---------------|----------------|------------|
| `Layout`      | Canvas         | /canvas    |
| `Terminal`    | Dashboard      | /dashboard |
| `TerminalSquare` | Terminal    | /terminal  |

**Active item**: `--color-primary-400` left border (3px) + `--color-bg-elevated` bg
**Hover**: `--color-bg-elevated`
**Icon size**: 20px (`lg`)
**Tooltip**: appears on hover, `--color-bg-overlay` bg, `--color-text-primary`

---

### 3. `<LoginPage>`

**Purpose**: Dummy authentication entry point. Renders before AppShell when no JWT found.

**Layout**: centered card on full-screen `--color-bg-base`
**Card**: `--color-bg-surface`, `--radius-xl`, `--shadow-xl`, max-width 400px

**Anatomy**:
```
┌────────────────────────────────┐
│  InfraViz  (logo + wordmark)   │
│  "AI-Powered IaC Platform"     │
│                                │
│  Username ________________     │
│  Password ________________     │
│                                │
│  [      Sign In      ]         │
│                                │
│  demo: admin / password        │
└────────────────────────────────┘
```

**Props**:
```typescript
interface LoginPageProps {
  onLogin: (token: string) => void;
}
```

**Tokens**:
- Card bg: `--color-bg-surface`
- Input bg: `--color-bg-elevated`
- Input border: `--color-border-default` (focus: `--color-primary-400`)
- Input text: `--color-text-primary`
- Submit button: `--color-primary-400` bg, `--color-text-inverse` text, `--radius-md`
- Submit hover: `--color-primary-500`
- Hint text: `--color-text-tertiary`, `--font-size-sm`
- Error state: `--color-danger-text`, `--color-danger-light` bg

**Behaviour**: On submit, generate a dummy JWT and store in `localStorage`. Redirect to `/canvas`.

---

### 4. `<WorkspaceManager>`

**Purpose**: Create, rename, delete, and switch workspaces. Shown as a dropdown from TopBar.

**Props**:
```typescript
interface Workspace {
  id: string;
  name: string;
  region: string;
  updatedAt: string;
}
interface WorkspaceManagerProps {
  workspaces: Workspace[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string, region: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}
```

**Layout**: dropdown panel below TopBar workspace name, `--color-bg-elevated`, `--shadow-lg`, `--radius-lg`

**Tokens**:
- Panel bg: `--color-bg-elevated`
- Item hover: `--color-bg-overlay`
- Active item: `--color-primary-400` left border, `--color-bg-overlay`
- Delete action: `--color-danger-text`
- New workspace button: `--color-accent-400` border, `--color-accent-400` text

---

### 5. `<CanvasView>`

**Purpose**: Main visual IaC designer — React Flow canvas with AWS service nodes.

**Layout**: full viewport minus TopBar and ViewNav

```
┌─────────────────────────────────────────────────────────────┐
│  CanvasToolbar (top strip, 44px)                             │
├──────────────┬──────────────────────────────┬───────────────┤
│              │                              │               │
│ ServicePalette│   React Flow Canvas          │  ResultPanel  │
│  200px       │   (infinite, zoomable)       │  (collapsible │
│              │                              │   420px)      │
│              │                              │               │
└──────────────┴──────────────────────────────┴───────────────┘
```

**Canvas bg**: `--color-bg-base` (React Flow `<Background>` dot grid: `--color-border-subtle`)
**Controls**: React Flow `<Controls>` with `--color-bg-surface` bg

---

### 6. `<ServicePalette>`

**Purpose**: Left sidebar listing draggable AWS service icons grouped by category.

**Width**: 200px
**Background**: `--color-bg-surface`
**Border-right**: 1px solid `--color-border-subtle`
**Scroll**: overflowY auto

**Groups** (18 AWS services, AWS-only Sprint-01):

| Category     | Services                                    |
|--------------|---------------------------------------------|
| Compute      | EC2, Lambda, ECS, EKS                       |
| Storage      | S3, EBS                                     |
| Database     | RDS, DynamoDB, ElastiCache                  |
| Network      | VPC, ALB, CloudFront, Route53, API Gateway  |
| Security     | IAM, Secrets Manager                        |
| Messaging    | SQS, SNS                                    |

**ServiceItem props**:
```typescript
interface ServiceItemProps {
  serviceType: AWSServiceType;
  label: string;
  icon: ReactNode;
  onDragStart: (event: DragEvent, serviceType: AWSServiceType) => void;
}
```

**Tokens**:
- Group header: `--color-text-tertiary`, `--font-size-xs`, `--letter-spacing-caps`, `--font-weight-semibold`
- Item hover: `--color-bg-elevated`
- Item drag: `--color-primary-400` border, `--shadow-md`, opacity 0.8
- Icon color: `--color-accent-400`

---

### 7. `<AWSServiceNode>` (React Flow custom node)

**Purpose**: Represents a single AWS service dropped on the canvas.

**Props**:
```typescript
interface AWSServiceNodeData {
  serviceType: AWSServiceType;
  label: string;
  instanceType?: string;
  config?: Record<string, string>;
}
```

**Anatomy**:
```
┌────────────────┐
│  [AWS Icon]    │
│  ec2-web       │
│  t3.medium     │
└────────────────┘
```

**Tokens**:
- Node bg: `--color-bg-elevated`
- Node border: `--color-border-default`
- Node selected border: `--color-primary-400`, `--shadow-glow-primary`
- Node label: `--color-text-primary`, `--font-size-sm`
- Node subtext: `--color-text-tertiary`, `--font-size-xs`, `--font-family-mono`
- Border-radius: `--radius-md`

**Handles**: React Flow source/target handles, `--color-primary-400` bg

---

### 8. `<GroupNode>` (React Flow custom node)

**Purpose**: Container nodes — VPC, Availability Zone, Subnet — that house service nodes.

**Types**: `vpc` | `az` | `subnet`

**Visual**:

| Type   | Border                   | Label colour              | Background                |
|--------|--------------------------|---------------------------|---------------------------|
| VPC    | 2px dashed `--color-primary-600` | `--color-primary-300` | `rgba(26,116,255,0.05)` |
| AZ     | 1px dashed `--color-border-default` | `--color-text-secondary` | `rgba(255,255,255,0.02)` |
| Subnet | 1px solid `--color-border-subtle`  | `--color-text-tertiary`  | `rgba(255,255,255,0.01)` |

**Tokens**:
- Label: `--font-size-sm`, `--font-weight-semibold`, top-left corner of node
- Border-radius: `--radius-lg`
- Min size: 200×120px, resizable

---

### 9. `<CanvasToolbar>`

**Purpose**: Top strip above canvas for workspace actions and generation trigger.

**Height**: 44px
**Background**: `--color-bg-surface`
**Border-bottom**: 1px solid `--color-border-subtle`

**Controls** (left to right):
- Workspace selector (compact)
- Region selector (`<RegionSelector>`)
- Divider
- Undo | Redo (lucide `Undo2` / `Redo2`)
- Import .tfstate (lucide `Upload`)
- Terraform Validate (lucide `CheckCircle`)
- Show/Hide Containers (lucide `Layers`)
- Divider
- **Generate IaC** button (primary CTA)

**Props**:
```typescript
interface CanvasToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  isGenerating: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onImportState: () => void;
  onValidate: () => void;
  onToggleContainers: () => void;
  onGenerate: () => void;
  region: string;
  onRegionChange: (r: string) => void;
}
```

**Generate IaC button**:
- Idle: `--color-primary-400` bg, `--color-text-inverse`, `--radius-md`
- Generating: `--color-primary-600` bg + spinner (`--color-text-inverse`) + "Generating…" label
- Tokens: `--font-weight-semibold`, `--font-size-md`

**Tokens** for toolbar actions:
- Icon buttons: `--color-text-secondary` (hover: `--color-text-primary`), `--color-bg-elevated` hover bg
- Disabled: `--color-text-tertiary`, cursor-not-allowed

---

### 10. `<RegionSelector>`

**Purpose**: Compact dropdown to select AWS region (AWS-only, us-east-1 default).

**Props**:
```typescript
interface RegionSelectorProps {
  value: string;
  onChange: (region: string) => void;
  regions?: string[]; // default: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1']
}
```

**Tokens**:
- bg: `--color-bg-elevated`
- border: `--color-border-default`
- text: `--color-text-secondary`, `--font-family-mono`, `--font-size-sm`
- dropdown: `--color-bg-overlay`, `--shadow-lg`

---

### 11. `<ResultPanel>`

**Purpose**: Collapsible right panel showing Claude's 7-step generation output. Used in both CanvasView (9 tabs) and DashboardView (7 tabs).

**Width**: 420px (collapsible to 0)
**Background**: `--color-bg-surface`
**Border-left**: 1px solid `--color-border-subtle`

**Tab sets**:

**CanvasView (9 tabs)**:
| # | Tab Label        | Content type         |
|---|-----------------|----------------------|
| 1 | Requirements    | Markdown             |
| 2 | Architecture    | Markdown             |
| 3 | Terraform       | Multi-file code tabs |
| 4 | Diagram         | ASCII in `<pre>`     |
| 5 | Cost Estimate   | Markdown             |
| 6 | Compliance      | Markdown checklist   |
| 7 | Deployment      | Markdown             |
| 8 | Variables       | HCL code             |
| 9 | Outputs         | HCL code             |

**DashboardView (7 tabs)**:
| # | Tab Label        | Content type         |
|---|-----------------|----------------------|
| 1 | Requirements    | Markdown             |
| 2 | Architecture    | Markdown             |
| 3 | Terraform       | Multi-file code tabs |
| 4 | Diagram         | ASCII in `<pre>`     |
| 5 | Cost Estimate   | Markdown             |
| 6 | Compliance      | Markdown checklist   |
| 7 | Deployment      | Markdown             |

**Props**:
```typescript
interface ResultPanelProps {
  result: IaCResult | null;
  isGenerating: boolean;
  tabSet: 'canvas' | 'dashboard';
  onClose?: () => void;
}

interface IaCResult {
  parsedRequirements: string;
  architectureDesign: string;
  terraformFiles: { filename: string; content: string }[];
  architectureDiagram: string;
  costEstimate: string;
  complianceChecklist: string;
  deploymentGuide: string;
}
```

**Tokens**:
- Tab bar bg: `--color-bg-elevated`
- Active tab: `--color-primary-400` border-bottom 2px, `--color-text-primary`
- Inactive tab: `--color-text-tertiary`
- Tab hover: `--color-text-secondary`
- Content area: `--color-bg-surface`, padding `--space-4`
- Empty/loading state: `--color-text-tertiary`, centered

**Loading state**: Show shimmer placeholders (`--color-bg-elevated` → `--color-bg-overlay`) while generating.

---

### 12. `<TerraformFileViewer>`

**Purpose**: Multi-file HCL code viewer with syntax highlighting and copy button.

**Library**: `react-syntax-highlighter` with `atomOneDark` theme

**Props**:
```typescript
interface TerraformFileViewerProps {
  files: { filename: string; content: string }[];
}
```

**Anatomy**:
- File tabs row (filename chips): `--color-bg-elevated`, `--font-family-mono`, `--font-size-sm`
- Code block: `--color-bg-base` bg, `--font-family-mono`, `--font-size-sm`
- Copy button (top-right): lucide `Copy`, `--color-text-secondary`, shows "Copied!" for 2s

**Tokens**:
- Active file tab: `--color-primary-400` bg, `--color-text-inverse`
- Inactive file tab: `--color-bg-elevated`, `--color-text-secondary`
- File tab border-radius: `--radius-sm`

---

### 13. `<MarkdownSection>`

**Purpose**: Renders Claude markdown output (architecture docs, cost estimates, compliance, deployment).

**Library**: `react-markdown` with `remark-gfm`

**Props**:
```typescript
interface MarkdownSectionProps {
  content: string;
  title?: string;
}
```

**Styling** (applied via CSS class on the markdown wrapper):
- Headings: `--color-text-primary`, `--font-weight-semibold`
- `h2`: `--font-size-xl`, border-bottom 1px `--color-border-subtle`
- `h3`: `--font-size-lg`
- Body: `--color-text-secondary`, `--line-height-relaxed`
- Inline code: `--color-bg-elevated`, `--color-accent-300`, `--font-family-mono`, `--radius-sm`, padding `--space-1`
- Code blocks: `--color-bg-base`, `--font-family-mono`, `--font-size-sm`, `--radius-md`
- Checkboxes (compliance list): `--color-success` for checked, `--color-border-default` unchecked
- Links: `--color-primary-400`

---

### 14. `<DashboardView>`

**Purpose**: Natural-language-to-IaC view. User types a description; Claude returns structured JSON.

**Layout**: two-area stacked layout (prompt input top, result panel fills remainder)

```
┌───────────────────────────────────────────────────────────┐
│  NLPromptInput (textarea + Generate button, 160px min)    │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  ResultPanel (tabSet='dashboard', fills remaining height) │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

---

### 15. `<NLPromptInput>`

**Purpose**: Textarea for the user to describe their infrastructure in natural language.

**Props**:
```typescript
interface NLPromptInputProps {
  value: string;
  onChange: (v: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  placeholder?: string;
}
```

**Default placeholder**: `"Describe your infrastructure... e.g., 'A 3-tier web app on AWS with EC2 auto-scaling, RDS PostgreSQL, Redis, ALB, and CloudFront CDN'"`

**Anatomy**:
```
┌─────────────────────────────────────────────────────┐
│  Textarea (resizable, min 3 rows)                   │
│                                                     │
│  [Character count]        [Clear]  [Generate IaC]   │
└─────────────────────────────────────────────────────┘
```

**Tokens**:
- Textarea bg: `--color-bg-elevated`
- Textarea border: `--color-border-default` (focus: `--color-primary-400`)
- Textarea text: `--color-text-primary`, `--font-size-md`, `--line-height-relaxed`
- Char count: `--color-text-tertiary`, `--font-size-sm`
- Generate button: same as CanvasToolbar Generate IaC button

---

### 16. `<TerminalView>`

**Purpose**: CLI-style chat interface with SSE streaming from Claude.

**Layout**: full viewport minus TopBar and ViewNav

```
┌───────────────────────────────────────────────────────────┐
│  TerminalOutput (scrollable, fills height, auto-scroll)   │
│                                                           │
│  $ user types here... _                                   │
├───────────────────────────────────────────────────────────┤
│  TerminalInput (sticky bottom, 44px)                      │
└───────────────────────────────────────────────────────────┘
```

**Background**: `--color-bg-base` (near-black, terminal feel)
**Font**: `--font-family-mono` throughout

---

### 17. `<TerminalOutput>`

**Purpose**: Scrollable area displaying command history and streamed Claude responses.

**Props**:
```typescript
interface TerminalOutputProps {
  entries: TerminalEntry[];
  isStreaming: boolean;
}

type TerminalEntry =
  | { type: 'user'; text: string; timestamp: string }
  | { type: 'assistant'; text: string; timestamp: string; isStreaming?: boolean }
  | { type: 'system'; text: string }
  | { type: 'error'; text: string };
```

**Entry styles**:
| Type        | Prefix  | Colour                              |
|-------------|---------|-------------------------------------|
| `user`      | `$ `    | `--color-text-primary`              |
| `assistant` | `> `    | `--color-accent-300`                |
| `system`    | (none)  | `--color-text-tertiary`, italic     |
| `error`     | `✗ `    | `--color-danger-text`               |

**Streaming cursor**: blinking `|` appended to active assistant entry, `--color-accent-400`, animation 600ms blink

**Streaming indicator**: 3-dot pulse (`...`) in `--color-accent-400` while waiting for first token

**Markdown rendering**: `react-markdown` on completed assistant entries (streamed content renders as plain text during stream, converts after `[DONE]`)

**Tokens**:
- Timestamp: `--color-text-tertiary`, `--font-size-xs`
- User prefix: `--color-primary-400`, `--font-weight-semibold`
- Assistant prefix: `--color-accent-400`

---

### 18. `<TerminalInput>`

**Purpose**: Command input line — sticky bottom, command history navigation with arrow keys.

**Props**:
```typescript
interface TerminalInputProps {
  onSubmit: (command: string) => void;
  isDisabled: boolean;
  history: string[];
}
```

**Behaviour**:
- `↑` / `↓` keys: navigate command history
- `Enter`: submit
- `help`: print available commands
- `clear`: clear TerminalOutput
- Disabled while streaming (show "Generating…" placeholder)

**Anatomy**: `$ [cursor] input text___`

**Tokens**:
- bg: `--color-bg-base`
- border-top: 1px solid `--color-border-subtle`
- Prompt `$`: `--color-primary-400`, `--font-weight-bold`
- Input text: `--color-text-primary`, `--font-family-mono`
- Disabled: `--color-text-tertiary`

---

### 19. `<GenerationStatusBadge>`

**Purpose**: Small indicator of the current LLM generation state. Shown in ResultPanel header and CanvasToolbar.

**Variants**: `idle` | `generating` | `streaming` | `done` | `error` | `validating`

**Visual**:
| Variant      | Dot colour                  | Label text        |
|--------------|-----------------------------|-------------------|
| `idle`       | `--color-text-tertiary`     | "Ready"           |
| `generating` | `--color-primary-400` pulse | "Generating…"     |
| `streaming`  | `--color-accent-400` pulse  | "Streaming…"      |
| `done`       | `--color-success`           | "Done"            |
| `error`      | `--color-danger`            | "Error"           |
| `validating` | `--color-warning` pulse     | "Validating…"     |

**Pulse animation**: `box-shadow` pulse 1.5s infinite on `generating`/`streaming`/`validating`

---

## Spacing & Grid

- Page padding: `--space-6` (24px)
- Panel gaps: `--space-4` (16px)
- Section gap: `--space-8` (32px)
- Canvas panel: CSS `display: flex`, `flex-direction: row`, full viewport height
- Dashboard: CSS `display: flex`, `flex-direction: column`

---

## Icon System

Use `lucide-react` exclusively. Sizes:
- `sm`: 14px (badges, compact rows)
- `md`: 16px (buttons, toolbar)
- `lg`: 20px (ViewNav, headings)
- `xl`: 24px (empty states)

All icons inherit colour from parent token — do not set icon colour inline.

---

## Motion & Animation

- Panel slide-in (ResultPanel): 200ms `ease-out`, `translateX(100%) → translateX(0)`
- Tab content fade: 150ms `ease`, `opacity 0 → 1`
- Loading shimmer: `--color-bg-elevated` → `--color-bg-overlay`, 1.2s loop
- Generation pulse: `box-shadow` pulse on `--color-primary-400`, 1.5s infinite
- Streaming cursor blink: 600ms step-end

---

## Accessibility

- All interactive elements: min 44×44px touch target
- Focus ring: 2px solid `--color-primary-400`, 2px offset
- Colour never conveys meaning alone — always pair with icon/text
- ARIA labels on all icon-only buttons
- `TerminalInput` ARIA: `role="textbox"`, `aria-label="Terminal input"`
- `ResultPanel` tabs: `role="tablist"` / `role="tab"` / `role="tabpanel"`

---

## Handoff Notes for Rohan

1. Import `tokens.css` in `src/main.tsx` (or `index.css`) — one import at root
2. All colours via `var(--token-name)` — **zero** hardcoded hex values
3. React Flow (`@xyflow/react`): use `<ReactFlowProvider>` at app root; custom nodes (`AWSServiceNode`, `GroupNode`) registered via `nodeTypes` prop
4. `react-syntax-highlighter`: use `atomOneDark` theme, override background with `--color-bg-base` via `customStyle` prop
5. `react-markdown`: wrap in a `<div className="markdown-body">` and style headings/code via the CSS class using token vars
6. Recharts `<Tooltip>` needs `contentStyle={{ background: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-tooltip-border)' }}` — CSS vars don't auto-apply to Recharts inline styles
7. SSE streaming (TerminalView): use `EventSource` or `fetch` with `ReadableStream`; append token chunks to `entry.text` on each `message` event; set `isStreaming=false` on `[DONE]`
8. Workspace state: keep in React context (`WorkspaceContext`) — Canvas nodes, edges, active workspace ID, generation result
9. JWT: store in `localStorage` key `infraviz_token`; read on app load; redirect to `/login` if absent
10. Undo/redo: use `useNodesState`/`useEdgesState` from React Flow + a simple history stack (max 50 steps)
