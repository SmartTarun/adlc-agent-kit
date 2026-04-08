// Agent: vscode-extension | Sprint: 01 | Date: 2026-04-08
// Vikram — Terraform Enterprise/Cloud integration + local module generation via GitHub Copilot
import * as vscode from 'vscode';
import * as fs     from 'fs';
import * as path   from 'path';
import * as https  from 'https';
import * as http   from 'http';
import { ProjectManager } from './projectManager';

export interface TFEConfig {
  hostname:     string;   // app.terraform.io or your TFE hostname
  token:        string;   // TFE/TFC user/team token
  organization: string;   // TFE org name
  workspace?:   string;   // optional workspace name
}

export interface TFModule {
  id:          string;
  name:        string;
  provider:    string;
  namespace:   string;
  version:     string;
  description: string;
  source:      string;   // e.g. app.terraform.io/myorg/vpc/aws
}

// ── Terraform Manager ─────────────────────────────────────────────────────────

export class TerraformManager {
  private tfeConfig: TFEConfig | null = null;
  private cachedModules: TFModule[] = [];

  constructor(
    private readonly kitPath:    string,
    private readonly projectMgr: ProjectManager,
  ) {
    this.loadTFEConfig();
  }

  // ── Called from chat /infra or agentRunner vikram ────────────────────────

  async runVikramFlow(stream: vscode.ChatResponseStream, token: vscode.CancellationToken) {
    const req = this.projectMgr.getRequirement();
    stream.markdown(`## 🏗️ Vikram — Cloud Architecture & Terraform\n\n`);
    stream.markdown(`**Project:** ${req.title || 'Untitled'}\n\n`);

    if (this.tfeConfig) {
      await this.runWithTFE(stream, token, req);
    } else {
      await this.runStandalone(stream, token, req);
    }
  }

  // ── TFE/TFC connected mode ────────────────────────────────────────────────

  private async runWithTFE(stream: vscode.ChatResponseStream, token: vscode.CancellationToken, req: any) {
    stream.markdown(`✅ **Connected to Terraform ${this.tfeConfig!.hostname === 'app.terraform.io' ? 'Cloud' : 'Enterprise'}**\n`);
    stream.markdown(`- Org: \`${this.tfeConfig!.organization}\`\n`);
    stream.markdown(`- Host: \`${this.tfeConfig!.hostname}\`\n\n`);

    stream.markdown(`🔍 Fetching available modules from private registry…\n\n`);

    try {
      const modules = await this.fetchTFEModules();
      this.cachedModules = modules;

      if (modules.length === 0) {
        stream.markdown(`⚠️ No modules found in the private registry. Generating from scratch.\n\n`);
        await this.generateModulesWithCopilot(stream, token, req, []);
        return;
      }

      stream.markdown(`### 📦 Available Modules in \`${this.tfeConfig!.organization}\`\n\n`);
      stream.markdown(`| Module | Provider | Version | Description |\n|--------|----------|---------|-------------|\n`);
      modules.forEach(m => {
        stream.markdown(`| \`${m.name}\` | ${m.provider} | ${m.version} | ${m.description || '—'} |\n`);
      });

      stream.markdown(`\n🤖 **Analysing project requirements and matching modules via GitHub Copilot…**\n\n`);
      await this.matchAndGenerateWithTFE(stream, token, req, modules);

    } catch (err: any) {
      stream.markdown(`❌ TFE API error: ${err.message}\n\n`);
      stream.markdown(`Falling back to standalone module generation.\n\n`);
      await this.runStandalone(stream, token, req);
    }
  }

  // ── Match project requirements to TFE modules + generate wrapper ──────────

  private async matchAndGenerateWithTFE(
    stream:  vscode.ChatResponseStream,
    token:   vscode.CancellationToken,
    req:     any,
    modules: TFModule[],
  ) {
    const modelId = vscode.workspace.getConfiguration('adlc').get<string>('copilotModel') || 'gpt-4o';
    const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: modelId });
    if (!model) { stream.markdown('⚠️ Copilot not available.'); return; }

    const moduleList = modules.map(m =>
      `- ${m.name} (${m.provider} v${m.version}): ${m.description} — source: ${m.source}`
    ).join('\n');

    const prompt = [
      `You are Vikram, Cloud Architect for Team Panchayat.`,
      ``,
      `Project: "${req.title}" — ${req.description}`,
      `Tech constraints: ${(req.techConstraints || []).join(', ') || 'none'}`,
      ``,
      `Available Terraform modules from our private registry:`,
      moduleList,
      ``,
      `Instructions:`,
      `1. Select which modules from the registry to reuse (prefer reuse over recreating)`,
      `2. For anything not covered by the registry, generate new module code`,
      `3. Write a complete infra/modules/ directory structure using the format:`,
      `   // FILE: infra/modules/<name>/main.tf`,
      `   <terraform code>`,
      `4. Write infra/main.tf that calls all modules with correct source references`,
      `5. Apply AWS tags: Environment=dev, Owner=TeamPanchayat, CostCenter=ADLC-Sprint01, Project=${req.title}`,
      `6. No hardcoded credentials — use SSM Parameter Store or Secrets Manager`,
      ``,
      `ADLC Quality Gates:`,
      `- Terraform >= 1.7, AWS provider >= 5.0`,
      `- S3 + DynamoDB backend for state`,
      `- All modules must have: main.tf, variables.tf, outputs.tf`,
    ].join('\n');

    stream.markdown(`---\n\n**Vikram is generating Terraform using matched modules:**\n\n`);

    await this.streamCopilotAndWrite(prompt, stream, token, model);
  }

  // ── Standalone mode — no TFE connection ───────────────────────────────────

  private async runStandalone(stream: vscode.ChatResponseStream, token: vscode.CancellationToken, req: any) {
    stream.markdown(`ℹ️ **No Terraform Enterprise/Cloud connection configured.**\n\n`);
    stream.markdown(`Generating VS Code-specific Terraform modules via GitHub Copilot.\n\n`);
    stream.markdown(`> 💡 To connect Terraform Enterprise/Cloud, run: \`ADLC: Connect Terraform Enterprise\`\n\n`);
    stream.markdown(`---\n\n`);
    await this.generateModulesWithCopilot(stream, token, req, []);
  }

  private async generateModulesWithCopilot(
    stream:  vscode.ChatResponseStream,
    token:   vscode.CancellationToken,
    req:     any,
    existingModules: TFModule[],
  ) {
    const modelId = vscode.workspace.getConfiguration('adlc').get<string>('copilotModel') || 'gpt-4o';
    const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: modelId });
    if (!model) { stream.markdown('⚠️ GitHub Copilot not available. Make sure Copilot is signed in.'); return; }

    const prompt = [
      `You are Vikram, Cloud Architect for Team Panchayat.`,
      ``,
      `Project: "${req.title}" — ${req.description}`,
      `Business goal: ${req.businessGoal || ''}`,
      `Target users: ${req.targetUsers || ''}`,
      `Tech constraints: ${(req.techConstraints || []).join(', ') || 'AWS, PostgreSQL, React'}`,
      ``,
      `Generate a complete, production-ready Terraform infrastructure for this project.`,
      ``,
      `Write each file using this exact format:`,
      `// FILE: infra/modules/<module-name>/main.tf`,
      `<terraform code>`,
      ``,
      `Required modules to create (based on the project requirements):`,
      `- VPC + subnets + security groups (networking)`,
      `- RDS PostgreSQL (if DB needed)`,
      `- S3 bucket (for uploads/static assets)`,
      `- ECS Fargate or Lambda (for backend API)`,
      `- CloudFront + S3 (for React frontend)`,
      `- CloudWatch + alarms (monitoring)`,
      `- IAM roles + policies (least privilege)`,
      `- infra/main.tf (root module calling all above)`,
      `- infra/variables.tf (environment, region, project_name)`,
      `- infra/outputs.tf (api_url, frontend_url, db_endpoint)`,
      `- infra/backend.tf (S3 state + DynamoDB lock)`,
      ``,
      `ADLC Standards:`,
      `- Terraform >= 1.7, AWS provider >= 5.0`,
      `- All resources tagged: Environment=dev, Owner=TeamPanchayat, CostCenter=ADLC-Sprint01, Project=${req.title}`,
      `- No hardcoded credentials — SSM Parameter Store for secrets`,
      `- Use generic names — no company names in resource names`,
    ].join('\n');

    stream.markdown(`**Vikram is generating Terraform modules via GitHub Copilot (${modelId})…**\n\n`);
    await this.streamCopilotAndWrite(prompt, stream, token, model);
  }

  // ── Stream Copilot response + parse FILE: blocks → write to disk ──────────

  private async streamCopilotAndWrite(
    prompt:  string,
    stream:  vscode.ChatResponseStream,
    token:   vscode.CancellationToken,
    model:   vscode.LanguageModelChat,
  ) {
    const pr = this.projectMgr.getProjectRoot();
    const messages = [vscode.LanguageModelChatMessage.User(prompt)];

    let fullResponse = '';
    try {
      const response = await model.sendRequest(messages, {}, token);
      for await (const chunk of response.text) {
        fullResponse += chunk;
        stream.markdown(chunk);
      }
    } catch (err: any) {
      stream.markdown(`\n\n❌ Copilot error: ${err.message}\n`);
      return;
    }

    // Parse and write files
    const written = this.writeFilesFromResponse(fullResponse, pr);

    if (written.length > 0) {
      stream.markdown(`\n\n---\n\n✅ **${written.length} Terraform file(s) written:**\n\n`);
      written.forEach(f => stream.markdown(`- \`${f}\`\n`));

      // Update agent status
      this.setAgentStatus('done', 100, `${written.length} Terraform modules generated`);

      // Post to group chat
      this.postToGroupChat(pr,
        `✅ Terraform infrastructure ready. ${written.length} files written to infra/. ` +
        `Run \`terraform init && terraform plan\` to preview. Kiran and Rohan can now deploy.`,
        ['arjun', 'kiran']
      );

      // Show terraform plan option
      stream.markdown(`\n💡 **Next steps:**\n\n`);
      stream.markdown(`- Run \`@adlc /infra-plan\` to preview the Terraform plan\n`);
      stream.markdown(`- Run \`@adlc /infra-validate\` to validate the Terraform syntax\n`);
    }
  }

  // ── TFE API calls ─────────────────────────────────────────────────────────

  async fetchTFEModules(): Promise<TFModule[]> {
    if (!this.tfeConfig) { return []; }
    const { hostname, token, organization } = this.tfeConfig;

    const data = await this.tfeRequest(
      hostname, token,
      `/api/registry/v1/modules/${organization}?limit=100`,
    );

    const items = data?.modules || data?.data || [];
    return items.map((m: any) => ({
      id:          m.id || m.attributes?.full_name || '',
      name:        m.name || m.attributes?.name || '',
      provider:    m.provider || m.attributes?.provider || '',
      namespace:   m.namespace || organization,
      version:     m['current-version']?.version || m.attributes?.['version-statuses']?.[0]?.version || 'latest',
      description: m.description || m.attributes?.description || '',
      source:      `${hostname}/${organization}/${m.name || ''}/${m.provider || ''}`,
    }));
  }

  async fetchWorkspaceVars(): Promise<Record<string, string>> {
    if (!this.tfeConfig?.workspace) { return {}; }
    const { hostname, token, organization, workspace } = this.tfeConfig;
    const data = await this.tfeRequest(
      hostname, token,
      `/api/v2/vars?filter[organization][name]=${organization}&filter[workspace][name]=${workspace}`,
    );
    const vars: Record<string, string> = {};
    (data?.data || []).forEach((v: any) => {
      vars[v.attributes?.key] = v.attributes?.value || '';
    });
    return vars;
  }

  private tfeRequest(hostname: string, token: string, apiPath: string): Promise<any> {
    const isCloud = hostname === 'app.terraform.io';
    const lib     = isCloud ? https : (hostname.startsWith('https') ? https : http);

    return new Promise((resolve, reject) => {
      const options = {
        hostname: hostname.replace(/^https?:\/\//, ''),
        path:     apiPath,
        method:   'GET',
        headers:  {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/vnd.api+json',
        },
      };
      const req = (lib as typeof https).request(options, res => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch { reject(new Error(`TFE response parse error: ${body.slice(0, 100)}`)); }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  // ── Terraform plan/validate (runs local terraform CLI) ────────────────────

  async runTerraformPlan(stream: vscode.ChatResponseStream) {
    const pr      = this.projectMgr.getProjectRoot();
    const infraDir = path.join(pr, 'infra');

    if (!fs.existsSync(infraDir)) {
      stream.markdown(`❌ No infra/ directory found. Run \`@adlc /infra\` first to generate Terraform.\n`);
      return;
    }

    stream.markdown(`### 🔍 Terraform Plan\n\n`);
    stream.markdown('```\n');

    const { spawn } = require('child_process');
    const init      = spawn('terraform', ['init', '-no-color'], { cwd: infraDir });

    await new Promise<void>(resolve => {
      init.stdout.on('data', (d: Buffer) => stream.markdown(d.toString()));
      init.stderr.on('data', (d: Buffer) => stream.markdown(d.toString()));
      init.on('close', resolve);
    });

    const plan = spawn('terraform', ['plan', '-no-color'], { cwd: infraDir });
    await new Promise<void>(resolve => {
      plan.stdout.on('data', (d: Buffer) => stream.markdown(d.toString()));
      plan.stderr.on('data', (d: Buffer) => stream.markdown(d.toString()));
      plan.on('close', resolve);
    });

    stream.markdown('\n```\n');
  }

  async runTerraformValidate(stream: vscode.ChatResponseStream) {
    const pr       = this.projectMgr.getProjectRoot();
    const infraDir  = path.join(pr, 'infra');

    if (!fs.existsSync(infraDir)) {
      stream.markdown(`❌ No infra/ directory. Run \`@adlc /infra\` first.\n`);
      return;
    }

    stream.markdown(`### ✅ Terraform Validate\n\n\`\`\`\n`);
    const { spawn } = require('child_process');
    const proc = spawn('terraform', ['validate', '-no-color'], { cwd: infraDir });
    await new Promise<void>(resolve => {
      proc.stdout.on('data', (d: Buffer) => stream.markdown(d.toString()));
      proc.stderr.on('data', (d: Buffer) => stream.markdown(d.toString()));
      proc.on('close', resolve);
    });
    stream.markdown(`\n\`\`\`\n`);
  }

  // ── TFE Login wizard ──────────────────────────────────────────────────────

  static async loginWizard(context: vscode.ExtensionContext): Promise<TFEConfig | null> {
    const hostType = await vscode.window.showQuickPick(
      [
        { label: '☁️  Terraform Cloud',     description: 'app.terraform.io',   value: 'app.terraform.io' },
        { label: '🏢 Terraform Enterprise', description: 'Self-hosted TFE',    value: 'custom' },
      ],
      { placeHolder: 'Select your Terraform platform' }
    );
    if (!hostType) { return null; }

    let hostname = hostType.value;
    if (hostname === 'custom') {
      const custom = await vscode.window.showInputBox({
        prompt:      'Enter your Terraform Enterprise hostname',
        placeHolder: 'tfe.yourcompany.com',
        validateInput: v => v.includes('.') ? null : 'Enter a valid hostname',
      });
      if (!custom) { return null; }
      hostname = custom.trim().replace(/^https?:\/\//, '');
    }

    const token = await vscode.window.showInputBox({
      prompt:      `Enter your ${hostname === 'app.terraform.io' ? 'Terraform Cloud' : 'TFE'} API token`,
      placeHolder: 'Get from: Settings → Tokens → Create an API token',
      password:    true,
      validateInput: v => v.length > 10 ? null : 'Token looks too short',
    });
    if (!token) { return null; }

    const organization = await vscode.window.showInputBox({
      prompt:      'Enter your organization name',
      placeHolder: 'e.g. team-panchayat',
      validateInput: v => v.length > 0 ? null : 'Organization name required',
    });
    if (!organization) { return null; }

    const workspace = await vscode.window.showInputBox({
      prompt:      'Workspace name (optional — press Enter to skip)',
      placeHolder: 'e.g. production',
    });

    const cfg: TFEConfig = { hostname, token, organization, workspace: workspace || undefined };

    // Save to VS Code secrets storage
    await context.secrets.store('adlc.tfe.token',        token);
    await context.secrets.store('adlc.tfe.hostname',     hostname);
    await context.secrets.store('adlc.tfe.organization', organization);
    if (workspace) {
      await context.secrets.store('adlc.tfe.workspace', workspace);
    }

    vscode.window.showInformationMessage(
      `✅ Connected to ${hostname === 'app.terraform.io' ? 'Terraform Cloud' : 'Terraform Enterprise'} — org: ${organization}`
    );
    return cfg;
  }

  static async logout(context: vscode.ExtensionContext) {
    await context.secrets.delete('adlc.tfe.token');
    await context.secrets.delete('adlc.tfe.hostname');
    await context.secrets.delete('adlc.tfe.organization');
    await context.secrets.delete('adlc.tfe.workspace');
    vscode.window.showInformationMessage('ADLC: Disconnected from Terraform Enterprise/Cloud.');
  }

  async loadTFEConfigFromSecrets(context: vscode.ExtensionContext) {
    const token        = await context.secrets.get('adlc.tfe.token');
    const hostname     = await context.secrets.get('adlc.tfe.hostname');
    const organization = await context.secrets.get('adlc.tfe.organization');
    const workspace    = await context.secrets.get('adlc.tfe.workspace');
    if (token && hostname && organization) {
      this.tfeConfig = { token, hostname, organization, workspace };
    }
  }

  isConnected(): boolean { return this.tfeConfig !== null; }

  getConnectionInfo(): string {
    if (!this.tfeConfig) { return 'Not connected'; }
    return `${this.tfeConfig.hostname} / ${this.tfeConfig.organization}`;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private loadTFEConfig() {
    // Loaded from secrets on activate (async) — see loadTFEConfigFromSecrets
  }

  private writeFilesFromResponse(response: string, pr: string): string[] {
    const re      = /\/\/ FILE: ([^\n]+)\n([\s\S]*?)(?=\/\/ FILE: |\n```|$)/g;
    const written: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = re.exec(response)) !== null) {
      const relPath = match[1].trim();
      const content = match[2].trimEnd();
      if (!relPath || !content.trim()) { continue; }
      const absPath = relPath.startsWith('/') ? relPath : path.join(pr, relPath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, content + '\n', 'utf8');
      written.push(relPath);
    }
    return written;
  }

  private setAgentStatus(status: string, progress: number, task: string) {
    const pr   = this.projectMgr.getProjectRoot();
    const file = path.join(pr, 'agent-status.json');
    const data = this.readJSON(file) || { agents: {} };
    (data.agents || data).vikram = { status, progress, task, blocker: '', updated: new Date().toISOString() };
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  }

  private postToGroupChat(pr: string, message: string, tags: string[]) {
    const file = path.join(pr, 'group-chat.json');
    const chat = this.readJSON(file) || { channel: 'team-panchayat-general', messages: [] };
    chat.messages.push({
      id: `msg-${Date.now()}`, from: 'VIKRAM', role: 'Cloud Architect',
      type: 'message', message, tags, timestamp: new Date().toISOString(),
    });
    fs.writeFileSync(file, JSON.stringify(chat, null, 2), 'utf8');
  }

  private readJSON(file: string): any {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  }
}
