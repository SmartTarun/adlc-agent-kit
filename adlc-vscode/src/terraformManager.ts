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

  // ── AUTO: called by agentRunner when Vikram is launched ─────────────────
  // Reads requirement.json, infers the full infra needed, generates TF code.
  // No questions asked — fully automatic.

  async autoGenerate(outputChannel: vscode.OutputChannel, cancelToken: vscode.CancellationToken) {
    const req  = this.projectMgr.getRequirement();
    const pr   = this.projectMgr.getProjectRoot();

    outputChannel.appendLine(`[VIKRAM] Auto-generating Terraform from requirement.json`);
    outputChannel.appendLine(`[VIKRAM] Project: ${req.title}`);
    outputChannel.appendLine(`[VIKRAM] Tech constraints: ${(req.techConstraints || []).join(', ') || 'none specified'}`);
    outputChannel.appendLine('─'.repeat(60));

    const infra = this.inferInfraNeeds(req);
    outputChannel.appendLine(`[VIKRAM] Inferred resources needed:`);
    infra.resources.forEach((r: string) => outputChannel.appendLine(`  ✓ ${r}`));
    outputChannel.appendLine('');

    const modelId = vscode.workspace.getConfiguration('adlc').get<string>('copilotModel') || 'gpt-4o';
    const [model] = await vscode.lm.selectChatModels({ vendor: 'copilot', family: modelId });

    if (!model) {
      outputChannel.appendLine(`[ERROR] GitHub Copilot model "${modelId}" not available.`);
      this.setAgentStatus('blocked', 0, 'Copilot not available', 'Install GitHub Copilot extension');
      return;
    }

    this.setAgentStatus('wip', 20, 'Inferring infrastructure from requirements…');

    // If TFE connected — fetch registry modules and reuse them
    let registryModules: TFModule[] = [];
    if (this.tfeConfig) {
      outputChannel.appendLine(`[VIKRAM] TFE connected — fetching registry modules from ${this.tfeConfig.hostname}…`);
      try {
        registryModules = await this.fetchTFEModules();
        outputChannel.appendLine(`[VIKRAM] Found ${registryModules.length} modules in private registry`);
        registryModules.forEach(m => outputChannel.appendLine(`  📦 ${m.name} (${m.provider} v${m.version})`));
      } catch (e: any) {
        outputChannel.appendLine(`[WARN] TFE fetch failed: ${e.message} — using standalone generation`);
      }
    }

    this.setAgentStatus('wip', 40, 'Generating Terraform with GitHub Copilot…');

    const prompt = this.buildAutoPrompt(req, infra, registryModules);
    outputChannel.appendLine(`\n[VIKRAM] Calling GitHub Copilot (${modelId})…\n`);

    let fullResponse = '';
    try {
      const messages  = [vscode.LanguageModelChatMessage.User(prompt)];
      const response  = await model.sendRequest(messages, {}, cancelToken);
      for await (const chunk of response.text) {
        fullResponse += chunk;
        outputChannel.append(chunk);
      }
    } catch (err: any) {
      outputChannel.appendLine(`\n[ERROR] Copilot error: ${err.message}`);
      this.setAgentStatus('blocked', 0, `Copilot error: ${err.message}`, err.message);
      return;
    }

    outputChannel.appendLine('\n' + '─'.repeat(60));
    this.setAgentStatus('wip', 80, 'Writing Terraform files…');

    const written = this.writeFilesFromResponse(fullResponse, pr);
    outputChannel.appendLine(`\n[VIKRAM] Files written (${written.length}):`);
    written.forEach(f => outputChannel.appendLine(`  ✓ ${f}`));

    if (written.length > 0) {
      this.setAgentStatus('done', 100, `${written.length} Terraform files generated`);
      this.postToGroupChat(pr,
        `✅ Terraform infrastructure auto-generated for "${req.title}".\n` +
        `${written.length} files written to infra/.\n` +
        `Resources: ${infra.resources.join(', ')}.\n` +
        `Run \`terraform init && terraform plan\` to preview. Kiran can now deploy the backend.`,
        ['arjun', 'kiran', 'tarun']
      );
      vscode.window.showInformationMessage(`ADLC: Vikram wrote ${written.length} Terraform files for "${req.title}"`);
    } else {
      this.setAgentStatus('blocked', 50, 'No files parsed from Copilot response');
      outputChannel.appendLine(`[WARN] Could not parse file blocks from response. Check the output above.`);
    }
  }

  // ── Called from chat /infra or manually ──────────────────────────────────

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

  // ── Infer what AWS resources this project needs from requirement.json ─────

  private inferInfraNeeds(req: any): { resources: string[]; needsDB: boolean; needsBackend: boolean; needsFrontend: boolean; needsAuth: boolean; needsStorage: boolean; region: string } {
    const desc        = `${req.description || ''} ${req.businessGoal || ''} ${req.targetUsers || ''}`.toLowerCase();
    const constraints = (req.techConstraints || []).map((c: string) => c.toLowerCase());
    const domain      = (req.projectDomain  || '').toLowerCase();
    const domCtx      = req.domainContext   || {};

    const has = (...terms: string[]) =>
      terms.some(t => desc.includes(t) || constraints.some((c: string) => c.includes(t)));

    const needsDB       = has('postgres', 'postgresql', 'mysql', 'database', 'db', 'rds', 'sqlite', 'data', 'store', 'record', 'lease', 'tenant', 'property', 'portfolio');
    const needsBackend  = has('api', 'fastapi', 'backend', 'server', 'endpoint', 'rest', 'graphql', 'lambda', 'ecs', 'fargate');
    const needsFrontend = has('react', 'frontend', 'dashboard', 'ui', 'chart', 'web', 'browser', 'portal');
    const needsAuth     = has('auth', 'login', 'user', 'cognito', 'oauth', 'jwt', 'session', 'account');
    const needsStorage  = has('upload', 'file', 's3', 'document', 'pdf', 'excel', 'attachment', 'export', 'report');
    const needsQueue    = has('queue', 'sqs', 'async', 'email', 'notification', 'alert', 'trigger', 'event');
    const needsCache    = has('cache', 'redis', 'elasticache', 'session', 'performance');

    const region = (domCtx.region || constraints.find((c: string) => c.startsWith('us-') || c.startsWith('eu-') || c.startsWith('ap-')) || 'us-east-1');

    const resources: string[] = ['VPC + subnets + security groups (networking)'];
    if (needsDB)       { resources.push('RDS PostgreSQL (database)'); }
    if (needsBackend)  { resources.push('ECS Fargate (backend API container)'); }
    if (needsFrontend) { resources.push('S3 + CloudFront (React frontend CDN)'); }
    if (needsStorage)  { resources.push('S3 bucket (file uploads / exports)'); }
    if (needsAuth)     { resources.push('Cognito User Pool (authentication)'); }
    if (needsQueue)    { resources.push('SQS queue (async notifications/alerts)'); }
    if (needsCache)    { resources.push('ElastiCache Redis (caching/sessions)'); }
    resources.push('IAM roles + policies (least privilege)');
    resources.push('CloudWatch + alarms (monitoring)');
    resources.push('S3 + DynamoDB (Terraform remote state)');

    return { resources, needsDB, needsBackend, needsFrontend, needsAuth, needsStorage, region };
  }

  // ── Build the auto-generation prompt ─────────────────────────────────────

  private buildAutoPrompt(req: any, infra: ReturnType<TerraformManager['inferInfraNeeds']>, registryModules: TFModule[]): string {
    const moduleSection = registryModules.length > 0
      ? [
          `Available modules from our Terraform Enterprise private registry (REUSE THESE — do not recreate):`,
          ...registryModules.map(m => `  - ${m.name} (${m.provider} v${m.version}) — source: "${m.source}"`),
          ``,
          `For any resource NOT covered by the registry, write a new module from scratch.`,
        ].join('\n')
      : `No private registry modules available — generate all modules from scratch.`;

    return [
      `You are Vikram, Cloud Architect for Team Panchayat (ADLC-Agent-Kit).`,
      `Auto-generate complete, production-ready Terraform infrastructure based on this project requirement.`,
      ``,
      `=== PROJECT REQUIREMENT ===`,
      `Title:            ${req.title}`,
      `Description:      ${req.description}`,
      `Business Goal:    ${req.businessGoal || ''}`,
      `Target Users:     ${req.targetUsers  || ''}`,
      `Tech Constraints: ${(req.techConstraints || []).join(', ') || 'none'}`,
      `Domain:           ${req.projectDomain || 'general'}`,
      ``,
      `=== INFERRED INFRASTRUCTURE ===`,
      `AWS Region: ${infra.region}`,
      `Resources needed:`,
      ...infra.resources.map(r => `  - ${r}`),
      ``,
      `=== TERRAFORM ENTERPRISE REGISTRY ===`,
      moduleSection,
      ``,
      `=== OUTPUT FORMAT (STRICT) ===`,
      `Write every file using EXACTLY this format — one block per file, no extra text between blocks:`,
      ``,
      `// FILE: infra/backend.tf`,
      `<terraform code here>`,
      ``,
      `// FILE: infra/variables.tf`,
      `<terraform code here>`,
      ``,
      `// FILE: infra/main.tf`,
      `<terraform code here>`,
      ``,
      `// FILE: infra/modules/networking/main.tf`,
      `<terraform code here>`,
      ``,
      `(continue for all modules)`,
      ``,
      `=== REQUIRED FILES ===`,
      `infra/backend.tf         — S3 state bucket + DynamoDB lock table`,
      `infra/variables.tf       — environment, region, project_name, all module inputs`,
      `infra/outputs.tf         — api_url, frontend_url, db_endpoint, bucket_name`,
      `infra/main.tf            — root module calling all sub-modules`,
      ...(infra.needsBackend  ? ['infra/modules/ecs/main.tf + variables.tf + outputs.tf'] : []),
      ...(infra.needsDB       ? ['infra/modules/rds/main.tf + variables.tf + outputs.tf'] : []),
      ...(infra.needsFrontend ? ['infra/modules/cloudfront/main.tf + variables.tf + outputs.tf'] : []),
      ...(infra.needsAuth     ? ['infra/modules/cognito/main.tf + variables.tf + outputs.tf'] : []),
      ...(infra.needsStorage  ? ['infra/modules/s3/main.tf + variables.tf + outputs.tf'] : []),
      'infra/modules/networking/main.tf + variables.tf + outputs.tf',
      'infra/modules/monitoring/main.tf + variables.tf + outputs.tf',
      ``,
      `=== ADLC STANDARDS (MANDATORY) ===`,
      `- Terraform >= 1.7, AWS provider >= 5.0`,
      `- Every resource tagged: Environment=dev, Owner=TeamPanchayat, CostCenter=ADLC-Sprint01, Project="${req.title}"`,
      `- No hardcoded credentials — use SSM Parameter Store for secrets`,
      `- No company-specific names (CBRE, client names etc) in resource names — use project slug`,
      `- All modules must have: main.tf, variables.tf, outputs.tf`,
      `- Use generic resource naming: var.project_name + "-" + var.environment`,
    ].join('\n');
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
