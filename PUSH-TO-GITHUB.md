# Pushing ADLC-Agent-Kit to GitHub
**Author: Tarun Vangari | tarun.vangari@gmail.com**

---

## Prerequisites — Install These First

Open PowerShell and check each:

```powershell
# 1. Git
git --version
# If missing: download from https://git-scm.com/download/win

# 2. GitHub CLI (optional but recommended)
gh --version
# If missing: winget install GitHub.cli

# 3. Authenticate with GitHub
gh auth login
# Choose: GitHub.com → HTTPS → Login with browser
```

---

## Step 1 — Create Repo on GitHub

### Option A — via GitHub CLI (fastest)
```powershell
gh repo create adlc-agent-kit --private --description "AI-Driven Development Lifecycle automation kit — Team Panchayat | Parallel Claude AI agents for Terraform, FastAPI, React & PostgreSQL"
```

### Option B — via Browser
1. Go to https://github.com/new
2. Repository name: `adlc-agent-kit`
3. Description: paste from `.github/repo-meta.md`
4. Visibility: **Private**
5. Do NOT initialise with README (we have our own)
6. Click **Create repository**

---

## Step 2 — Initialise Git in the Kit Folder

```powershell
# Navigate to the kit
cd $env:USERPROFILE\Downloads\ADLC-Agent-Kit

# Initialise git
git init

# Set default branch to main
git branch -M main

# Add remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/adlc-agent-kit.git
```

---

## Step 3 — First Commit & Push

```powershell
# Stage all files
git add .

# Verify what will be committed (check .gitignore is working)
git status

# Commit with author info
git commit -m "feat: initial commit — ADLC-Agent-Kit v1.0

- Sprint command centre with live dashboard
- 7 agent prompts (Arjun, Vikram, Rasool, Kavya, Kiran, Rohan, Keerthi)
- PowerShell agent launcher (start-agents.ps1)
- Workspace setup script (setup-workspace.bat)
- Dashboard auto-sync via Node.js (sync-dashboard.js)
- GitHub PR template and issue templates
- CLAUDE.md project standards

Author: Tarun Vangari <tarun.vangari@gmail.com>"

# Push to GitHub
git push -u origin main
```

---

## Step 4 — Add Topics to Repo (GitHub Browser)

Go to your repo → click ⚙️ (gear) next to About → paste topics from `.github/repo-meta.md`

---

## Step 5 — Set Branch Protection (Recommended for team use)

```powershell
# Protect main branch via GitHub CLI
gh api repos/YOUR_USERNAME/adlc-agent-kit/branches/main/protection \
  --method PUT \
  --field required_pull_request_reviews='{"required_approving_review_count":1}' \
  --field enforce_admins=false
```

Or via browser: Repo → Settings → Branches → Add rule → Branch name: `main` → Require PR review ✅

---

## Day-to-Day Git Workflow (per Sprint)

```powershell
# Create a new branch for each sprint
git checkout -b sprint-02

# After agent work is done, stage changes
git add .

# Commit
git commit -m "feat(sprint-02): [AgentName] task description"

# Push branch
git push origin sprint-02

# Open PR (GitHub CLI)
gh pr create --title "Sprint-02: [Agent] task" --body "Closes #issue"
```

---

## Useful Git Commands

```powershell
git status                    # See what changed
git log --oneline             # View commit history
git diff                      # See uncommitted changes
git pull origin main          # Get latest from remote
git stash                     # Temporarily save uncommitted work
git stash pop                 # Restore stashed work
```

---

*ADLC-Agent-Kit · Team Panchayat · Author: Tarun Vangari (tarun.vangari@gmail.com)*
