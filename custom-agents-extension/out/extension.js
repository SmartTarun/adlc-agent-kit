"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// Team Panchayat Custom Agents Extension
// Agent: Custom Agents Extension | Sprint: 01 | Date: 2026-04-08
const vscode = __importStar(require("vscode"));
async function activate(context) {
    // Register Arjun - Project Manager
    const arjunParticipant = vscode.chat.createChatParticipant('arjun-pm', async (request, context, response, token) => {
        const userMessage = request.prompt.trim();
        const command = request.command;
        response.markdown(`**👔 Arjun - Project Manager**\n\n`);
        if (command === 'plan') {
            response.markdown(`I'll help you create a comprehensive project plan. What type of project are you working on? Please provide:\n\n- Project name and description\n- Key objectives and success criteria\n- Timeline and milestones\n- Team size and composition\n- Technical constraints or requirements\n- Budget considerations (if applicable)`);
        }
        else if (command === 'status') {
            response.markdown(`I'll assess your project status. Please share:\n\n- Current project phase\n- Completed deliverables\n- Upcoming milestones\n- Any blockers or risks\n- Team velocity and progress metrics\n- Stakeholder feedback`);
        }
        else if (command === 'risks') {
            response.markdown(`I'll help you identify and assess project risks. Consider these categories:\n\n**Technical Risks:**\n- Technology complexity\n- Integration challenges\n- Performance requirements\n- Security concerns\n\n**Team Risks:**\n- Resource availability\n- Skill gaps\n- Communication issues\n- Motivation and engagement\n\n**Business Risks:**\n- Scope changes\n- Timeline delays\n- Budget overruns\n- Stakeholder expectations\n\nWhat specific risks are you concerned about?`);
        }
        else {
            response.markdown(`Hello! I'm **Arjun**, your Project Manager and Scrum Master. I specialize in:\n\n🎯 **Project Planning & Strategy**\n- Sprint planning and backlog management\n- Risk assessment and mitigation\n- Stakeholder coordination\n\n📊 **Team Leadership**\n- Agile methodology implementation\n- Progress tracking and reporting\n- Team motivation and productivity\n\n🔍 **Quality Assurance**\n- Requirements analysis\n- Acceptance criteria definition\n- Delivery milestone management\n\nHow can I help you with your project today? You can use:\n- \`/plan\` - Create project plans\n- \`/status\` - Assess project status\n- \`/risks\` - Risk analysis\n\nOr just describe what you need assistance with!`);
        }
    });
    // Register Vikram - Cloud Architect
    const vikramParticipant = vscode.chat.createChatParticipant('vikram-architect', async (request, context, response, token) => {
        const userMessage = request.prompt.trim();
        const command = request.command;
        response.markdown(`**🏗️ Vikram - Cloud Architect**\n\n`);
        if (command === 'design') {
            response.markdown(`I'll design a cloud architecture for your project. Please provide:\n\n- Application type (web app, API, mobile backend, etc.)\n- Expected user load and traffic patterns\n- Data storage requirements\n- Security and compliance needs\n- Budget constraints\n- Preferred cloud provider (AWS, Azure, GCP)\n\nI'll create a scalable, secure, and cost-effective architecture design.`);
        }
        else if (command === 'terraform') {
            response.markdown(`I'll generate Terraform infrastructure code. Tell me about:\n\n- Cloud provider and region preferences\n- Required resources (EC2, S3, RDS, Lambda, etc.)\n- Networking requirements (VPC, subnets, security groups)\n- Environment (dev, staging, prod)\n- Tagging and naming conventions\n\nI'll provide complete Terraform modules with best practices.`);
        }
        else if (command === 'security') {
            response.markdown(`I'll perform a security assessment and provide recommendations. Share:\n\n- Current architecture or infrastructure details\n- Data sensitivity levels\n- Compliance requirements (GDPR, HIPAA, SOC2, etc.)\n- Authentication and authorization needs\n- Network security requirements\n\nI'll provide a comprehensive security analysis with actionable recommendations.`);
        }
        else {
            response.markdown(`Greetings! I'm **Vikram**, your Cloud Architect and Infrastructure specialist. I design robust, scalable cloud solutions using:\n\n☁️ **Cloud Platforms**\n- AWS, Azure, GCP architecture\n- Multi-cloud and hybrid solutions\n- Serverless and container orchestration\n\n🏗️ **Infrastructure as Code**\n- Terraform and CloudFormation\n- Infrastructure automation\n- Configuration management\n\n🔒 **Security & Compliance**\n- Security best practices\n- Compliance frameworks\n- Risk assessment and mitigation\n\nHow can I help architect your infrastructure? Use:\n- \`/design\` - Cloud architecture design\n- \`/terraform\` - Generate infrastructure code\n- \`/security\` - Security assessment\n\nOr describe your infrastructure needs!`);
        }
    });
    // Register Kavya - UX Designer
    const kavyaParticipant = vscode.chat.createChatParticipant('kavya-ux', async (request, context, response, token) => {
        const userMessage = request.prompt.trim();
        const command = request.command;
        response.markdown(`**🎨 Kavya - UX Designer**\n\n`);
        if (command === 'design') {
            response.markdown(`I'll create a UX design for your project. Please provide:\n\n- Target users and their characteristics\n- Key tasks and workflows\n- Current pain points or problems to solve\n- Platform (web, mobile, desktop)\n- Brand guidelines or visual preferences\n- Technical constraints\n\nI'll design an intuitive, accessible user experience.`);
        }
        else if (command === 'research') {
            response.markdown(`I'll help you conduct user research. Share:\n\n- Target user personas\n- Research questions or objectives\n- Current user data or analytics\n- Competitor analysis\n- Research methodology preferences\n\nI'll provide research plans, interview guides, and analysis frameworks.`);
        }
        else if (command === 'prototype') {
            response.markdown(`I'll help you create interactive prototypes. Tell me about:\n\n- Key user flows to prototype\n- Fidelity level needed (low/medium/high)\n- Tools or platforms available\n- Testing objectives\n- Timeline and resources\n\nI'll guide you through prototyping best practices and tools.`);
        }
        else {
            response.markdown(`Hello! I'm **Kavya**, your UX Designer and user experience specialist. I create delightful, accessible user experiences through:\n\n👥 **User Research**\n- User interviews and surveys\n- Persona development\n- Journey mapping\n- Usability testing\n\n🎯 **Design Strategy**\n- Information architecture\n- Interaction design\n- Wireframing and prototyping\n- Design system creation\n\n✨ **Visual Design**\n- UI design and branding\n- Accessibility and inclusive design\n- Cross-platform consistency\n- Performance optimization\n\nHow can I help design your user experience? Use:\n- \`/design\` - Create UX designs\n- \`/research\` - User research planning\n- \`/prototype\` - Prototyping guidance\n\nOr describe your design needs!`);
        }
    });
    // Register Kiran - Backend Engineer
    const kiranParticipant = vscode.chat.createChatParticipant('kiran-backend', async (request, context, response, token) => {
        const userMessage = request.prompt.trim();
        const command = request.command;
        response.markdown(`**⚙️ Kiran - Backend Engineer**\n\n`);
        if (command === 'api') {
            response.markdown(`I'll design API endpoints for your application. Please provide:\n\n- API requirements and functionality\n- Data models and relationships\n- Authentication and authorization needs\n- Expected request/response formats\n- Performance and scalability requirements\n\nI'll design RESTful or GraphQL APIs with proper documentation.`);
        }
        else if (command === 'database') {
            response.markdown(`I'll help design your database schema. Share:\n\n- Data entities and relationships\n- Query patterns and access patterns\n- Performance requirements\n- Data integrity constraints\n- Scaling needs\n\nI'll create optimized database schemas with proper indexing and relationships.`);
        }
        else if (command === 'security') {
            response.markdown(`I'll implement backend security measures. Tell me about:\n\n- Authentication requirements\n- Authorization and access control\n- Data protection needs\n- API security concerns\n- Compliance requirements\n\nI'll provide secure backend implementation patterns and best practices.`);
        }
        else {
            response.markdown(`Hi there! I'm **Kiran**, your Backend Engineer specializing in scalable, secure server-side systems. I build:\n\n🔌 **APIs & Services**\n- RESTful and GraphQL APIs\n- Microservices architecture\n- API documentation and testing\n- Performance optimization\n\n💾 **Database Systems**\n- Schema design and optimization\n- Data migration and integrity\n- Query performance tuning\n- Database security\n\n🔐 **Security & Authentication**\n- User authentication systems\n- API security and authorization\n- Data encryption and protection\n- Security best practices\n\nHow can I help with your backend development? Use:\n- \`/api\` - API design and development\n- \`/database\` - Database schema design\n- \`/security\` - Backend security implementation\n\nOr describe your backend needs!`);
        }
    });
    // Register Rasool - Database Architect
    const rasoolParticipant = vscode.chat.createChatParticipant('rasool-database', async (request, context, response, token) => {
        const userMessage = request.prompt.trim();
        const command = request.command;
        response.markdown(`**🗄️ Rasool - Database Architect**\n\n`);
        if (command === 'schema') {
            response.markdown(`I'll design a database schema for your application. Please provide:\n\n- Business entities and relationships\n- Data access patterns\n- Performance requirements\n- Data integrity constraints\n- Future scaling needs\n\nI'll create normalized, efficient database schemas with proper relationships.`);
        }
        else if (command === 'optimize') {
            response.markdown(`I'll optimize your database performance. Share:\n\n- Current schema and queries\n- Performance issues or bottlenecks\n- Query execution plans\n- Load patterns and concurrency\n- Hardware and resource constraints\n\nI'll provide optimization recommendations and implementation strategies.`);
        }
        else if (command === 'migrate') {
            response.markdown(`I'll plan your data migration strategy. Tell me about:\n\n- Source and target systems\n- Data volume and complexity\n- Downtime constraints\n- Data transformation needs\n- Rollback and recovery plans\n\nI'll create comprehensive migration plans with minimal risk.`);
        }
        else {
            response.markdown(`Hello! I'm **Rasool**, your Database Architect and data specialist. I ensure your data systems are:\n\n📊 **Optimized & Performant**\n- Query optimization and indexing\n- Database tuning and configuration\n- Performance monitoring\n- Scalability planning\n\n🔒 **Secure & Reliable**\n- Data encryption and protection\n- Backup and recovery strategies\n- High availability design\n- Disaster recovery planning\n\n🛠️ **Well-Architected**\n- Schema design and normalization\n- Data modeling best practices\n- Migration and ETL strategies\n- Data governance and quality\n\nHow can I help with your database architecture? Use:\n- \`/schema\` - Database schema design\n- \`/optimize\` - Performance optimization\n- \`/migrate\` - Data migration planning\n\nOr describe your database needs!`);
        }
    });
    // Register Rohan - Frontend Engineer
    const rohanParticipant = vscode.chat.createChatParticipant('rohan-frontend', async (request, context, response, token) => {
        const userMessage = request.prompt.trim();
        const command = request.command;
        response.markdown(`**💻 Rohan - Frontend Engineer**\n\n`);
        if (command === 'component') {
            response.markdown(`I'll create React components for your application. Please provide:\n\n- Component requirements and functionality\n- Design specifications or mockups\n- State management needs\n- Styling approach (CSS, styled-components, etc.)\n- Accessibility requirements\n\nI'll build reusable, accessible React components.`);
        }
        else if (command === 'ui') {
            response.markdown(`I'll design user interfaces for your application. Share:\n\n- UI requirements and user flows\n- Design system or brand guidelines\n- Responsive design needs\n- Component library preferences\n- Performance constraints\n\nI'll create modern, responsive user interfaces.`);
        }
        else if (command === 'responsive') {
            response.markdown(`I'll implement responsive design patterns. Tell me about:\n\n- Target devices and screen sizes\n- Content adaptation needs\n- Performance considerations\n- Design system constraints\n- Testing requirements\n\nI'll provide responsive design solutions and best practices.`);
        }
        else {
            response.markdown(`Hey! I'm **Rohan**, your Frontend Engineer who builds beautiful, performant user interfaces. I specialize in:\n\n⚛️ **React Development**\n- Component architecture and design\n- State management (Redux, Zustand)\n- Hooks and modern React patterns\n- TypeScript integration\n\n🎨 **UI/UX Implementation**\n- Responsive web design\n- CSS and styling systems\n- Animation and micro-interactions\n- Design system implementation\n\n⚡ **Performance & Optimization**\n- Code splitting and lazy loading\n- Bundle optimization\n- Core Web Vitals improvement\n- Accessibility compliance\n\nHow can I help with your frontend development? Use:\n- \`/component\` - React component development\n- \`/ui\` - User interface design\n- \`/responsive\` - Responsive design implementation\n\nOr describe your frontend needs!`);
        }
    });
    // Register Keerthi - QA Engineer
    const keerthiParticipant = vscode.chat.createChatParticipant('keerthi-qa', async (request, context, response, token) => {
        const userMessage = request.prompt.trim();
        const command = request.command;
        response.markdown(`**🧪 Keerthi - QA Engineer**\n\n`);
        if (command === 'test') {
            response.markdown(`I'll create a comprehensive test plan. Please provide:\n\n- Application functionality and features\n- User workflows and critical paths\n- Technical architecture details\n- Testing environment constraints\n- Timeline and resource availability\n\nI'll create detailed test cases and strategies.`);
        }
        else if (command === 'automate') {
            response.markdown(`I'll help you implement test automation. Share:\n\n- Testing framework preferences\n- Application architecture\n- CI/CD pipeline details\n- Test data requirements\n- Reporting and monitoring needs\n\nI'll provide automation frameworks and best practices.`);
        }
        else if (command === 'quality') {
            response.markdown(`I'll assess and improve your software quality. Tell me about:\n\n- Current quality metrics\n- Quality gates and standards\n- Defect trends and patterns\n- Process improvement opportunities\n- Team maturity and practices\n\nI'll provide quality assessment and improvement recommendations.`);
        }
        else {
            response.markdown(`Hi! I'm **Keerthi**, your QA Engineer and quality assurance specialist. I ensure software excellence through:\n\n🧪 **Testing Strategies**\n- Test planning and execution\n- Manual and automated testing\n- Performance and security testing\n- Accessibility and compatibility testing\n\n🤖 **Test Automation**\n- Framework design and implementation\n- CI/CD integration\n- Test data management\n- Reporting and analytics\n\n📊 **Quality Assurance**\n- Quality metrics and KPIs\n- Process improvement\n- Risk assessment\n- Compliance and standards\n\nHow can I help ensure your software quality? Use:\n- \`/test\` - Test planning and execution\n- \`/automate\` - Test automation implementation\n- \`/quality\` - Quality assessment and improvement\n\nOr describe your testing and quality needs!`);
        }
    });
    // Register command to show all agents
    context.subscriptions.push(vscode.commands.registerCommand('teamPanchayat.agents', () => {
        vscode.window.showInformationMessage('Team Panchayat Agents Available:\n\n' +
            '• @arjun - Project Manager & Scrum Master\n' +
            '• @vikram - Cloud Architect & Infrastructure\n' +
            '• @kavya - UX Designer & User Experience\n' +
            '• @kiran - Backend Engineer & API Developer\n' +
            '• @rasool - Database Architect & Data Specialist\n' +
            '• @rohan - Frontend Engineer & UI Developer\n' +
            '• @keerthi - QA Engineer & Quality Assurance\n\n' +
            'Use @agent-name in GitHub Copilot Chat!');
    }));
    // Register all participants
    context.subscriptions.push(arjunParticipant, vikramParticipant, kavyaParticipant, kiranParticipant, rasoolParticipant, rohanParticipant, keerthiParticipant);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map