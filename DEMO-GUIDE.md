# ADLC Agent Kit — Demo Startup Guide
**Author:** Tarun Vangari | **Project:** Team Panchayat

---

## Prerequisites

- Node.js 18+ installed
- `claude` CLI authenticated (`claude --version` should work)
- `ANTHROPIC_API_KEY` set in your environment (required to run agents)
- (Optional) Ollama running at `http://localhost:11434` for local LLM mode

---

## 1. Start the Dashboard Server

Open a terminal and run:

```cmd
cd C:\Users\admin\Downloads\ADLC-Agent-Kit\.claude\worktrees\modest-swanson
set ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
node dashboard-server.js
```

Then open **http://localhost:3000** in your browser.

> **Note:** The server auto-watches project files and pushes live updates via SSE — no refresh needed.

---

## 2. Choose Your LLM Mode

Click **`...`** (top-right) → LLM settings, or scroll to **Connections** in New Project.

| Mode | When to use | Setup |
|------|-------------|-------|
| **Claude** (default) | Full quality — uses `ANTHROPIC_API_KEY` | Set env var above |
| **Ollama (Local)** | Offline / privacy-first runs | Start Ollama, pick model, enable *Use for agents* |
| **Hybrid** | Ollama drafts, Claude polishes low-quality output | Ollama + Anthropic API key |
| **OpenAI-compatible** | Azure OpenAI, Groq, LM Studio, etc. | Endpoint URL + API key |

> Agent card labels (Opus / Sonnet / qwen2.5-coder) update live when you switch modes.

---

## 3. Create a New Project

1. Click **+ New Project** (top-right)
2. Fill in **Project Name** and **Description** (required)
3. Optionally add Business Goal, Target Users, Tech Constraints, Deadline
4. Click **🚀 Start Project**

The server scaffolds the project folder, switches to it, and **auto-launches Arjun** to begin discovery.

---

## 4. Approve the Sprint Plan

Once Arjun completes discovery, the **Approve Sprint Plan** banner appears at the top.
Click it to unlock all build agents (Vikram, Rasool, Kavya, Kiran, Rohan).

---

## 5. Launch Agents

Click **🚀 Launch Agents** in the topbar, or click **Run** on individual agent cards.

Each agent:
- Reads its prompt from `prompts/{agentname}-prompt.txt`
- Gets runtime context injected (project root, file paths, sprint)
- Writes deliverables to its owned folders
- Updates `agent-status.json` live on the Kanban board

---

## 6. View Agent Logs

Click **📋 Logs** on any agent card to open a live SSE log stream.
- Filter by keyword using the search bar
- Toggle **Wrap** for long lines
- **Tail** auto-scrolls to the bottom as new output arrives

---

## 7. View Approved Deliverables

Once agents complete, access all deliverables via **`...`** (top-right menu):

| Menu item | What it shows |
|-----------|---------------|
| **🎨 UX Design** | Kavya — design tokens, component spec, screen wireframes |
| **🏗️ Architecture** | Vikram — system diagram, Docker files, approval status |
| **🗄️ DB Schema** | Rasool — all tables, columns, indexes, ERD, migration commands |

Or click shortcut buttons directly on Kavya / Vikram / Rasool's agent cards.

---

## 8. Switch Between Projects

Use the **Project** dropdown in the topbar — all 5 projects are listed (names truncated).
Board, chat, and statuses switch instantly via SSE with no page reload.

---

## 9. Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| **Start Project does nothing** | Fixed — was an EPIPE crash. Ensure `ANTHROPIC_API_KEY` is set |
| Agent shows *Exited with code 1* | API key missing or invalid — set `ANTHROPIC_API_KEY` and click **Re-run** |
| Agent shows *Exited with code 3221225786* | Windows process killed — click **Re-run** |
| *Local LLM failed: fetch failed* | Ollama not running — start Ollama or switch to Claude mode |
| Agent labels show Sonnet when Ollama enabled | Open `...` → LLM settings → toggle off and on |
| Board not updating | Check SSE dot (top-right) — refresh if disconnected |

---

## 10. Demo Flow (Suggested ~8 min)

1. **Start** → `node dashboard-server.js` → open `http://localhost:3000`
2. **Show** existing projects in dropdown (Smart Resume Screener, CBRE, InfraViz…)
3. **Switch** to Smart Resume Screener — point out Sprint 02, board state
4. **Open Group Chat** — show agent broadcast messages and handoffs
5. **Open `...` → 🏗️ Architecture** — show Vikram's visual system diagram + Docker files
6. **Open `...` → 🗄️ DB Schema** — show Rasool's 2-table SQLite schema
7. **LLM demo** → `...` → switch to Ollama → watch labels change → switch back
8. **Run an agent** → click **Run** on Kiran → watch Queue → In Progress → Logs
9. **Create new project** → show the wizard, fill in details, click 🚀 Start Project
10. **Switch project** — demonstrate multi-project live switching

---

*Sprint-01 | Team Panchayat | Tarun Vangari (tarun.vangari@gmail.com)*
