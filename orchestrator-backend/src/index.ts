import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import * as os from 'os';
import { exec } from 'child_process';

// Setup file logging for GUI app debugging
const LOG_DIR = path.join(os.homedir(), '.orchy-config', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'orchestrator.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Create/truncate log file on startup
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// Override console methods to also write to file
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function formatLog(level: string, args: any[]): string {
  const timestamp = new Date().toISOString();
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  return `[${timestamp}] [${level}] ${message}\n`;
}

console.log = (...args: any[]) => {
  originalLog.apply(console, args);
  logStream.write(formatLog('INFO', args));
};

console.error = (...args: any[]) => {
  originalError.apply(console, args);
  logStream.write(formatLog('ERROR', args));
};

console.warn = (...args: any[]) => {
  originalWarn.apply(console, args);
  logStream.write(formatLog('WARN', args));
};

// Memory monitoring utility
function logMemoryUsage(label?: string) {
  const used = process.memoryUsage();
  const formatMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);
  console.log(`[Memory${label ? ` - ${label}` : ''}] RSS: ${formatMB(used.rss)}MB | Heap: ${formatMB(used.heapUsed)}/${formatMB(used.heapTotal)}MB | External: ${formatMB(used.external)}MB`);
}

// Log memory every 60 seconds (set to 0 to disable)
const MEMORY_LOG_INTERVAL = 60000;
if (MEMORY_LOG_INTERVAL > 0) {
  setInterval(() => logMemoryUsage('periodic'), MEMORY_LOG_INTERVAL);
}

// Export for use elsewhere
(global as any).logMemoryUsage = logMemoryUsage;

// Catch uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  logStream.write(formatLog('FATAL', [`Uncaught Exception: ${err.stack || err}`]));
  logStream.end();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logStream.write(formatLog('FATAL', [`Unhandled Rejection: ${reason}`]));
});

// Display startup banner (using stdout.write to bypass obfuscator's console stripping)
const VERSION = '1.0.0';
const banner = `
\x1b[36m╔════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                    ║
║    █████╗ ██╗    ██████╗ ██╗   ██╗███████╗██████╗ ██╗      ██████╗ ██████╗ ██████╗  ║
║   ██╔══██╗██║   ██╔═══██╗██║   ██║██╔════╝██╔══██╗██║     ██╔═══██╗██╔══██╗██╔══██╗ ║
║   ███████║██║   ██║   ██║██║   ██║█████╗  ██████╔╝██║     ██║   ██║██████╔╝██║  ██║ ║
║   ██╔══██║██║   ██║   ██║╚██╗ ██╔╝██╔══╝  ██╔══██╗██║     ██║   ██║██╔══██╗██║  ██║ ║
║   ██║  ██║██║   ╚██████╔╝ ╚████╔╝ ███████╗██║  ██║███████╗╚██████╔╝██║  ██║██████╔╝ ║
║   ╚═╝  ╚═╝╚═╝    ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═════╝  ║
║                                                                                    ║
║\x1b[0m\x1b[35m                        Claude Agent Orchestrator                                   \x1b[36m║
║                                                                                    ║
╚════════════════════════════════════════════════════════════════════════════════════╝\x1b[0m

  \x1b[33mVersion:\x1b[0m     ${VERSION}
  \x1b[33mAuthor:\x1b[0m      Luka Furlan
  \x1b[33mTo stop:\x1b[0m     Press Ctrl+C
  \x1b[33mLogs:\x1b[0m        ~/.orchy-config/logs/orchestrator.log

`;
process.stdout.write(banner);

// Log startup
console.log('=== Orchestrator Starting ===');
console.log(`Log file: ${LOG_FILE}`);
console.log(`CWD: ${process.cwd()}`);
console.log(`execPath: ${process.execPath}`);
console.log(`argv: ${process.argv.join(' ')}`);
console.log(`HOME: ${os.homedir()}`);
console.log(`SHELL: ${process.env.SHELL}`);

import { Config, Plan, LogEntry, TaskDefinition, StreamingMessage, ContentBlock, StuckState, RequestFlow, FlowStep, TaskCompleteRequest, TaskCompleteResponse, WorkspaceProjectConfig, ProjectConfig, WORKSPACE_ROOT_PROJECT, GitHubConfig } from '@orchy/types';
import { SessionManager } from './core/session-manager';
import { SessionStore } from './core/session-store';
import { ProcessManager } from './core/process-manager';
import { TemplateManager, CreateFromTemplateOptions } from './core/template-manager';
import { WorkspaceManager } from './core/workspace-manager';
import { DeploymentManager } from './deployment/deployment-manager';
import { StatusMonitor } from './core/status-monitor';
import { LogAggregator } from './core/log-aggregator';
import { StateMachine } from './core/state-machine';
import { ActionExecutor } from './core/action-executor';
import { PlanningAgentManager } from './planning/planning-agent-manager';
import { ChatHandler } from './planning/chat-handler';
import { DesignerAgentManager } from './design/designer-agent-manager';
import { createUIServer } from './ui/server';
import { SessionLogger } from './core/session-logger';
import { TaskExecutor } from './core/task-executor';
import { GitManager } from './core/git-manager';
import { GitHubManager } from './core/github-manager';
import { generateBranchName } from './utils/ask-agent';
import { TEMPLATE_PERMISSIONS } from '@orchy/types';
import { getPaths, getProjectsConfigPath, getWorkspacesConfigPath, initializeConfigIfNeeded, ensureSetupExtracted, initializePlannerPermissionsIfNeeded } from './config/paths';
import { checkDependencies, formatDependencyResults, DependencyCheckResult } from './startup/dependency-check';

// Get orchestrator directory using centralized path resolver
const paths = getPaths();
const ORCHESTRATOR_DIR = paths.orchestratorDir;

// Default port (can be overridden via env var or CLI)
const DEFAULT_ORCHESTRATOR_PORT = 3456;
const MAX_PORT_ATTEMPTS = 100;

/**
 * CLI options
 */
interface CLIOptions {
  port?: number;
  noBrowser: boolean;
  help: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    noBrowser: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--no-browser') {
      options.noBrowser = true;
    } else if (arg === '--port' || arg === '-p') {
      const portStr = args[++i];
      if (portStr) {
        options.port = parseInt(portStr, 10);
      }
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Orchy - Multi-agent orchestrator for Claude Code

Usage: orchy [options]

Options:
  --port, -p PORT    Specify port to run on (default: 3456)
  --no-browser       Don't open browser automatically
  --help, -h         Show this help message

Environment variables:
  ORCHESTRATOR_PORT  Default port (default: 3456)

Examples:
  orchy                    Start server, open browser
  orchy --port 8080        Use specific port
  orchy --no-browser       Don't open browser
`);
}

/**
 * Check if a port is available
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    // Use 0.0.0.0 to check all interfaces (same as Express default)
    server.listen(port, '0.0.0.0');
  });
}

/**
 * Find an available port, starting from the preferred port and incrementing
 */
async function findAvailablePort(preferredPort: number): Promise<number> {
  for (let port = preferredPort; port < preferredPort + MAX_PORT_ATTEMPTS; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`Could not find available port after ${MAX_PORT_ATTEMPTS} attempts starting from ${preferredPort}`);
}

/**
 * Open URL in default browser
 */
function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;

  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "" "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  exec(command, (err) => {
    if (err) {
      console.log(`Could not open browser automatically. Please open ${url} manually.`);
    }
  });
}

/**
 * Emit ready signal for Tauri sidecar communication
 * Format: [ORCHESTRATOR_READY]:{port}
 */
function emitReadySignal(port: number): void {
  // Machine-readable format for Tauri to parse
  console.log(`[ORCHESTRATOR_READY]:${port}`);
}

/**
 * Emit error signal for Tauri sidecar communication
 * Format: [ORCHESTRATOR_ERROR]:{message}
 */
function emitErrorSignal(message: string): void {
  console.error(`[ORCHESTRATOR_ERROR]:${message}`);
}

async function main() {
  // Parse CLI arguments
  const cliOptions = parseArgs();

  // Handle --help
  if (cliOptions.help) {
    printHelp();
    process.exit(0);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Multi-Agent Orchestrator');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Directory: ${ORCHESTRATOR_DIR}`);
  console.log(`  Sessions:  ${paths.sessionsDir}`);
  console.log(`  Mode:      ${paths.env}`);
  console.log('');

  // Determine port - CLI > env var > default
  const requestedPort = cliOptions.port
    ?? (process.env.ORCHESTRATOR_PORT ? parseInt(process.env.ORCHESTRATOR_PORT, 10) : null)
    ?? DEFAULT_ORCHESTRATOR_PORT;

  let orchestratorPort: number;
  try {
    orchestratorPort = await findAvailablePort(requestedPort);
  } catch (err) {
    const errorMessage = `Cannot find available port after ${MAX_PORT_ATTEMPTS} attempts starting from ${requestedPort}.`;
    emitErrorSignal(errorMessage);
    console.error(`\n  ERROR: ${errorMessage}`);
    console.error('  Please close other instances or specify a different port with --port.\n');
    process.exit(1);
  }

  if (orchestratorPort !== requestedPort) {
    console.log(`  Note: Port ${requestedPort} in use, using ${orchestratorPort}`);
    console.log('');
  }

  // Initialize config file if needed (copies bundled or creates default)
  initializeConfigIfNeeded();

  // Initialize planner permissions if needed (creates default planner-permissions.json)
  initializePlannerPermissionsIfNeeded();

  // Extract setup files from binary to filesystem (production only)
  ensureSetupExtracted();

  // Initialize core components
  // SessionStore uses the sessions directory from path resolver
  const sessionStore = new SessionStore(paths.sessionsDir);

  // Empty config - projects are now stored in workspaces
  const config: Config = {
    projects: {},
    defaults: {
      approvalTimeout: 30000,
      maxRestarts: 3,
      debugEscalationTime: 60000
    }
  };

  const sessionManager = new SessionManager(config, sessionStore);
  const processManager = new ProcessManager(config);
  const templateManager = new TemplateManager();
  const workspaceManager = new WorkspaceManager(getWorkspacesConfigPath());
  const deploymentManager = new DeploymentManager(workspaceManager);
  const statusMonitor = new StatusMonitor();
  const logAggregator = new LogAggregator();
  const gitManager = new GitManager();
  const githubManager = new GitHubManager();

  console.log(`  Workspaces: ${Object.keys(workspaceManager.getWorkspaces()).length}`);
  console.log('');

  // Wire up SessionStore to StatusMonitor and LogAggregator for persistence
  statusMonitor.setSessionStore(sessionStore);
  logAggregator.setSessionStore(sessionStore);

  // Initialize state machine and new event-driven components
  const stateMachine = new StateMachine();
  const planningAgent = new PlanningAgentManager(ORCHESTRATOR_DIR);
  planningAgent.setProjectConfig(config.projects);  // Provide project context to Planning Agent
  const chatHandler = new ChatHandler(planningAgent);
  const actionExecutor = new ActionExecutor(processManager, statusMonitor, stateMachine);

  // Initialize Designer Agent Manager (for design-first workflow)
  const designerAgent = new DesignerAgentManager();
  console.log('[Orchestrator] Designer Agent Manager initialized');

  // TaskExecutor instance - will be fully initialized after session is created (needs getSessionDir)
  let taskExecutor: TaskExecutor | null = null;

  // Track all tasks by project for persistent session task_complete handling
  let allTasksByProject: Map<string, Array<{ task: TaskDefinition; taskIndex: number }>> = new Map();

  // Session logger (initialized when session is created)
  let sessionLogger: SessionLogger | null = null;

  // Create UI server with dependencies
  const ui = createUIServer(orchestratorPort, {
    sessionManager,
    statusMonitor,
    logAggregator,
    config
  });

  // Set orchestrator port for MCP permission server communication
  processManager.setOrchestratorPort(orchestratorPort);

  // Set deployment manager on UI server for deployment API endpoints
  ui.setDeploymentManager(deploymentManager);

  // ═══════════════════════════════════════════════════════════════
  // Set up kill planning agent handler (called when plan is approved)
  // This prevents the planning agent from making any more MCP calls
  // (e.g., duplicate plan submissions after approval)
  // ═══════════════════════════════════════════════════════════════

  ui.setKillPlanningAgentHandler(() => {
    console.log(`[Orchestrator] Killing planning agent after plan approval`);
    planningAgent.stop();
  });

  // ═══════════════════════════════════════════════════════════════
  // Set up GitHub secret handler for MCP tool request_user_input
  // ═══════════════════════════════════════════════════════════════

  ui.setGitHubSecretHandler(async (repo: string, name: string, value: string) => {
    return githubManager.setSecret(repo, name, value);
  });

  // ═══════════════════════════════════════════════════════════════
  // Set up next prompt handler for planning stages
  // This generates the appropriate prompt when a stage is approved
  // ═══════════════════════════════════════════════════════════════

  ui.setGetNextPromptHandler((stage, data) => {
    // Stage 2: Exploration & Planning (combined stage after feature refinement)
    if (stage === 'stage2' && data.refinedDescription && data.requirements) {
      return planningAgent.generateExplorationPlanningPrompt(
        data.refinedDescription,
        data.requirements
      );
    }
    return undefined;
  });

  // ═══════════════════════════════════════════════════════════════
  // GitHub Integration REST API Endpoints
  // ═══════════════════════════════════════════════════════════════

  // GET /api/github/settings - Get GitHub global settings
  ui.app.get('/api/github/settings', async (req, res) => {
    try {
      const settings = githubManager.getSettings();
      const ghInstalled = await githubManager.isGhInstalled();

      // If GitHub is enabled and gh is installed, ensure git is configured to use gh credentials
      if (settings.enabled && ghInstalled) {
        await githubManager.setupGitAuth();
      }

      res.json({ ...settings, ghInstalled });
    } catch (err) {
      console.error('[Orchestrator] Failed to get GitHub settings:', err);
      res.status(500).json({ error: 'Failed to get settings' });
    }
  });

  // POST /api/github/settings - Update GitHub global settings
  ui.app.post('/api/github/settings', async (req, res) => {
    try {
      const updates = req.body;
      const settings = githubManager.updateSettings(updates);

      // When GitHub is enabled, configure git to use gh credentials
      if (settings.enabled) {
        await githubManager.setupGitAuth();
      }

      res.json(settings);
    } catch (err) {
      console.error('[Orchestrator] Failed to update GitHub settings:', err);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  // GET /api/github/auth - Check GitHub authentication status
  ui.app.get('/api/github/auth', async (req, res) => {
    try {
      const authStatus = await githubManager.checkAuthStatus();
      res.json(authStatus);
    } catch (err) {
      console.error('[Orchestrator] Failed to check GitHub auth:', err);
      res.status(500).json({ error: 'Failed to check auth status' });
    }
  });

  // GET /api/github/verify - Verify auth and repo access
  ui.app.get('/api/github/verify', async (req, res) => {
    try {
      const repo = req.query.repo as string;
      if (!repo) {
        res.status(400).json({ error: 'Missing repo parameter' });
        return;
      }

      // Check auth first
      const authStatus = await githubManager.checkAuthStatus();
      if (!authStatus.authenticated) {
        res.json({
          authenticated: false,
          hasAccess: false,
          error: 'Not authenticated. Run `gh auth login` to authenticate.',
        });
        return;
      }

      // Then check repo access
      const repoAccess = await githubManager.verifyRepoAccess(repo);
      res.json({
        authenticated: true,
        username: authStatus.username,
        ...repoAccess,
      });
    } catch (err) {
      console.error('[Orchestrator] Failed to verify GitHub access:', err);
      res.status(500).json({ error: 'Failed to verify access' });
    }
  });

  // GET /api/github/user - Get authenticated user info (username and orgs)
  ui.app.get('/api/github/user', async (req, res) => {
    try {
      const userInfo = await githubManager.getAuthenticatedUser();
      res.json(userInfo);
    } catch (err) {
      console.error('[Orchestrator] Failed to get GitHub user:', err);
      res.status(500).json({ error: 'Failed to get user info' });
    }
  });

  // Finalize UI server - registers SPA catch-all route (must be AFTER all API routes)
  ui.finalize();

  // ═══════════════════════════════════════════════════════════════
  // Wire up Designer Agent events to Socket.io
  // ═══════════════════════════════════════════════════════════════

  // Attach designer agent to io for socket handlers
  (ui.io as any).designerAgent = designerAgent;

  // Attach template manager to io for REST API handlers
  (ui.io as any).templateManager = templateManager;

  // Forward agent messages to frontend
  designerAgent.on('agentMessage', (content: string) => {
    console.log(`[DesignerAgent] Agent message: ${content.substring(0, 80)}...`);
    ui.io.emit('design:agent_message', { content });
  });

  // Forward unlock/lock input events
  designerAgent.on('unlockInput', (data: { placeholder?: string }) => {
    console.log(`[DesignerAgent] Unlock input`);
    ui.io.emit('design:unlock_input', data);
  });

  designerAgent.on('lockInput', () => {
    console.log(`[DesignerAgent] Lock input`);
    ui.io.emit('design:lock_input', {});
  });

  // Forward phase updates
  designerAgent.on('phaseUpdate', (data: { phase: string; step: number }) => {
    console.log(`[DesignerAgent] Phase update: ${data.phase} (step ${data.step})`);
    ui.io.emit('design:phase_update', data);
  });

  // Forward preview events
  designerAgent.on('showPreview', (data: { type: string; options: unknown[] }) => {
    console.log(`[DesignerAgent] Show preview: ${data.type} with ${data.options.length} options`);
    ui.io.emit('design:show_preview', data);
  });

  // Forward category selector event
  designerAgent.on('showCategorySelector', (data: { categories: unknown[] }) => {
    console.log(`[DesignerAgent] Show category selector`);
    ui.io.emit('design:show_category_selector', data);
  });

  // Forward design complete event
  designerAgent.on('designComplete', (data: { designPath: string; designName: string }) => {
    console.log(`[DesignerAgent] Design complete: ${data.designName}`);
    ui.io.emit('design:complete', data);
  });

  // Forward session events
  designerAgent.on('sessionStarted', (session: { id: string }) => {
    console.log(`[DesignerAgent] Session started: ${session.id}`);
    ui.io.emit('design:session_started', { sessionId: session.id });
  });

  designerAgent.on('sessionEnded', ({ sessionId }: { sessionId?: string }) => {
    console.log(`[DesignerAgent] Session ended: ${sessionId || 'unknown'}`);
    // Clean up phase tracking for this session
    if (sessionId) {
      const phases = (ui.io as any).designSessionPhases as Map<string, string> | undefined;
      if (phases) {
        phases.delete(sessionId);
        console.log(`[DesignerAgent] Cleaned up phase state for session ${sessionId}`);
      }
    }
    ui.io.emit('design:session_ended', { sessionId });
  });

  designerAgent.on('error', (err: Error) => {
    console.error(`[DesignerAgent] Error:`, err);
    ui.io.emit('design:error', { message: err.message });
  });

  // Forward discovery summary event
  designerAgent.on('showSummary', (data: { summary: string }) => {
    console.log(`[DesignerAgent] Show summary`);
    ui.io.emit('design:show_summary', data);
  });

  // Forward generating state event
  designerAgent.on('generating', (data: { type: string; message?: string }) => {
    console.log(`[DesignerAgent] Generating: ${data.type}`);
    ui.io.emit('design:generating', data);
  });

  // Forward generation complete event
  designerAgent.on('generationComplete', () => {
    console.log(`[DesignerAgent] Generation complete`);
    ui.io.emit('design:generation_complete', {});
  });

  // Forward page added event
  designerAgent.on('pageAdded', (data: { page: { id: string; name: string; filename: string } }) => {
    console.log(`[DesignerAgent] Page added: ${data.page.name}`);
    ui.io.emit('design:page_added', data);
  });

  // Forward page saved event (auto-save on mockup selection)
  // Also shows the pages panel automatically
  designerAgent.on('pageSaved', (data: { page: { id: string; name: string; filename: string } }) => {
    console.log(`[DesignerAgent] Page auto-saved: ${data.page.name}`);
    ui.io.emit('design:page_added', data);
    // Also show pages panel with all pages
    const pages = designerAgent.getPages();
    ui.io.emit('design:show_pages_panel', { pages });
  });

  // ═══════════════════════════════════════════════════════════════
  // Wire up Process Manager events
  // ═══════════════════════════════════════════════════════════════

  processManager.on('log', (entry: LogEntry) => {
    logAggregator.addLog(entry);
    (ui.io as any).emitLog(entry);
  });

  // Forward test status events to UI for real-time E2E test tracking
  processManager.on('testStatus', (event: { project: string; scenario: string; status: string; error?: string; timestamp: number }) => {
    (ui.io as any).emit('testStatus', event);

    // Persist test status to SessionStore
    const currentSessionId = sessionStore.getCurrentSessionId();
    if (currentSessionId) {
      sessionStore.updateTestState(
        currentSessionId,
        event.project,
        event.scenario,
        event.status as any,
        event.error
      );
    }
  });

  // Forward worker status events for real-time project status updates
  processManager.on('workerStatus', (event: { project: string; message: string; timestamp: number }) => {
    // Update the project status message (keeps status as WORKING, just updates message)
    const currentStatus = statusMonitor.getStatus(event.project);
    if (currentStatus?.status === 'WORKING') {
      statusMonitor.updateStatus(event.project, 'WORKING', event.message);
    }
  });

  processManager.on('ready', ({ project, type }) => {
    console.log(`[Orchestrator] ${project} ${type} is ready`);
    // Don't set status to IDLE here - that's reserved for when the full task is complete
    // Dev server ready just means the server is up, not that work is done
  });

  processManager.on('exit', ({ project, type, code, uptime }) => {
    console.log(`[Orchestrator] ${project} ${type} exited (code: ${code}, uptime: ${uptime}ms)`);
  });

  processManager.on('crash', ({ project, type, crashCount, isQuickCrash }) => {
    console.log(`[Orchestrator] ${project} ${type} crashed (count: ${crashCount}, quick: ${isQuickCrash})`);
  });

  processManager.on('fatalCrash', async ({ project, type, crashCount, recentLogs }) => {
    console.log(`[Orchestrator] ${project} ${type} FATAL crash (count: ${crashCount})`);
    statusMonitor.updateStatus(project, 'FATAL_DEBUGGING', `Process crashed ${crashCount} times`);

    // Direct call - PA's internal queue handles serialization
    await chatHandler.requestFailureAnalysis(project, `${type} crashed ${crashCount} times`, recentLogs);
  });

  processManager.on('agentComplete', ({ project }) => {
    console.log(`[Orchestrator] ${project} agent completed`);
  });

  // Handle persistent agent crashes
  processManager.on('persistentAgentCrash', ({ project, error }: { project: string; code: number; signal: string | null; error: string }) => {
    console.error(`[Orchestrator] Persistent agent crashed for ${project}: ${error}`);
    statusMonitor.updateStatus(project, 'FAILED', `Agent crashed: ${error}`);
    chatHandler.systemMessage(`Agent for ${project} crashed unexpectedly. Please retry.`);
  });



  // ═══════════════════════════════════════════════════════════════
  // Wire up ActionExecutor events
  // ═══════════════════════════════════════════════════════════════

  actionExecutor.on('chat', ({ from, message }) => {
    (ui.io as any).emitChat(from, message);
  });

  actionExecutor.on('complete', ({ summary }) => {
    console.log(`[Orchestrator] Execution complete: ${summary}`);
    (ui.io as any).emitAllComplete();
  });

  actionExecutor.on('error', ({ action, error }) => {
    console.error(`[Orchestrator] Action error:`, action, error);
    chatHandler.systemMessage(`Error executing action: ${error}`);
  });

  // Track E2E retry counts per project (to prevent infinite loops)
  const e2eRetryCount: Map<string, number> = new Map();
  const MAX_E2E_RETRIES = 3;

  // Track which project each fix is for (fixingProject -> failedProject)
  const e2eFixingFor: Map<string, string> = new Map();

  // Track projects that need E2E re-run after fix task completes
  const pendingE2ERetry: Map<string, {
    testScenarios: string[];
    retryCount: number;
    failedProject: string;  // The project whose E2E failed (may differ from the project being fixed)
  }> = new Map();

  // Track active flow IDs for updating flow steps
  const activeE2EFlows: Map<string, string> = new Map(); // project -> flowId

  // Handle E2E completion - analyze directly (PA's internal queue handles serialization)
  actionExecutor.on('e2eComplete', async ({ project, result }) => {
    console.log(`[Orchestrator] E2E completed for ${project}, analyzing...`);

    const session = sessionManager.getCurrentSession();
    const testScenarios = session?.plan?.testPlan?.[project] || [];
    const allProjects = session?.projects || [];

    // Get flow ID for this project
    const flowId = activeE2EFlows.get(project);

    // Emit analyzing step
    if (flowId) {
      const step: FlowStep = {
        id: 'analyze',
        status: 'active',
        message: 'Analyzing E2E results',
        timestamp: Date.now()
      };
      (ui.io as any).emitFlowStep(flowId, step);
    }

    // Get recent dev server logs from ALL projects to provide cross-project context
    const allDevServerLogs = allProjects.map(proj => {
      const logs = logAggregator.getLogsByType(proj, 'devServer', 50)
        .map(e => `[${e.stream}] ${e.text}`)
        .join('\n');
      return logs ? `=== ${proj} dev server logs ===\n${logs}` : '';
    }).filter(Boolean).join('\n\n');

    try {
      // Direct call - PA's internal queue handles serialization
      const analysis = await chatHandler.analyzeE2EResult(project, result, testScenarios, allDevServerLogs, allProjects);

      if (analysis.passed) {
        // E2E passed! Mark as complete
        console.log(`[Orchestrator] E2E tests PASSED for ${project}`);

        // Complete the flow
        if (flowId) {
          (ui.io as any).emitFlowComplete(flowId, 'completed', {
            passed: true,
            summary: 'E2E: All tests passed'
          });
          activeE2EFlows.delete(project);
        }

        statusMonitor.updateStatus(project, 'IDLE', 'E2E tests passed');
        e2eRetryCount.delete(project); // Reset retry count on success

        // Only reset E2E_FIXING projects that were fixing issues for THIS project
        for (const proj of allProjects) {
          const status = statusMonitor.getStatus(proj);
          if (status?.status === 'E2E_FIXING' && e2eFixingFor.get(proj) === project) {
            statusMonitor.updateStatus(proj, 'IDLE', 'E2E tests passed');
            e2eFixingFor.delete(proj);
          }
        }
        // Mark agent idle now that E2E analysis is complete
        stateMachine.markAgentIdle(project);
        return;
      }

      // Check for infrastructure failures (e.g., no access to testing tools)
      // These should go straight to FATAL_DEBUGGING - not fixable by code changes
      if (analysis.isInfrastructureFailure) {
        console.error(`[Orchestrator] E2E infrastructure failure for ${project}: ${analysis.analysis}`);

        // Complete the flow as failed
        if (flowId) {
          (ui.io as any).emitFlowComplete(flowId, 'failed', {
            passed: false,
            summary: 'E2E: Infrastructure failure',
            details: analysis.analysis
          });
          activeE2EFlows.delete(project);
        }

        chatHandler.systemMessage(`E2E tests could not run for ${project}: ${analysis.analysis}. This requires manual intervention (e.g., Playwright MCP tools unavailable).`);
        statusMonitor.updateStatus(project, 'FATAL_DEBUGGING', 'E2E infrastructure issue - tools unavailable');
        // Mark agent idle now that E2E analysis is complete
        stateMachine.markAgentIdle(project);
        return;
      }

      // E2E failed - check retry count
      const retries = e2eRetryCount.get(project) || 0;

      if (retries >= MAX_E2E_RETRIES) {
        console.error(`[Orchestrator] E2E tests failed for ${project} after ${retries} retries, giving up`);

        // Complete the flow as failed
        if (flowId) {
          (ui.io as any).emitFlowComplete(flowId, 'failed', {
            passed: false,
            summary: `E2E: Failed after ${MAX_E2E_RETRIES} fix attempts`,
            details: analysis.analysis
          });
          activeE2EFlows.delete(project);
        }

        chatHandler.systemMessage(`E2E tests failed for ${project} after ${MAX_E2E_RETRIES} fix attempts. Manual intervention required.`);
        statusMonitor.updateStatus(project, 'FAILED', `E2E failed after ${MAX_E2E_RETRIES} fix attempts`);
        // Mark agent idle now that E2E analysis is complete
        stateMachine.markAgentIdle(project);
        return;
      }

      // Try to fix
      console.log(`[Orchestrator] E2E tests FAILED for ${project}, attempting fix (retry ${retries + 1}/${MAX_E2E_RETRIES})`);
      e2eRetryCount.set(project, retries + 1);

      // Normalize fixes: convert fixPrompt (fallback format) to fixes array
      let fixes = analysis.fixes || [];
      if (fixes.length === 0 && analysis.fixPrompt) {
        // Fallback: PA returned old format, convert to single-project fix
        fixes = [{ project, prompt: analysis.fixPrompt }];
      }

      if (fixes.length > 0) {
        const currentSession = sessionManager.getCurrentSession();
        const validProjects = new Set(currentSession?.projects || allProjects);

        console.log(`[Orchestrator] E2E analysis returned ${fixes.length} fix(es)`);

        // Complete the E2E flow as failed (fix in progress)
        if (flowId) {
          (ui.io as any).emitFlowComplete(flowId, 'failed', {
            passed: false,
            summary: `E2E: Failed - fix attempt ${retries + 1}/${MAX_E2E_RETRIES}`,
            details: analysis.analysis
          });
          activeE2EFlows.delete(project);
        }

        // First pass: collect all valid projects that need fixes
        const projectsWithFixes = new Set<string>();
        for (const fix of fixes) {
          if (validProjects.has(fix.project)) {
            projectsWithFixes.add(fix.project);
          }
        }

        // If cross-project fixes are needed, set BLOCKED status BEFORE starting fixes
        // This ensures pendingE2E is set up before fix tasks complete
        const fixedOtherProjects = Array.from(projectsWithFixes).some(p => p !== project);
        if (fixedOtherProjects) {
          const waitingOn = Array.from(projectsWithFixes).filter(p => p !== project);
          console.log(`[Orchestrator] Fixes needed in ${waitingOn.join(', ')}, setting ${project} to BLOCKED`);
          statusMonitor.updateStatus(project, 'BLOCKED', `Waiting for ${waitingOn.join(', ')} to complete fixes`);
          pendingE2E.set(project, { message: `Re-running E2E after fixes`, waitingOn });
        }

        // Second pass: execute fix tasks
        for (const fix of fixes) {
          const targetProject = fix.project;

          if (!validProjects.has(targetProject)) {
            console.error(`[Orchestrator] E2E fix target project "${targetProject}" not found in session`);
            chatHandler.systemMessage(`Error: Cannot apply fix - project "${targetProject}" not found.`);
            continue;
          }

          const fixPrompt = `The E2E tests for ${project} failed. Analysis: ${analysis.analysis}

You need to fix the following in ${targetProject}:
${fix.prompt}

After fixing, the E2E tests will be re-run automatically.`;

          // Create fix task and route through TaskExecutor
          const fixTask: TaskDefinition = {
            project: targetProject,
            name: `E2E Fix: ${project}`,
            task: fixPrompt,
            type: 'e2e_fix',
          };

          // Add to session plan (visible in UI)
          const fixTaskIndex = sessionManager.addTask(fixTask);

          // Initialize task state in UI
          statusMonitor.initializeTask(fixTaskIndex, fixTask);

          // Add to allTasksByProject so task_complete handler can find it
          const existingTasks = allTasksByProject.get(targetProject) || [];
          existingTasks.push({ task: fixTask, taskIndex: fixTaskIndex });
          allTasksByProject.set(targetProject, existingTasks);

          // Emit updated session so UI shows the new fix task
          const updatedSession = sessionManager.getCurrentSession();
          if (updatedSession) {
            (ui.io as any).emitSession(updatedSession);
          }
          // Also emit updated task states
          (ui.io as any).emitTaskStates(statusMonitor.getAllTaskStates());

          // Track pending E2E re-run after fix completes
          pendingE2ERetry.set(targetProject, {
            testScenarios,
            retryCount: retries + 1,
            failedProject: project,
          });

          e2eFixingFor.set(targetProject, project);

          console.log(`[Orchestrator] >>> ROUTING E2E FIX TO TaskExecutor: "${targetProject}" (task #${fixTaskIndex})`);
          statusMonitor.updateStatus(targetProject, 'E2E_FIXING', `Fixing issues from ${project} E2E`);

          // Execute through TaskExecutor using persistent session
          // Agent will call task_complete MCP tool, triggering verification and E2E retry hooks
          if (!taskExecutor) {
            console.error(`[Orchestrator] TaskExecutor not initialized for E2E fix`);
            statusMonitor.updateStatus(targetProject, 'FAILED', 'TaskExecutor not initialized');
            pendingE2ERetry.delete(targetProject);
            e2eFixingFor.delete(targetProject);
            continue;
          }

          try {
            const result = await taskExecutor.executePersistentSession(
              targetProject,
              [{ task: fixTask, taskIndex: fixTaskIndex }]
            );

            if (!result.success) {
              console.error(`[Orchestrator] E2E fix task failed for ${targetProject}`);
              statusMonitor.updateStatus(targetProject, 'FAILED', `E2E fix failed`);
              pendingE2ERetry.delete(targetProject);
              e2eFixingFor.delete(targetProject);
            } else {
              // Fix task succeeded - update project status to READY
              // This triggers projectReady handler which will check pendingE2E and re-run E2E tests
              console.log(`[Orchestrator] E2E fix task completed for ${targetProject}, setting to READY`);
              statusMonitor.updateStatus(targetProject, 'READY', 'E2E fix completed successfully');
            }
          } catch (err) {
            console.error(`[Orchestrator] E2E fix task FAILED for ${targetProject}:`, err);
            statusMonitor.updateStatus(targetProject, 'FAILED', `Fix task failed: ${err}`);
            pendingE2ERetry.delete(targetProject);
            e2eFixingFor.delete(targetProject);
          }
        }

        // Mark agent idle now that E2E analysis is complete (fixes are being handled by TaskExecutor)
        stateMachine.markAgentIdle(project);
      } else {
        // No fix prompt available, mark as blocked
        if (flowId) {
          (ui.io as any).emitFlowComplete(flowId, 'failed', {
            passed: false,
            summary: 'E2E: Failed, no fix available'
          });
          activeE2EFlows.delete(project);
        }
        statusMonitor.updateStatus(project, 'FAILED', 'E2E failed, no fix available');
        // Mark agent idle now that E2E analysis is complete
        stateMachine.markAgentIdle(project);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Orchestrator] Error analyzing E2E result for ${project}:`, err);

      // Complete flow as failed on error
      if (flowId) {
        (ui.io as any).emitFlowComplete(flowId, 'failed', {
          passed: false,
          summary: 'Analysis error',
          details: errorMsg
        });
        activeE2EFlows.delete(project);
      }

      chatHandler.systemMessage(`Error analyzing E2E result for ${project}: ${errorMsg}`);
      // Mark agent idle even on error - analysis is complete
      stateMachine.markAgentIdle(project);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Wire up State Machine events
  // ═══════════════════════════════════════════════════════════════

  stateMachine.on('stateChange', ({ previous, current }) => {
    console.log(`[Orchestrator] State: ${previous} → ${current}`);
    (ui.io as any).emit('stateChange', { state: current });
    // Keep Planning Agent informed of orchestrator state
    planningAgent.setOrchestratorState(current);
  });

  stateMachine.on('paused', () => {
    chatHandler.systemMessage('Orchestrator paused. You can send direct prompts to agents or chat with me.');
  });

  stateMachine.on('resumed', () => {
    chatHandler.systemMessage('Orchestrator resumed. Processing queue...');
  });

  // ═══════════════════════════════════════════════════════════════
  // Wire up Status Monitor events
  // ═══════════════════════════════════════════════════════════════

  statusMonitor.on('statusChange', ({ project, status, message }) => {
    (ui.io as any).emitStatus(project, status, message);
    // Keep Planning Agent informed of project statuses for user action requests
    const allStatuses: Record<string, { status: any; message: string }> = {};
    for (const proj of Object.keys(config.projects)) {
      const projStatus = statusMonitor.getStatus(proj);
      if (projStatus) {
        allStatuses[proj] = { status: projStatus.status, message: projStatus.message };
      }
    }
    planningAgent.setProjectStatuses(allStatuses);

    // When entering FATAL_DEBUGGING or FAILED, complete any active E2E flow as failed
    if (status === 'FATAL_DEBUGGING' || status === 'FAILED') {
      const flowId = activeE2EFlows.get(project);
      if (flowId) {
        console.log(`[Orchestrator] Completing E2E flow ${flowId} as failed due to ${status}`);
        (ui.io as any).emitFlowComplete(flowId, 'failed', {
          passed: false,
          summary: `E2E: ${status}`,
          details: message
        });
        activeE2EFlows.delete(project);
      }
    }
  });

  // Forward task status changes to UI
  statusMonitor.on('taskStatusChange', (event) => {
    (ui.io as any).emitTaskStatus(event);
  });

  // Track projects waiting for E2E (waiting on other projects)
  const pendingE2E: Map<string, { message: string; waitingOn: string[] }> = new Map();

  // Track projects with E2E requests already in the queue (prevents duplicates)
  const e2eQueuedProjects: Set<string> = new Set();

  // Helper to get project config - prefers workspace config if session has workspaceId
  const getProjectConfigForSession = (projectName: string): ProjectConfig | undefined => {
    const session = sessionManager.getCurrentSession();
    if (session?.workspaceId) {
      const workspaceConfigs = workspaceManager.getWorkspaceProjectConfigs(session.workspaceId);
      if (workspaceConfigs[projectName]) {
        return workspaceConfigs[projectName];
      }
    }
    // Fallback to global config
    return config.projects[projectName];
  };

  // Helper to get dev server URL for a project
  const getDevServerUrl = (project: string): string | null => {
    const projectConfig = getProjectConfigForSession(project);
    return projectConfig?.devServer?.url ?? null;
  };

  // ═══════════════════════════════════════════════════════════════
  // Project verification: deps, build, restart, health check
  // Used after tasks complete and before E2E tests run
  // ═══════════════════════════════════════════════════════════════

  // Helper to check and trigger E2E for a project (queues the request)
  const tryTriggerE2E = async (project: string, message: string) => {
    const session = sessionManager.getCurrentSession();
    const projectConfig = getProjectConfigForSession(project);

    // Guard: Skip if project already has E2E queued or is running E2E
    const currentStatus = statusMonitor.getStatus(project)?.status;
    if (currentStatus === 'E2E' || currentStatus === 'E2E_FIXING') {
      console.log(`[Orchestrator] Skipping E2E for ${project} - already in ${currentStatus} status`);
      return;
    }

    if (e2eQueuedProjects.has(project)) {
      console.log(`[Orchestrator] Skipping E2E for ${project} - already has E2E request queued`);
      return;
    }

    // Workspace root project never has E2E tests - it's for config/workflow files only
    if (project === WORKSPACE_ROOT_PROJECT) {
      console.log(`[Orchestrator] ${project} is workspace root - no E2E tests, marking as complete`);
      statusMonitor.updateStatus(project, 'IDLE', 'Workspace root has no E2E tests');
      return;
    }

    // Skip E2E if project has hasE2E: false
    if (projectConfig && projectConfig.hasE2E === false) {
      console.log(`[Orchestrator] ${project} has E2E disabled (hasE2E: false), marking as complete`);
      statusMonitor.updateStatus(project, 'IDLE', 'E2E disabled for this project');
      // This will trigger checkPendingE2E via the statusChange event
      return;
    }

    // If no test plan for this project, mark as IDLE (complete) immediately
    if (!session?.plan?.testPlan?.[project] || session.plan.testPlan[project].length === 0) {
      console.log(`[Orchestrator] ${project} has no E2E tests, marking as complete`);
      statusMonitor.updateStatus(project, 'IDLE', 'No E2E tests configured');
      // This will trigger checkPendingE2E via the statusChange event
      return;
    }

    // E2E dependency resolution (in priority order):
    // 1. Plan's e2eDependencies (planner decides based on feature)
    // 2. Project config's dependsOn (explicit override)
    // 3. Name-based detection (fallback for backwards compatibility)

    let dependencies: string[] | undefined;

    // 1. Check plan's e2eDependencies first (most reliable - planner knows the feature)
    if (session?.plan?.e2eDependencies?.[project]) {
      dependencies = session.plan.e2eDependencies[project];
      console.log(`[Orchestrator] Using plan e2eDependencies for ${project}: ${dependencies.join(', ')}`);
    }

    // 2. Check explicit project config override
    if (!dependencies && projectConfig?.dependsOn) {
      dependencies = projectConfig.dependsOn;
      console.log(`[Orchestrator] Using project config dependsOn for ${project}: ${dependencies.join(', ')}`);
    }

    // No name-based detection - dependencies must be explicitly configured via:
    // - plan.e2eDependencies (set by planner)
    // - projectConfig.dependsOn (set in config)

    if (dependencies && dependencies.length > 0) {
      const waitingOn: string[] = [];
      for (const dep of dependencies) {
        const depStatus = statusMonitor.getStatus(dep);
        if (depStatus?.status !== 'IDLE') {
          waitingOn.push(dep);
        }
      }

      if (waitingOn.length > 0) {
        console.log(`[Orchestrator] ${project} E2E waiting for dependencies: ${waitingOn.join(', ')}`);
        pendingE2E.set(project, { message, waitingOn });

        // Start E2E flow with waiting step
        const flowId = `e2e_${project}_${Date.now()}`;
        activeE2EFlows.set(project, flowId);
        const flow: RequestFlow = {
          id: flowId,
          type: 'e2e',
          project,
          status: 'in_progress',
          startedAt: Date.now(),
          steps: [{
            id: 'wait',
            status: 'active',
            message: `Waiting for ${waitingOn.join(', ')} to complete`,
            timestamp: Date.now()
          }]
        };
        (ui.io as any).emitFlowStart(flow);
        return;
      }
    }

    // No pre-E2E verification needed - all tasks for this project already passed verification
    const devServerUrl = getDevServerUrl(project);

    // Distinguish "no tests passed" from "no test data exists"
    const currentSessionId = sessionStore.getCurrentSessionId();
    const passedTestsResult = currentSessionId
      ? sessionStore.getPassedTestsWithMeta(currentSessionId, project)
      : { exists: false, passedTests: [], totalTests: 0 };

    const passedTests = passedTestsResult.passedTests;
    const allScenarios = session.plan.testPlan[project] || [];

    // Use normalized names for case-insensitive comparison
    const normalizeScenarioName = (name: string): string =>
      name.toLowerCase().trim().replace(/\s+/g, ' ');

    // Filter out passed scenarios - only run pending/failed ones
    const scenariosToTest = allScenarios.filter(s =>
      !passedTests.includes(normalizeScenarioName(s))
    );

    if (scenariosToTest.length === 0) {
      console.log(`[Orchestrator] All E2E tests already passed for ${project}, marking as complete`);
      statusMonitor.updateStatus(project, 'IDLE', 'All E2E tests passed');
      return;
    }

    if (passedTests.length > 0) {
      console.log(`[Orchestrator] Skipping ${passedTests.length} already-passed tests for ${project}`);
      if (passedTestsResult.exists) {
        console.log(`[Orchestrator] Test state exists: ${passedTestsResult.totalTests} total tests tracked`);
      }
    }

    // Check if project has custom E2E instructions
    if (projectConfig?.e2eInstructions) {
      console.log(`[Orchestrator] Using custom E2E instructions for ${project}`);

      // Start or update E2E flow for custom instructions
      let customFlowId = activeE2EFlows.get(project);
      if (!customFlowId) {
        customFlowId = `e2e_${project}_${Date.now()}`;
        activeE2EFlows.set(project, customFlowId);
        const flow: RequestFlow = {
          id: customFlowId,
          type: 'e2e',
          project,
          status: 'in_progress',
          startedAt: Date.now(),
          steps: [{
            id: 'run',
            status: 'active',
            message: 'Running E2E tests (custom instructions)',
            timestamp: Date.now()
          }]
        };
        (ui.io as any).emitFlowStart(flow);
      } else {
        // Update existing flow (was waiting)
        const step: FlowStep = {
          id: 'run',
          status: 'active',
          message: 'Running E2E tests (custom instructions)',
          timestamp: Date.now()
        };
        (ui.io as any).emitFlowStep(customFlowId, step);
      }

      // Build E2E prompt from custom instructions
      const e2ePrompt = `# E2E Testing for ${project}
${devServerUrl ? `\nDev Server URL: ${devServerUrl}` : ''}

## CRITICAL RULES - YOU MUST FOLLOW THESE
1. DO NOT start, build, or restart any servers - the orchestrator manages all servers
2. DO NOT run npm install, npm run build, npm run dev, or similar commands
3. The dev server is ALREADY RUNNING at the URL above - just run tests against it
4. If the server is not responding, FAIL the tests and report the error - DO NOT try to fix it
5. Your ONLY job is to run E2E tests and report results
6. **FAIL FAST**: Stop immediately after the FIRST test failure - do not continue to other tests
7. **When setting environment variables for commands, ALWAYS use the \`env\` command** - e.g. \`env NODE_ENV=test npx prisma migrate\` instead of \`NODE_ENV=test npx prisma migrate\`

## Custom Testing Instructions

${projectConfig.e2eInstructions}

## Test Scenarios to Verify
${scenariosToTest.map((s, i) => `${i + 1}. ${s}`).join('\n')}
${passedTests.length > 0 ? `\n(${passedTests.length} tests already passed and skipped)` : ''}

**IMPORTANT**: Output TEST STATUS MARKERS for real-time tracking:
- Before each test: [TEST_STATUS] {"scenario": "exact scenario text", "status": "running"}
- After passing: [TEST_STATUS] {"scenario": "exact scenario text", "status": "passed"}
- After failing: [TEST_STATUS] {"scenario": "exact scenario text", "status": "failed", "error": "brief error description"}

**FAIL FAST**: When a test fails, STOP immediately and report the failure. Do not continue to other tests.

## FINAL RESULT (REQUIRED)

At the END, output the test results using the [E2E_RESULTS] marker on a SINGLE LINE:

[E2E_RESULTS] {"allPassed": true/false, "failures": [{"test": "name", "error": "msg", "codeAnalysis": "analysis", "suspectedProject": "frontend|backend|both|this"}], "overallAnalysis": "summary"}

This marker is REQUIRED - the orchestrator uses it to parse results.`;

      // Execute E2E directly without going through Planning Agent
      await actionExecutor.execute({ type: 'send_e2e', project, prompt: e2ePrompt });
      return;
    }

    // Direct call - PA's internal queue handles serialization
    console.log(`[Orchestrator] Requesting E2E prompt for ${project}`);
    e2eQueuedProjects.add(project);  // Track to prevent duplicates

    // NOTE: Removed legacy emitE2EStart - now using flow system instead

    // Start or update E2E flow
    let flowId = activeE2EFlows.get(project);
    if (!flowId) {
      // New flow (no waiting step)
      flowId = `e2e_${project}_${Date.now()}`;
      activeE2EFlows.set(project, flowId);
      const flow: RequestFlow = {
        id: flowId,
        type: 'e2e',
        project,
        status: 'in_progress',
        startedAt: Date.now(),
        steps: [{
          id: 'generate',
          status: 'active',
          message: 'Generating E2E instructions',
          timestamp: Date.now()
        }]
      };
      (ui.io as any).emitFlowStart(flow);
    } else {
      // Update existing flow (was waiting)
      const step: FlowStep = {
        id: 'generate',
        status: 'active',
        message: 'Generating E2E instructions',
        timestamp: Date.now()
      };
      (ui.io as any).emitFlowStep(flowId, step);
    }

    try {
      let e2ePrompt = await chatHandler.requestE2EPrompt(project, message, scenariosToTest, devServerUrl ?? undefined, passedTests.length);
      // Clear tracking now that we've processed this E2E request
      e2eQueuedProjects.delete(project);

      if (e2ePrompt && e2ePrompt.trim()) {
        // Append mandatory marker instructions to ensure the agent outputs required markers
        // (The PA should include these but sometimes doesn't emphasize them enough)
        e2ePrompt += `

---
**MANDATORY: OUTPUT MARKERS**

You MUST output these markers for real-time tracking (the UI depends on them):
- Before each test: [TEST_STATUS] {"scenario": "exact scenario text", "status": "running"}
- After passing: [TEST_STATUS] {"scenario": "exact scenario text", "status": "passed"}
- After failing: [TEST_STATUS] {"scenario": "exact scenario text", "status": "failed", "error": "brief error"}

Output these markers on their own line, not inside code blocks.

**MANDATORY: FINAL RESULT**

At the END, output results using [E2E_RESULTS] marker on ONE LINE:
[E2E_RESULTS] {"allPassed": true/false, "failures": [{"test": "name", "error": "msg", "codeAnalysis": "analysis", "suspectedProject": "frontend|backend|both|this"}], "overallAnalysis": "summary"}`;

        console.log(`[Orchestrator] Executing E2E for ${project} (prompt: ${e2ePrompt.length} chars)`);

        // Emit green card for E2E prompt sent
        (ui.io as any).emitInstantFlow({
          id: `e2e_sent_${project}_${Date.now()}`,
          type: 'success',
          project,
          startedAt: Date.now(),
          steps: [],
          result: {
            passed: true,
            summary: `E2E: Testing started for ${project}`
          }
        });

        // Emit running step
        if (flowId) {
          const step: FlowStep = {
            id: 'run',
            status: 'active',
            message: 'Running E2E tests',
            timestamp: Date.now()
          };
          (ui.io as any).emitFlowStep(flowId, step);
        }

        await actionExecutor.execute({ type: 'send_e2e', project, prompt: e2ePrompt });
      } else {
        console.warn(`[Orchestrator] No E2E prompt generated for ${project}`);
      }
    } catch (err) {
      e2eQueuedProjects.delete(project);
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Orchestrator] Error generating E2E prompt for ${project}:`, err);
      chatHandler.systemMessage(`Error generating E2E prompt for ${project}: ${errorMsg}`);
    }
  };

  // Helper to check pending E2E when a project becomes IDLE
  const checkPendingE2E = async (completedProject: string) => {
    for (const [waitingProject, pending] of pendingE2E.entries()) {
      // Re-check ALL dependencies (not just the completed one)
      // This handles race conditions where multiple projects complete around the same time
      const projectConfig = getProjectConfigForSession(waitingProject);

      // Get dependencies: explicit config or from pending.waitingOn as fallback
      let dependencies = projectConfig?.dependsOn;
      if (!dependencies) {
        // Fallback to name-based detection for backwards compatibility
        const isFrontend = waitingProject.toLowerCase().includes('frontend') || waitingProject.toLowerCase().includes('-fe');
        if (isFrontend) {
          const session = sessionManager.getCurrentSession();
          dependencies = session?.projects.filter(p => {
            const pIsFE = p.toLowerCase().includes('frontend') || p.toLowerCase().includes('-fe');
            return !pIsFE && p !== waitingProject;
          }) || [];
        }
      }

      // Re-verify all dependencies are IDLE
      const stillWaiting = (dependencies || []).filter(dep => {
        const depStatus = statusMonitor.getStatus(dep);
        return depStatus?.status !== 'IDLE';
      });

      if (stillWaiting.length === 0) {
        // All dependencies satisfied, trigger E2E
        console.log(`[Orchestrator] Dependencies satisfied for ${waitingProject}, triggering E2E`);
        pendingE2E.delete(waitingProject);

        // Use tryTriggerE2E which includes health checks
        await tryTriggerE2E(waitingProject, pending.message);
      } else {
        // Update waiting list
        pending.waitingOn = stillWaiting;
      }
    }
  };

  statusMonitor.on('projectReady', async ({ project, message, previous }) => {
    console.log(`[Orchestrator] ${project} is READY: ${message} (previous: ${previous})`);

    // Check if this project has pending E2E retry (completed a fix task)
    const pendingRetry = pendingE2ERetry.get(project);
    if (pendingRetry) {
      console.log(`[Orchestrator] ${project} completed E2E fix for ${pendingRetry.failedProject}`);

      // Check if there are OTHER projects still fixing for the same failed project
      // This happens when E2E failure requires fixes across multiple projects
      // Important: Check BEFORE deleting current project's entry
      const stillFixing: string[] = [];
      for (const [fixProject, retry] of pendingE2ERetry.entries()) {
        if (fixProject !== project && retry.failedProject === pendingRetry.failedProject) {
          stillFixing.push(fixProject);
        }
      }

      // Now safe to delete current project's entry
      pendingE2ERetry.delete(project);

      if (stillFixing.length > 0) {
        console.log(`[Orchestrator] Waiting for ${stillFixing.join(', ')} to complete fixes before re-running E2E for ${pendingRetry.failedProject}`);
        // Don't trigger E2E yet - other projects are still fixing
        // The last project to complete will trigger E2E
        // Set this project back to IDLE since it completed its fix
        statusMonitor.updateStatus(project, 'IDLE', 'E2E fix completed, waiting for other fixes');
        return;
      }

      // All fixes complete - trigger E2E re-run with preserved test scenarios and retry count
      console.log(`[Orchestrator] All fixes complete, re-running E2E tests for ${pendingRetry.failedProject}`);
      // Clean up pendingE2E entry if it exists
      pendingE2E.delete(pendingRetry.failedProject);
      e2eRetryCount.set(pendingRetry.failedProject, pendingRetry.retryCount);
      await tryTriggerE2E(pendingRetry.failedProject, `E2E re-run after fix attempt ${pendingRetry.retryCount}`);
      return;
    }

    // When coming from E2E_FIXING state (fixing ANOTHER project's E2E):
    if (previous === 'E2E_FIXING') {
      const fixingFor = e2eFixingFor.get(project);
      if (fixingFor && fixingFor !== project) {
        // This project was fixing another project's E2E
        // Set back to IDLE (it already passed its own E2E)
        console.log(`[Orchestrator] ${project} completed E2E fix for ${fixingFor}, setting to IDLE`);
        e2eFixingFor.delete(project);
        statusMonitor.updateStatus(project, 'IDLE', 'E2E fix completed');
        return;
      }
    }

    // Skip E2E for ad-hoc work on already-completed projects
    // When a user sends a prompt to an IDLE project, it goes IDLE → WORKING → READY
    // We don't want to re-run E2E for these ad-hoc tasks
    if (previous === 'IDLE') {
      console.log(`[Orchestrator] Skipping E2E for ad-hoc work on completed project ${project}`);
      statusMonitor.updateStatus(project, 'IDLE', 'Ad-hoc task completed');
      return;
    }

    await tryTriggerE2E(project, message);
  });

  statusMonitor.on('statusChange', async ({ project, status }) => {
    // When a project becomes IDLE (E2E complete), check if any pending E2E can start
    if (status === 'IDLE') {
      // Small delay to ensure all state has settled (fixes race condition)
      await new Promise(resolve => setTimeout(resolve, 50));
      await checkPendingE2E(project);
    }
  });

  statusMonitor.on('allComplete', async () => {
    console.log('[Orchestrator] All projects IDLE - Feature complete!');
    chatHandler.systemMessage('All projects completed! Feature implementation done.');
    (ui.io as any).emitAllComplete();

    // Mark session as completed
    sessionManager.markSessionCompleted();

    // Stop dev servers on completion - user can restart from workspace if needed
    console.log('[Orchestrator] Stopping dev servers after session completion...');
    await processManager.stopAllDevServers();
    ui.io.emit('devServerStatus', { servers: [] });

    // For orchyManaged workspaces: user will see CompletionPanel with Save/Discard buttons
    // No auto-merge - let user decide via the UI
  });

  // ═══════════════════════════════════════════════════════════════
  // Wire up Template Manager events
  // ═══════════════════════════════════════════════════════════════

  templateManager.on('projectAdded', ({ name, config: projectConfig }) => {
    console.log(`[Orchestrator] Project added: ${name}`);
    (ui.io as any).emit('projectAdded', { name, config: projectConfig });
    chatHandler.systemMessage(`Project "${name}" has been added.`);
  });

  templateManager.on('dependencyInstallStart', ({ project }) => {
    console.log(`[Orchestrator] npm install started for ${project}`);
    (ui.io as any).emit('npmInstallStart', { project });
    chatHandler.systemMessage(`Running npm install for "${project}"...`);
  });

  templateManager.on('dependencyInstallLog', ({ project, text, stream }) => {
    (ui.io as any).emit('npmInstallLog', { project, text, stream });
  });

  templateManager.on('dependencyInstallComplete', ({ project }) => {
    console.log(`[Orchestrator] npm install completed for ${project}`);
    (ui.io as any).emit('npmInstallComplete', { project });
    chatHandler.systemMessage(`npm install completed for "${project}".`);
  });

  templateManager.on('dependencyInstallError', ({ project, error }) => {
    console.error(`[Orchestrator] npm install failed for ${project}:`, error);
    (ui.io as any).emit('npmInstallError', { project, error });
    chatHandler.systemMessage(`npm install failed for "${project}": ${error}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // Wire up Chat Handler / Planning Agent events
  // ═══════════════════════════════════════════════════════════════

  chatHandler.on('chat', ({ from, message }) => {
    (ui.io as any).emitChat(from, message);
    sessionLogger?.chat(from, message);
  });

  // Track failed task index per project for continuation after user fix
  const failedTaskIndex: Map<string, number> = new Map();

  // Handle user-requested actions from chat
  chatHandler.on('userAction', async (action: any) => {
    console.log(`[Orchestrator] Executing user-requested action: ${action.type}`);

    try {
      // Handle restart_server - always allowed
      if (action.type === 'restart_server') {
        await actionExecutor.execute(action);
        return;
      }

      // For send_to_agent and send_e2e, check project status
      if (action.type === 'send_to_agent' || action.type === 'send_e2e') {
        const projectStatus = statusMonitor.getStatus(action.project);
        const status = projectStatus?.status;

        // Only allow when FAILED or IDLE
        if (status !== 'FAILED' && status !== 'IDLE') {
          chatHandler.systemMessage(
            `Cannot send prompt to ${action.project} - project is ${status}. ` +
            `Prompts can only be sent when project is FAILED (needs fix) or IDLE (completed).`
          );
          return;
        }

        if (status === 'IDLE') {
          // Ad-hoc work on completed project - just run it, no verification
          console.log(`[Orchestrator] Ad-hoc prompt to IDLE project ${action.project}`);
          try {
            await actionExecutor.sendUserFix(action.project, action.prompt);
            // Keep status as IDLE (handled by projectReady skip for previous=IDLE)
            statusMonitor.updateStatus(action.project, 'IDLE', 'Ad-hoc task completed');
            chatHandler.systemMessage(`Ad-hoc task completed for ${action.project}.`);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            chatHandler.systemMessage(`Ad-hoc task failed: ${errorMsg}`);
          }
          return;
        }

        if (status === 'FAILED') {
          // User is providing a fix for failed task - run with verification
          console.log(`[Orchestrator] User fix for FAILED project ${action.project}`);
          chatHandler.systemMessage(`Applying fix to ${action.project}...`);

          try {
            // Run the user's fix
            await actionExecutor.sendUserFix(action.project, action.prompt);

            // Run verification using TaskExecutor's logic
            if (!taskExecutor) {
              throw new Error('TaskExecutor not initialized');
            }

            const session = sessionManager.getCurrentSession();
            const failedIdx = failedTaskIndex.get(action.project);
            const failedTask = failedIdx !== undefined && session?.plan?.tasks[failedIdx];

            if (!failedTask) {
              // No specific task context, just mark as ready
              statusMonitor.updateStatus(action.project, 'READY', 'User fix applied');
              return;
            }

            // Collect verification context
            chatHandler.systemMessage(`Verifying fix for ${action.project}...`);
            const verificationContext = await (taskExecutor as any).collectVerificationContext(
              action.project,
              failedTask.name,
              failedTask.task
            );

            // Let Planning Agent analyze
            const analysis = await planningAgent.analyzeTaskResult(verificationContext);

            if (analysis.passed) {
              // Fix worked! Check if there are more tasks for this project
              console.log(`[Orchestrator] User fix PASSED for ${action.project}`);
              chatHandler.systemMessage(`✓ Fix verified!`);
              failedTaskIndex.delete(action.project);
              statusMonitor.updateTaskStatus(failedIdx, 'completed', 'Fixed by user');

              // Check for remaining tasks after the fixed one
              const allTasks = session?.plan?.tasks || [];
              const remainingTasks = allTasks
                .map((t, idx) => ({ task: t, taskIndex: idx }))
                .filter(({ task, taskIndex }) =>
                  task.project === action.project && taskIndex > failedIdx
                );

              if (remainingTasks.length > 0) {
                // Continue with remaining tasks using persistent session
                chatHandler.systemMessage(`Continuing with ${remainingTasks.length} remaining task(s)...`);
                console.log(`[Orchestrator] Starting persistent session for ${action.project} with ${remainingTasks.length} remaining task(s)`);

                const result = await taskExecutor!.executePersistentSession(action.project, remainingTasks);

                if (!result.success) {
                  const failedTask = remainingTasks.find(t => t.taskIndex === result.failedTasks[0]);
                  console.log(`[Orchestrator] Task failed, stopping for user intervention`);
                  chatHandler.systemMessage(
                    `Task "${failedTask?.task.name || 'unknown'}" failed. Please provide a fix instruction.`
                  );
                  return; // Stop and wait for user
                }
                // All remaining tasks completed
                statusMonitor.updateStatus(action.project, 'READY', 'All tasks completed');
              } else {
                // No more tasks, go to READY (triggers E2E)
                statusMonitor.updateStatus(action.project, 'READY', 'User fix verified');
              }
            } else {
              // Fix didn't work - back to FAILED
              console.log(`[Orchestrator] User fix FAILED for ${action.project}: ${analysis.analysis}`);
              chatHandler.systemMessage(`✗ Fix verification failed: ${analysis.analysis}`);
              statusMonitor.updateStatus(action.project, 'FAILED', analysis.analysis);
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(`[Orchestrator] User fix failed:`, err);
            chatHandler.systemMessage(`Fix failed: ${errorMsg}`);
            statusMonitor.updateStatus(action.project, 'FAILED', errorMsg);
          }
          return;
        }
      }

      // Handle skip_e2e - mark project as complete, unblocking dependents
      if (action.type === 'skip_e2e') {
        const projectStatus = statusMonitor.getStatus(action.project);
        const status = projectStatus?.status;

        // Only allow when stuck (FATAL_DEBUGGING, BLOCKED, or FAILED)
        if (status !== 'FATAL_DEBUGGING' && status !== 'BLOCKED' && status !== 'FAILED') {
          chatHandler.systemMessage(
            `Cannot skip E2E for ${action.project} - project is ${status}. ` +
            `Skip is only available when project is FATAL_DEBUGGING, BLOCKED, or FAILED.`
          );
          return;
        }

        const reason = action.reason || 'Skipped by user';
        console.log(`[Orchestrator] Skipping E2E for ${action.project}: ${reason}`);
        statusMonitor.updateStatus(action.project, 'IDLE', `E2E skipped: ${reason}`);
        e2eRetryCount.delete(action.project);
        chatHandler.systemMessage(`Marked ${action.project} as complete (E2E skipped). Dependent projects can now proceed.`);
        return;
      }

      // Handle retry_e2e - re-run E2E tests
      if (action.type === 'retry_e2e') {
        const projectStatus = statusMonitor.getStatus(action.project);
        const status = projectStatus?.status;

        // BLOCKED means waiting for dependency - retry won't help
        if (status === 'BLOCKED') {
          chatHandler.systemMessage(
            `Cannot retry E2E for ${action.project} - project is BLOCKED waiting for dependencies. ` +
            `Either wait for dependencies to complete, or use skip_e2e to mark this project as complete.`
          );
          return;
        }

        // Only allow when stuck (FATAL_DEBUGGING or FAILED)
        if (status !== 'FATAL_DEBUGGING' && status !== 'FAILED') {
          chatHandler.systemMessage(
            `Cannot retry E2E for ${action.project} - project is ${status}. ` +
            `Retry is only available when project is FATAL_DEBUGGING or FAILED.`
          );
          return;
        }

        console.log(`[Orchestrator] Retrying E2E for ${action.project}`);
        e2eRetryCount.delete(action.project); // Reset retry count
        chatHandler.systemMessage(`Retrying E2E tests for ${action.project}...`);

        // Trigger E2E through normal flow
        await tryTriggerE2E(action.project, 'Retry requested by user');
        return;
      }

      // Fallback for other action types
      await actionExecutor.execute(action);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Orchestrator] Failed to execute user action:`, err);
      chatHandler.systemMessage(`Failed to execute action: ${errorMsg}`);
    }
  });

  
  // Forward planning status events to UI
  chatHandler.on('planningStatus', (event) => {
    (ui.io as any).emitPlanningStatus(event);
  });

  // Forward analysis result events to UI
  chatHandler.on('analysisResult', (event) => {
    (ui.io as any).emitAnalysisResult(event);
  });

  // Forward streaming events to UI for agentic chat
  // Also persist chat messages on message_complete
  // NOTE: PA responses don't need flows - they appear in the chat timeline
  // Planning requests use planningStatus indicator (exploring, analyzing, generating phases)
  chatHandler.on('stream', (event) => {
    (ui.io as any).emitChatStream(event);

    // Persist completed messages to SessionStore
    if (event.type === 'message_complete') {
      const currentSessionId = sessionStore.getCurrentSessionId();
      if (currentSessionId) {
        // Create a StreamingMessage from the completed event
        const message: StreamingMessage = {
          id: event.messageId,
          role: 'assistant',
          content: event.content || [],
          status: 'complete',
          createdAt: Date.now(),
        };
        sessionStore.appendChatMessage(currentSessionId, message);
      }
    }
  });

  // Forward flow events for 2-phase planning UI
  chatHandler.on('flowStart', (flow) => {
    ui.io.emit('flowStart', flow);
    // Initialize planning session state when multi-stage planning workflow starts
    if (flow.type === 'planning' && flow.id?.startsWith('planning_workflow_')) {
      (ui.io as any).initPlanningSession?.();
    }
  });

  chatHandler.on('flowStep', (data) => {
    ui.io.emit('flowStep', data);
  });

  chatHandler.on('flowComplete', (data) => {
    ui.io.emit('flowComplete', data);
  });

  // Persist exploration result from Phase 1 to session
  chatHandler.on('explorationComplete', (result) => {
    const currentSessionId = sessionStore.getCurrentSessionId();
    if (currentSessionId) {
      sessionStore.setExplorationResult(currentSessionId, result);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Merge Session Helper (for managed git approve changes flow)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Executes merge operations for all git branches in a session.
   * Used by both auto-merge (on completion) and manual approve changes button.
   */
  const executeMergeSession = async (sessionId: string) => {
    const persistedSession = sessionStore.loadSession(sessionId);
    if (!persistedSession) {
      console.error(`[Orchestrator] Merge session failed: session ${sessionId} not found`);
      return { success: false, error: 'Session not found' };
    }

    const session = sessionStore.toSession(persistedSession);

    if (!session.gitBranches || Object.keys(session.gitBranches).length === 0) {
      console.log(`[Orchestrator] No git branches to merge for session ${sessionId}`);
      return { success: true, message: 'No branches to merge' };
    }

    // Get workspace config for project configs
    let projectConfigs: Record<string, ProjectConfig> = {};
    let isOrchyManaged = false;
    if (session.workspaceId) {
      projectConfigs = workspaceManager.getWorkspaceProjectConfigs(session.workspaceId);
      const workspace = workspaceManager.getWorkspace(session.workspaceId);
      isOrchyManaged = workspace?.orchyManaged === true;
    }

    const results: Record<string, { success: boolean; message: string }> = {};
    let allSucceeded = true;

    const gitBranches = session.gitBranches as Record<string, string>;

    // Orchy Managed workspaces: single merge operation at workspace root
    if (isOrchyManaged && gitBranches['_workspace']) {
      const branchName = gitBranches['_workspace'];

      // Get workspace root path from first project
      const firstProjectConfig = Object.values(projectConfigs)[0];
      if (!firstProjectConfig) {
        return { success: false, error: 'No project configs found for workspace' };
      }

      let workspaceRootPath = firstProjectConfig.path;
      if (workspaceRootPath.startsWith('~')) {
        workspaceRootPath = workspaceRootPath.replace('~', process.env.HOME || '');
      }
      workspaceRootPath = path.dirname(workspaceRootPath);

      // Emit merge session started
      ui.io.emit('mergeSessionStarted', { sessionId, projects: ['_workspace'] });

      try {
        console.log(`[Orchestrator] Orchy Managed: merging ${branchName} to main at workspace root...`);

        // Check if remote exists
        const hasRemote = await gitManager.hasRemote(workspaceRootPath);

        // Push branch to remote if remote exists
        if (hasRemote) {
          ui.io.emit('mergeProgress', { sessionId, project: '_workspace', status: 'pushing' });
          const pushResult = await gitManager.pushBranch(workspaceRootPath, branchName);
          if (!pushResult.success) {
            // Log warning but continue with merge - push failure shouldn't block local merge
            console.warn(`[Orchestrator] Push failed (will continue with local merge): ${pushResult.message}`);
          }
        } else {
          console.log(`[Orchestrator] No remote configured - skipping push, will merge locally`);
        }

        // Merge to main (handles both local and remote repos)
        ui.io.emit('mergeProgress', { sessionId, project: '_workspace', status: 'merging' });
        const mergeResult = await gitManager.mergeBranch(workspaceRootPath, branchName, 'main');

        if (mergeResult.success) {
          results['_workspace'] = { success: true, message: mergeResult.message };
          ui.io.emit('mergeProgress', { sessionId, project: '_workspace', status: 'completed' });

          // Auto-push main to remote if GitHub is enabled
          const workspace = session.workspaceId ? workspaceManager.getWorkspace(session.workspaceId) : null;
          if (workspace?.github?.enabled && workspace.github?.repo) {
            console.log(`[Orchestrator] Auto-pushing main to GitHub remote: ${workspace.github.repo}`);
            ui.io.emit('mergeProgress', { sessionId, project: '_workspace', status: 'pushing_main' });

            const pushMainResult = await githubManager.pushToRemote(workspaceRootPath, 'main', workspace.github.repo);
            if (pushMainResult.success) {
              console.log(`[Orchestrator] Successfully pushed main to GitHub`);
            } else {
              console.warn(`[Orchestrator] Failed to push main to GitHub: ${pushMainResult.error}`);
              // Don't fail the whole merge - just log the warning
            }
          }
        } else {
          results['_workspace'] = { success: false, message: mergeResult.message };
          allSucceeded = false;
          ui.io.emit('mergeProgress', { sessionId, project: '_workspace', status: 'failed', message: mergeResult.message });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results['_workspace'] = { success: false, message: errorMsg };
        allSucceeded = false;
        ui.io.emit('mergeProgress', { sessionId, project: '_workspace', status: 'failed', message: errorMsg });
      }
    } else {
      // Regular workspaces: per-project merge operations
      // Emit merge session started
      ui.io.emit('mergeSessionStarted', { sessionId, projects: Object.keys(gitBranches) });

      for (const [projectName, branchName] of Object.entries(gitBranches)) {
        const projectConfig = projectConfigs[projectName] || config.projects[projectName];
        if (!projectConfig) {
          results[projectName] = { success: false, message: 'Project config not found' };
          allSucceeded = false;
          continue;
        }

        // Expand path
        let projectPath = projectConfig.path;
        if (projectPath.startsWith('~')) {
          projectPath = projectPath.replace('~', process.env.HOME || '');
        }

        const mainBranch = projectConfig.mainBranch || 'main';

        try {
          console.log(`[Orchestrator] Merging ${branchName} to ${mainBranch} for ${projectName}...`);

          // Check if remote exists
          const hasRemote = await gitManager.hasRemote(projectPath);

          // Push branch to remote if remote exists
          if (hasRemote) {
            ui.io.emit('mergeProgress', { sessionId, project: projectName, status: 'pushing' });
            const pushResult = await gitManager.pushBranch(projectPath, branchName);
            if (!pushResult.success) {
              // Log warning but continue with merge
              console.warn(`[Orchestrator] Push failed for ${projectName} (will continue with local merge): ${pushResult.message}`);
            }
          } else {
            console.log(`[Orchestrator] No remote configured for ${projectName} - will merge locally`);
          }

          // Merge to main (handles both local and remote repos)
          ui.io.emit('mergeProgress', { sessionId, project: projectName, status: 'merging' });
          const mergeResult = await gitManager.mergeBranch(projectPath, branchName, mainBranch);

          if (mergeResult.success) {
            results[projectName] = { success: true, message: mergeResult.message };
            ui.io.emit('mergeProgress', { sessionId, project: projectName, status: 'completed' });
          } else {
            results[projectName] = { success: false, message: mergeResult.message };
            allSucceeded = false;
            ui.io.emit('mergeProgress', { sessionId, project: projectName, status: 'failed', message: mergeResult.message });
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          results[projectName] = { success: false, message: errorMsg };
          allSucceeded = false;
          ui.io.emit('mergeProgress', { sessionId, project: projectName, status: 'failed', message: errorMsg });
        }
      }
    }

    // Emit merge session completed
    ui.io.emit('mergeSessionCompleted', { sessionId, results, allSucceeded });

    if (allSucceeded) {
      console.log(`[Orchestrator] All branches merged successfully for session ${sessionId}`);
      chatHandler.systemMessage('All changes approved and merged successfully!');
    } else {
      console.warn(`[Orchestrator] Some merge operations failed for session ${sessionId}:`, results);
      chatHandler.systemMessage('Some merge operations failed. Check the results for details.');
    }

    return { success: allSucceeded, results };
  };

  // ═══════════════════════════════════════════════════════════════
  // Wire up UI Socket events
  // ═══════════════════════════════════════════════════════════════

  ui.io.on('connection', (socket) => {
    // Handle dependency check (runs on connect from UI)
    socket.on('checkDependencies', async () => {
      try {
        const result = await checkDependencies();

        // Transform to the expected format for backward compatibility
        const claudeDep = result.dependencies.find((d) => d.name === 'Claude Code');
        const gitDep = result.dependencies.find((d) => d.name === 'Git');
        const ghDep = result.dependencies.find((d) => d.name === 'GitHub CLI');

        socket.emit('dependencyCheck', {
          claude: {
            available: claudeDep?.available ?? false,
            version: claudeDep?.version ?? null,
            error: claudeDep?.error ?? null,
            installGuide: claudeDep?.installGuide,
            debug: claudeDep?.debug ?? null,
          },
          git: {
            available: gitDep?.available ?? false,
            version: gitDep?.version ?? null,
            error: gitDep?.error ?? null,
            installGuide: gitDep?.installGuide,
          },
          gh: {
            available: ghDep?.available ?? false,
            version: ghDep?.version ?? null,
            error: ghDep?.error ?? null,
          },
          // Include full result for enhanced UI
          fullResult: result,
        });

        // Log dependency status on server
        if (!result.allAvailable) {
          console.log('[Orchestrator] Missing dependencies detected:');
          console.log(formatDependencyResults(result));
        }
      } catch (err) {
        console.error('[Orchestrator] Dependency check failed:', err);
        socket.emit('dependencyCheck', {
          claude: { available: false, version: null, error: 'Check failed' },
          git: { available: false, version: null, error: 'Check failed' },
          gh: { available: false, version: null, error: 'Check failed' },
        });
      }
    });

    // Handle user chat with optional target
    socket.on('chat', ({ message, target }: { message: string; target?: string }) => {
      // Persist user message to SessionStore
      const currentSessionId = sessionStore.getCurrentSessionId();
      if (currentSessionId) {
        const userMessage: StreamingMessage = {
          id: `user_${Date.now()}`,
          role: 'user',
          content: [{ type: 'text', text: message }],
          status: 'complete',
          createdAt: Date.now(),
        };
        sessionStore.appendChatMessage(currentSessionId, userMessage);
      }

      if (target && target !== 'planning') {
        // Direct prompt to specific agent (bypasses queue)
        console.log(`[Orchestrator] Chat to agent: ${target}`);
        const success = actionExecutor.sendDirect(target, message);
        if (!success) {
          chatHandler.systemMessage(`Failed to send message to ${target}`);
        }
      } else {
        // Direct call - PA's internal queue handles serialization
        chatHandler.handleUserMessage(message);
      }
    });

    // Handle session creation request
    socket.on('startSession', async ({ feature, projects, branchName, workspaceId }: { feature: string; projects: string[]; branchName?: string; workspaceId?: string }) => {
      try {
        // If workspaceId provided, look up workspace and prepend context
        let resolvedFeature = feature;
        let resolvedProjects = projects;
        let workspaceProjectConfigs: Record<string, ProjectConfig> = {};
        let isOrchyManaged = false;

        if (workspaceId) {
          const workspace = workspaceManager.getWorkspace(workspaceId);
          if (workspace) {
            // Get project configs from workspace (inline storage)
            workspaceProjectConfigs = workspaceManager.getWorkspaceProjectConfigs(workspaceId);

            // Check if this is an Orchy Managed workspace (monorepo with git features)
            isOrchyManaged = workspace.orchyManaged === true;

            // MERGE workspace configs into config.projects so all managers have access
            // This is the simple fix: ProcessManager, SessionManager, TaskExecutor, etc. all use config.projects
            Object.assign(config.projects, workspaceProjectConfigs);

            // Also update PlanningAgent's project config and GitHub settings
            planningAgent.setProjectConfig(config.projects);
            planningAgent.setWorkspaceGitHub(workspace?.github);
            // Set deployment availability based on workspace config
            const deploymentCheck = deploymentManager.isDeploymentEnabled(workspaceId);
            planningAgent.setDeploymentEnabled(deploymentCheck.enabled);

            // Use workspace projects if none explicitly provided
            if (!resolvedProjects || resolvedProjects.length === 0) {
              resolvedProjects = workspaceManager.getWorkspaceProjectNames(workspaceId);
            } else if (isOrchyManaged) {
              // For orchyManaged workspaces, always include the workspace root project
              // even if specific projects were provided
              if (!resolvedProjects.includes(WORKSPACE_ROOT_PROJECT)) {
                resolvedProjects = [...resolvedProjects, WORKSPACE_ROOT_PROJECT];
              }
            }
            // Prepend workspace context to feature
            if (workspace.context) {
              resolvedFeature = `## Workspace Context\n${workspace.context}\n\n## Feature\n${feature}`;
            }
          }
        }

        // Helper to get project config (workspace first, then global)
        const getProjectConfig = (projectName: string): ProjectConfig | undefined => {
          return workspaceProjectConfigs[projectName] || config.projects[projectName];
        };

        // Create session (pass workspaceId for persistence)
        const session = sessionManager.createSession(resolvedFeature, resolvedProjects, workspaceId);

        // Initialize git branches for git-enabled projects
        const gitBranches: Record<string, string> = {};

        // For orchyManaged: generate branch name with AI if not provided
        let actualBranchName: string | undefined;
        if (isOrchyManaged && !branchName?.trim()) {
          try {
            console.log('[Orchestrator] Managed git: generating branch name with AI...');
            actualBranchName = await generateBranchName(feature);
            console.log(`[Orchestrator] Generated branch name: ${actualBranchName}`);
          } catch (err) {
            console.warn('[Orchestrator] Failed to generate branch name with AI, using fallback:', err);
            actualBranchName = gitManager.generateBranchName(feature);
          }
        }

        // Orchy Managed workspaces: single git repo at workspace root
        if (isOrchyManaged && workspaceId) {
          // Get workspace root path from first project's parent directory
          const firstProjectConfig = Object.values(workspaceProjectConfigs)[0];
          if (firstProjectConfig) {
            let workspaceRootPath = firstProjectConfig.path;
            if (workspaceRootPath.startsWith('~')) {
              workspaceRootPath = workspaceRootPath.replace('~', process.env.HOME || '');
            }
            workspaceRootPath = path.dirname(workspaceRootPath);

            try {
              console.log(`[Orchestrator] Orchy Managed: setting up git at workspace root: ${workspaceRootPath}`);

              // Check for uncommitted changes and stash if needed
              const uncommitted = await gitManager.hasUncommittedChanges(workspaceRootPath);
              let didStash = false;
              if (uncommitted.hasChanges) {
                console.log(`[Orchestrator] Stashing uncommitted changes before branch switch (${uncommitted.staged} staged, ${uncommitted.unstaged} unstaged, ${uncommitted.untracked} untracked)`);
                const stashResult = await gitManager.stashChanges(workspaceRootPath, 'orchy-session-start');
                didStash = stashResult.success;
                if (!didStash) {
                  console.warn(`[Orchestrator] Failed to stash changes: ${stashResult.message}`);
                }
              }

              // Checkout main and pull latest
              const checkoutResult = await gitManager.createAndCheckoutBranch(workspaceRootPath, 'main');
              if (!checkoutResult.success) {
                console.error(`[Orchestrator] Failed to checkout main for workspace: ${checkoutResult.message}`);
                chatHandler.systemMessage(`Git setup warning: Could not checkout main branch. ${checkoutResult.message}`);
              }

              // Pull latest (ignore errors for repos without remote)
              try {
                const pullResult = await gitManager.pullBranch(workspaceRootPath, 'main');
                if (pullResult.success) {
                  console.log(`[Orchestrator] Pulled latest main for workspace`);
                }
              } catch (pullErr) {
                console.log(`[Orchestrator] Pull skipped for workspace (no remote or error): ${pullErr}`);
              }

              // Use branch name from: 1) user input, 2) AI-generated, 3) fallback
              const finalBranchName = branchName?.trim() || actualBranchName || gitManager.generateBranchName(resolvedFeature);

              // Create and checkout branch at workspace root
              const branchResult = await gitManager.createAndCheckoutBranch(workspaceRootPath, finalBranchName);
              if (branchResult.success) {
                // Store with special '_workspace' key to indicate workspace-level branch
                gitBranches['_workspace'] = finalBranchName;
                console.log(`[Orchestrator] Orchy Managed: git branch '${finalBranchName}' ${branchResult.created ? 'created' : 'checked out'} at workspace root`);
              } else {
                console.error(`[Orchestrator] Failed to setup git branch for workspace: ${branchResult.message}`);
                chatHandler.systemMessage(`Git setup warning: Could not create branch '${finalBranchName}'. ${branchResult.message}. Changes may not be tracked properly.`);
              }

              // Auto-create GitHub repo if enabled but not yet created
              const workspace = workspaceManager.getWorkspace(workspaceId);
              if (workspace?.github?.enabled && !workspace.github.repo) {
                console.log(`[Orchestrator] Creating GitHub repo for workspace: ${workspace.name}`);
                chatHandler.systemMessage(`Creating GitHub repository for ${workspace.name}...`);

                const repoResult = await githubManager.createRepoOnly({
                  name: workspace.name,
                  visibility: workspace.github.visibility || 'private',
                  ownerType: workspace.github.ownerType || 'user',
                  owner: workspace.github.owner,
                });

                if (repoResult.success && repoResult.repo) {
                  console.log(`[Orchestrator] GitHub repo created: ${repoResult.repo}`);
                  chatHandler.systemMessage(`GitHub repository created: ${repoResult.repo}`);

                  // Add remote to the workspace
                  const addRemoteResult = await githubManager.addRemote(workspaceRootPath, repoResult.repo);
                  if (addRemoteResult.success) {
                    console.log(`[Orchestrator] Added GitHub remote to workspace`);
                  } else {
                    console.warn(`[Orchestrator] Failed to add GitHub remote: ${addRemoteResult.error}`);
                  }

                  // Update workspace config with the repo
                  workspaceManager.updateWorkspace(workspaceId, {
                    github: {
                      ...workspace.github,
                      repo: repoResult.repo,
                    },
                  });
                  // Emit updated workspaces
                  ui.io.emit('workspaces', workspaceManager.getWorkspaces());
                } else {
                  console.error(`[Orchestrator] Failed to create GitHub repo: ${repoResult.error}`);
                  chatHandler.systemMessage(`Failed to create GitHub repository: ${repoResult.error}`);
                }
              }

              // Note: We don't restore the stash here - the stashed changes are from a previous session
              // and should be manually handled by the user if needed
              if (didStash) {
                console.log(`[Orchestrator] Previous session changes were stashed. Use 'git stash pop' in workspace to restore if needed.`);
              }
            } catch (err) {
              console.error(`[Orchestrator] Git setup failed for Orchy Managed workspace:`, err);
              chatHandler.systemMessage(`Git setup error: ${err}. Session will continue but git features may not work.`);
            }
          }
        }
        // Non-orchyManaged workspaces: no git features

        // Store git branches in session
        if (Object.keys(gitBranches).length > 0) {
          session.gitBranches = gitBranches;
          sessionStore.updateGitBranches(session.id, gitBranches);
        }

        // Set current session ID on StatusMonitor and LogAggregator for persistence
        statusMonitor.setCurrentSessionId(session.id);
        logAggregator.setCurrentSessionId(session.id);

        // Create session logger for debugging
        sessionLogger = new SessionLogger(session.id);
        sessionLogger.log('SESSION_CREATE', { feature: resolvedFeature, projects: resolvedProjects });

        // Initialize status for each project
        for (const project of resolvedProjects) {
          statusMonitor.initializeProject(project);
          const sessionDir = sessionManager.getSessionDir(project);
          if (sessionDir) {
            logAggregator.registerProject(project, sessionDir);
                      }
        }

        (ui.io as any).emitSessionCreated(session);
        chatHandler.systemMessage(`Session created: ${session.id}`);
        sessionLogger.chat('system', `Session created: ${session.id}`);

        // Get project paths for Planning Agent to explore (prefer workspace configs)
        const projectPaths: Record<string, string> = {};
        for (const project of resolvedProjects) {
          const projectConfig = getProjectConfig(project);
          if (projectConfig) {
            projectPaths[project] = projectConfig.path;
          }
        }

        // Request plan from Planning Agent with project paths
        sessionLogger.chat('user', `Create a plan for: ${resolvedFeature}`);
        chatHandler.requestPlan(resolvedFeature, resolvedProjects, projectPaths);
      } catch (err) {
        console.error('[Orchestrator] Failed to create session:', err);
        chatHandler.systemMessage(`Failed to create session: ${err}`);
        sessionLogger?.error('SESSION_CREATE', err);
      }
    });

    // Handle plan approval
    socket.on('approvePlan', (plan: Plan) => {
      sessionManager.setPlan(plan);
      // Initialize task tracking and broadcast to all clients
      statusMonitor.initializeTasks(plan.tasks);
      (ui.io as any).emitTaskStates(statusMonitor.getAllTaskStates());
      // Send updated session to UI so session.plan is set
      const updatedSession = sessionManager.getCurrentSession();
      if (updatedSession) {
        (ui.io as any).emitSession(updatedSession);
      }

      // Update the planning flow to show "Plan approved" (mutates existing flow)
      // Change type to 'success' so it shows green with checkmark
      const planningFlowId = (ui.io as any).getCurrentPlanningFlowId?.();
      if (planningFlowId) {
        (ui.io as any).emitFlowUpdate(planningFlowId, {
          passed: true,
          summary: `Plan approved: "${plan.feature}" - ${plan.tasks.length} tasks across ${new Set(plan.tasks.map(t => t.project)).size} projects`
        }, 'success');
      }

      chatHandler.systemMessage('Plan approved! Ready to start execution.');
    });

    // Handle execution start
    socket.on('startExecution', async () => {
      const session = sessionManager.getCurrentSession();
      if (!session || !session.plan) {
        chatHandler.systemMessage('No session or plan available');
        return;
      }

      // Reset statuses for all projects to PENDING before starting
      for (const project of session.projects) {
        statusMonitor.initializeProject(project);
      }

      // Start the state machine
      stateMachine.transition('start');
      chatHandler.systemMessage('Starting execution...');

      // Start dev servers for all projects
      for (const project of session.projects) {
        try {
          console.log(`[Orchestrator] Starting dev server for ${project}...`);
          await processManager.startDevServer(project);
        } catch (err) {
          console.error(`[Orchestrator] Failed to start dev server for ${project}:`, err);
          statusMonitor.updateStatus(project, 'FATAL_DEBUGGING', `Dev server failed: ${err}`);
        }
      }

      const tasks = session.plan.tasks;

      // Handle case where there are no tasks (alreadyImplemented: true)
      if (tasks.length === 0) {
        console.log('[Orchestrator] No tasks to execute - feature already implemented');
        chatHandler.systemMessage('Feature already implemented. Running E2E tests...');

        for (const project of session.projects) {
          statusMonitor.updateStatus(project, 'READY', 'No implementation needed');
        }
        return;
      }

      // Find projects that have no tasks assigned but are in the session
      const projectsWithTasks = new Set(tasks.map(t => t.project));
      for (const project of session.projects) {
        if (!projectsWithTasks.has(project)) {
          console.log(`[Orchestrator] ${project} has no tasks - marking as READY`);
          statusMonitor.updateStatus(project, 'READY', 'No implementation needed');
        }
      }

      // Group tasks by project and store globally for taskCompleteRequest handler
      allTasksByProject = new Map<string, Array<{ task: TaskDefinition; taskIndex: number }>>();
      tasks.forEach((task, taskIndex) => {
        const existing = allTasksByProject.get(task.project) || [];
        existing.push({ task, taskIndex });
        allTasksByProject.set(task.project, existing);
      });

      // Create TaskExecutor instance for this execution
      // Check if this is an Orchy Managed workspace and calculate workspace root
      let isOrchyManagedExecution = false;
      let workspaceRootPath: string | null = null;
      if (session.workspaceId) {
        const workspace = workspaceManager.getWorkspace(session.workspaceId);
        if (workspace?.orchyManaged) {
          isOrchyManagedExecution = true;
          const workspaceProjectConfigs = workspaceManager.getWorkspaceProjectConfigs(session.workspaceId);
          const firstProjectConfig = Object.values(workspaceProjectConfigs)[0];
          if (firstProjectConfig) {
            workspaceRootPath = firstProjectConfig.path;
            if (workspaceRootPath.startsWith('~')) {
              workspaceRootPath = workspaceRootPath.replace('~', process.env.HOME || '');
            }
            workspaceRootPath = path.dirname(workspaceRootPath);
          }
        }
      }

      taskExecutor = new TaskExecutor({
        processManager,
        statusMonitor,
        stateMachine,
        logAggregator,
        templateManager,
        planningAgent,
        config,
        getSessionDir: (project: string) => sessionManager.getSessionDir(project),
        getDevServerUrl,
        gitManager,
        getGitBranch: (project: string) => session?.gitBranches?.[project],
        io: ui.io,  // For flow events during task verification
        sessionLogger: sessionLogger || undefined,  // Pass session logger for debugging
        // Orchy Managed workspace support
        isOrchyManaged: () => isOrchyManagedExecution,
        getWorkspaceRoot: () => workspaceRootPath,
        getWorkspaceGitHub: () => session?.workspaceId ? workspaceManager.getWorkspace(session.workspaceId)?.github : undefined,
      });

      // Clear task summaries from any previous session
      taskExecutor.clearTaskSummaries();

      // Set up task complete handler for persistent agent MCP tool
      ui.setTaskCompleteHandler(async (request: TaskCompleteRequest) => {
        console.log(`[Orchestrator] Task complete for ${request.project} task #${request.taskIndex}`);

        const projectTasks = allTasksByProject.get(request.project);
        if (!projectTasks || projectTasks.length === 0) {
          return { status: 'escalate', escalationReason: 'No tasks found for project' };
        }

        if (!taskExecutor) {
          return { status: 'escalate', escalationReason: 'TaskExecutor not initialized' };
        }

        return await taskExecutor.handleTaskCompleteRequest(request, projectTasks);
      });

      // Track failed tasks for user fix continuation
      taskExecutor.on('taskFailed', ({ taskIndex, project }: { taskIndex: number; project: string }) => {
        console.log(`[Orchestrator] Tracking failed task #${taskIndex} for ${project}`);
        failedTaskIndex.set(project, taskIndex);
      });

      // Run tasks using persistent sessions: one persistent agent per project
      // Projects run in parallel, tasks within each project are handled sequentially
      // via the task_complete MCP tool
      const projectPromises = Array.from(allTasksByProject.entries()).map(async ([project, projectTasks]) => {
        console.log(`[Orchestrator] Starting persistent session for ${project} with ${projectTasks.length} task(s)`);

        const result = await taskExecutor!.executePersistentSession(project, projectTasks);

        if (!result.success) {
          console.error(`[Orchestrator] Persistent session for ${project} ended with failures`);
          if (result.failedTasks.length > 0) {
            const failedTask = projectTasks.find(t => t.taskIndex === result.failedTasks[0]);
            chatHandler.systemMessage(
              `Task "${failedTask?.task.name || result.failedTasks[0]}" failed for ${project}. ` +
              `Please provide a fix instruction to continue.`
            );
          }
          return;
        }

        // Status is already set by handleTaskCompleteRequest - just log completion
        console.log(`[Orchestrator] Persistent session completed for ${project}`);
      });

      // Wait for all projects to complete (they run in parallel)
      await Promise.all(projectPromises);

      chatHandler.systemMessage('Agents started. Monitoring progress...');
    });

    // Handle pause request
    socket.on('pause', () => {
      if (stateMachine.getState() === 'RUNNING') {
        stateMachine.transition('pause');
        chatHandler.systemMessage('Pausing... waiting for agents to reach idle state.');
      }
    });

    // Handle resume request
    socket.on('resume', () => {
      if (stateMachine.getState() === 'PAUSED') {
        stateMachine.transition('resume');
      }
    });

    // Handle permission response from UI (for live permission approval via MCP)
    socket.on('permissionResponse', async ({ project, approved, toolName, allowAll }: {
      project: string;
      approved: boolean;
      toolName: string;
      allowAll?: boolean;
    }) => {
      const pendingPermissions = (ui.io as any).pendingPermissions as Map<string, {
        resolve: (result: string) => void;
        project: string;
        toolName: string;
        toolInput: Record<string, unknown>;
      }>;

      // Find pending permission by project (keys are ${project}_${timestamp})
      let key: string | undefined;
      let pending: { resolve: (result: string) => void; project: string; toolName: string; toolInput: Record<string, unknown> } | undefined;

      for (const [k, v] of pendingPermissions?.entries() || []) {
        if (v.project === project) {
          key = k;
          pending = v;
          break;
        }
      }

      if (!pending || !key) {
        console.warn(`[Orchestrator] No pending permission for ${project}`);
        return;
      }

      console.log(`[Orchestrator] Permission ${approved ? 'approved' : 'denied'} for ${project}: ${toolName}${allowAll ? ' (allow all)' : ''}`);

      if (approved) {
        // Add permission to project config for future use (project agents only)
        // Permissions are now saved to workspace configs
        if (project !== 'planner') {
          // Find which workspace contains this project
          const session = sessionManager.getCurrentSession();
          const workspaceId = session?.workspaceId;

          if (workspaceId) {
            const workspaceProjectConfigs = workspaceManager.getWorkspaceProjectConfigs(workspaceId);
            const projectConfig = workspaceProjectConfigs[project];

            if (projectConfig) {
              if (!projectConfig.permissions) {
                projectConfig.permissions = { allow: [] };
              }

              let permission: string;

              // Get the actual command - either from toolInput.command or parsed from toolName
              const toolInput = pending.toolInput || {};
              const inputCommand = typeof toolInput.command === 'string' ? toolInput.command : null;
              const toolMatch = toolName.match(/^(\w+)\((.+)\)$/);
              const toolType = toolMatch ? toolMatch[1] : toolName;
              const toolNameCommand = toolMatch ? toolMatch[2] : '';
              const actualCommand = inputCommand || toolNameCommand;

              if (allowAll && actualCommand) {
                // Create a wildcard pattern for "allow all" commands of this type
                // e.g., command "curl https://example.com" -> "Bash(curl *)"
                const baseCommand = actualCommand.split(/\s+/)[0];
                if (baseCommand) {
                  permission = `${toolType}(${baseCommand} *)`;
                } else {
                  // No base command found, save exact command
                  permission = `${toolType}(${actualCommand})`;
                }
              } else if (actualCommand) {
                // Allow this exact command
                permission = `${toolType}(${actualCommand})`;
              } else {
                // No command found - save the exact toolName as-is (don't wildcard)
                // This prevents dangerous patterns like Bash(*)
                permission = toolName;
                console.warn(`[Orchestrator] No command found in permission request, saving exact toolName: ${toolName}`);
              }

              if (!projectConfig.permissions.allow.includes(permission)) {
                projectConfig.permissions.allow.push(permission);
                // Skip persisting for virtual workspace project (not stored in workspace config)
                if (project !== WORKSPACE_ROOT_PROJECT) {
                  try {
                    workspaceManager.updateWorkspaceProject(workspaceId, project, { permissions: projectConfig.permissions });
                    console.log(`[Orchestrator] Permission saved for ${project}: ${permission}`);
                  } catch (err) {
                    console.error(`[Orchestrator] Failed to save permission:`, err);
                  }
                }
              }
            }
          }
        }

        pending.resolve('allow');
      } else {
        // User denied - agent will stop
        pending.resolve('deny');

        // For project agents, update status to FATAL_DEBUGGING
        if (project !== 'planner') {
          statusMonitor.updateStatus(project, 'FATAL_DEBUGGING', `Permission denied: ${toolName}`);
          (ui.io as any).emitStatus(statusMonitor.getAllStatuses());
        } else {
          // Planner permission denied - emit a chat response
          console.log('[Orchestrator] Planner permission denied');
        }
      }

      pendingPermissions.delete(key);
    });

    // Handle project retry request (FATAL_DEBUGGING or FAILED status)
    socket.on('retryProject', async ({ project }: { project: string }) => {
      const projectStatus = statusMonitor.getStatus(project);
      const status = projectStatus?.status;

      // Only allow retry for FATAL_DEBUGGING or FAILED
      if (status !== 'FATAL_DEBUGGING' && status !== 'FAILED') {
        chatHandler.systemMessage(
          `Cannot retry ${project} - status is ${status}. Retry only for FATAL_DEBUGGING or FAILED.`
        );
        return;
      }

      console.log(`[Orchestrator] User requested retry for ${project}`);
      chatHandler.systemMessage(`Retrying ${project}...`);

      // 1. Kill any lingering worker process
      try {
        await processManager.stopAgent(project);
      } catch (err) {
        console.error(`[Orchestrator] Error stopping agent:`, err);
      }

      // 2. Restart dev server
      try {
        await processManager.restartDevServer(project);
      } catch (err) {
        console.error(`[Orchestrator] Dev server restart failed:`, err);
      }

      // 3. Get the failed task index
      const failedIdx = failedTaskIndex.get(project);
      if (failedIdx === undefined) {
        chatHandler.systemMessage(`No failed task found for ${project}`);
        return;
      }

      const session = sessionManager.getCurrentSession();
      const task = session?.plan?.tasks[failedIdx];
      if (!task) {
        chatHandler.systemMessage(`Task not found for retry`);
        return;
      }

      // 4. Build task list: failed task + remaining tasks
      const allTasks = session?.plan?.tasks || [];
      const tasksToRun = allTasks
        .map((t, idx) => ({ task: t, taskIndex: idx }))
        .filter(({ task: t, taskIndex }) =>
          t.project === project && taskIndex >= failedIdx
        );

      // 5. Re-execute using persistent session
      statusMonitor.updateStatus(project, 'WORKING', `Retrying task: ${task.name}`);

      try {
        console.log(`[Orchestrator] Starting persistent session for retry: ${project} with ${tasksToRun.length} task(s)`);
        const result = await taskExecutor!.executePersistentSession(project, tasksToRun);

        if (!result.success) {
          const failedTask = tasksToRun.find(t => t.taskIndex === result.failedTasks[0]);
          chatHandler.systemMessage(`Retry failed for ${failedTask?.task.name || 'unknown'}. Please provide a fix.`);
          return;
        }

        // All tasks for this project completed, set to READY
        statusMonitor.updateStatus(project, 'READY', 'All tasks completed after retry');
        chatHandler.systemMessage(`Retry successful for ${project}. All tasks completed.`);
      } catch (err) {
        console.error(`[Orchestrator] Retry failed:`, err);
        chatHandler.systemMessage(`Retry failed: ${err}`);
      }
    });

    // Handle session resume request (continue from where interrupted)
    socket.on('resumeSession', async ({ sessionId }: { sessionId: string }) => {
      console.log(`[Orchestrator] Resume session requested: ${sessionId}`);

      try {
        // Load full session data
        const fullData = sessionStore.getFullSessionData(sessionId);
        if (!fullData) {
          socket.emit('resumeError', { error: 'Session not found' });
          return;
        }

        if (!fullData.session.plan) {
          socket.emit('resumeError', { error: 'Session has no plan - cannot resume' });
          return;
        }

        // Check if session is resumable
        const completionReason = sessionStore.getCompletionReason(fullData.session);
        const isResumable = fullData.session.status === 'interrupted' ||
          completionReason === 'task_errors' ||
          completionReason === 'test_errors';

        if (!isResumable) {
          socket.emit('resumeError', { error: 'Session cannot be resumed - already completed successfully' });
          return;
        }

        // If there's an active session, interrupt it first
        const currentSession = sessionManager.getCurrentSession();
        if (currentSession && currentSession.id !== sessionId) {
          console.log(`[Orchestrator] Interrupting current session ${currentSession.id} to resume ${sessionId}`);
          sessionManager.markSessionInterrupted();
          processManager.stopAll();
        }

        // Load workspace configs if session has workspaceId
        let workspaceProjectConfigs: Record<string, ProjectConfig> = {};
        let isOrchyManagedResume = false;
        let workspaceRootPathResume: string | null = null;
        if (fullData.session.workspaceId) {
          const workspace = workspaceManager.getWorkspace(fullData.session.workspaceId);
          if (workspace) {
            workspaceProjectConfigs = workspaceManager.getWorkspaceProjectConfigs(fullData.session.workspaceId);
            // Merge workspace configs into config.projects
            Object.assign(config.projects, workspaceProjectConfigs);
            planningAgent.setProjectConfig(config.projects);
            planningAgent.setWorkspaceGitHub(workspace?.github);
            // Set deployment availability based on workspace config
            const deploymentCheck = deploymentManager.isDeploymentEnabled(fullData.session.workspaceId);
            planningAgent.setDeploymentEnabled(deploymentCheck.enabled);
            // Check if Orchy Managed and get workspace root
            isOrchyManagedResume = workspace.orchyManaged === true;
            if (isOrchyManagedResume) {
              const firstProjectConfig = Object.values(workspaceProjectConfigs)[0];
              if (firstProjectConfig) {
                workspaceRootPathResume = firstProjectConfig.path;
                if (workspaceRootPathResume.startsWith('~')) {
                  workspaceRootPathResume = workspaceRootPathResume.replace('~', process.env.HOME || '');
                }
                workspaceRootPathResume = path.dirname(workspaceRootPathResume);
              }
            }
          }
        }

        // Get tasks to run (skip completed)
        const taskStates = fullData.session.taskStates || [];
        const completedIndices = new Set(
          taskStates.filter(t => t.status === 'completed').map(t => t.taskIndex)
        );

        const tasksToRun = fullData.session.plan.tasks
          .map((task, idx) => ({ task, taskIndex: idx }))
          .filter(({ taskIndex }) => !completedIndices.has(taskIndex));

        if (tasksToRun.length === 0) {
          // No tasks to run, but maybe E2E tests need to run
          console.log(`[Orchestrator] All tasks completed - checking for E2E tests`);
        }

        // Update session status to running
        sessionStore.updateSessionStatus(sessionId, 'running');

        // Load the session into session manager
        sessionManager.loadSession(sessionId);

        // Set current session ID on StatusMonitor and LogAggregator
        statusMonitor.setCurrentSessionId(sessionId);
        logAggregator.setCurrentSessionId(sessionId);

        // Clear in-memory logs before starting fresh execution
        logAggregator.clearAll();

        // Restore statuses from persisted session
        statusMonitor.restoreStatuses(fullData.session.statuses);

        // Restore task states (important: preserve completed task statuses)
        statusMonitor.restoreTaskStates(fullData.session.taskStates || []);

        // Initialize log aggregator for each project (starts fresh, no old logs)
        for (const project of fullData.session.projects) {
          const sessionDir = sessionManager.getSessionDir(project);
          if (sessionDir) {
            logAggregator.registerProject(project, sessionDir);
          }
        }

        // Create session logger
        sessionLogger = new SessionLogger(sessionId);
        sessionLogger.log('SESSION_RESUME', { sessionId, tasksToRun: tasksToRun.length });

        // Emit sessionLoaded to restore UI state
        // - Include chat messages to restore conversation history
        // - Filter out active/in_progress flows (stale from interrupted session)
        // - Keep completed flows for history
        // - Clear logs since we're starting fresh execution
        const completedFlows = (fullData.flows || []).filter(
          f => f.status !== 'in_progress'
        );
        socket.emit('sessionLoaded', {
          ...fullData,
          logs: [],              // Clear logs - fresh execution
          flows: completedFlows, // Keep completed flows, clear active ones
          isActive: true,
        });

        // Emit session and statuses to all clients
        const restoredSession = sessionManager.getCurrentSession();
        if (restoredSession) {
          (ui.io as any).emitSession(restoredSession);
          (ui.io as any).emitStatus(statusMonitor.getAllStatuses());
          (ui.io as any).emitTaskStates(statusMonitor.getAllTaskStates());
        }

        chatHandler.systemMessage(`Resuming session ${sessionId}...`);

        // Start dev servers for all projects
        for (const project of fullData.session.projects) {
          try {
            console.log(`[Orchestrator] Starting dev server for ${project}...`);
            await processManager.startDevServer(project);
          } catch (err) {
            console.error(`[Orchestrator] Failed to start dev server for ${project}:`, err);
            statusMonitor.updateStatus(project, 'FATAL_DEBUGGING', `Dev server failed: ${err}`);
          }
        }

        // If there are tasks to run, start execution
        if (tasksToRun.length > 0) {
          // Start the state machine
          stateMachine.transition('start');

          // Group tasks by project
          allTasksByProject = new Map<string, Array<{ task: TaskDefinition; taskIndex: number }>>();
          tasksToRun.forEach(({ task, taskIndex }) => {
            const existing = allTasksByProject.get(task.project) || [];
            existing.push({ task, taskIndex });
            allTasksByProject.set(task.project, existing);
          });

          // Create TaskExecutor instance
          taskExecutor = new TaskExecutor({
            processManager,
            statusMonitor,
            stateMachine,
            logAggregator,
            templateManager,
            planningAgent,
            config,
            getSessionDir: (project: string) => sessionManager.getSessionDir(project),
            getDevServerUrl,
            gitManager,
            getGitBranch: (project: string) => restoredSession?.gitBranches?.[project],
            io: ui.io,
            sessionLogger: sessionLogger || undefined,
            // Orchy Managed workspace support
            isOrchyManaged: () => isOrchyManagedResume,
            getWorkspaceRoot: () => workspaceRootPathResume,
            getWorkspaceGitHub: () => restoredSession?.workspaceId ? workspaceManager.getWorkspace(restoredSession.workspaceId)?.github : undefined,
          });

          taskExecutor.clearTaskSummaries();

          // Set up task complete handler
          ui.setTaskCompleteHandler(async (request: TaskCompleteRequest) => {
            console.log(`[Orchestrator] Task complete for ${request.project} task #${request.taskIndex}`);

            const projectTasks = allTasksByProject.get(request.project);
            if (!projectTasks || projectTasks.length === 0) {
              return { status: 'escalate', escalationReason: 'No tasks found for project' };
            }

            if (!taskExecutor) {
              return { status: 'escalate', escalationReason: 'TaskExecutor not initialized' };
            }

            return await taskExecutor.handleTaskCompleteRequest(request, projectTasks);
          });

          // Track failed tasks
          taskExecutor.on('taskFailed', ({ taskIndex, project }: { taskIndex: number; project: string }) => {
            console.log(`[Orchestrator] Tracking failed task #${taskIndex} for ${project}`);
            failedTaskIndex.set(project, taskIndex);
          });

          chatHandler.systemMessage(`Resuming execution with ${tasksToRun.length} remaining task(s)...`);

          // Run tasks using persistent sessions
          const projectPromises = Array.from(allTasksByProject.entries()).map(async ([project, projectTasks]) => {
            console.log(`[Orchestrator] Starting persistent session for ${project} with ${projectTasks.length} task(s)`);

            const result = await taskExecutor!.executePersistentSession(project, projectTasks);

            if (!result.success) {
              console.error(`[Orchestrator] Persistent session for ${project} ended with failures`);
              if (result.failedTasks.length > 0) {
                const failedTask = projectTasks.find(t => t.taskIndex === result.failedTasks[0]);
                chatHandler.systemMessage(
                  `Task "${failedTask?.task.name || result.failedTasks[0]}" failed for ${project}. ` +
                  `Please provide a fix instruction to continue.`
                );
              }
              return;
            }

            console.log(`[Orchestrator] Persistent session completed for ${project}`);
          });

          await Promise.all(projectPromises);
          chatHandler.systemMessage('Resumed execution. Monitoring progress...');
        } else {
          // All tasks completed, projects should go to E2E or IDLE
          chatHandler.systemMessage('All tasks already completed. Checking project status...');
          for (const project of fullData.session.projects) {
            const status = statusMonitor.getStatus(project);
            if (status?.status !== 'IDLE') {
              statusMonitor.updateStatus(project, 'READY', 'Resuming - all tasks completed');
            }
          }
        }

      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[Orchestrator] Failed to resume session:', error);
        socket.emit('resumeError', { error });
      }
    });

    // Handle git push branch request
    socket.on('pushBranch', async ({ project, branchName }: { project: string; branchName: string }) => {
      console.log(`[Orchestrator] Push branch '${branchName}' requested for ${project}`);
      const projectConfig = getProjectConfigForSession(project);

      if (!projectConfig) {
        socket.emit('pushBranchError', { project, error: 'Project not found' });
        return;
      }

      // Git operations only available for orchyManaged workspaces
      const session = sessionManager.getCurrentSession();
      const workspace = session?.workspaceId ? workspaceManager.getWorkspace(session.workspaceId) : undefined;
      if (!workspace?.orchyManaged) {
        socket.emit('pushBranchError', { project, error: 'Git features are only available for Orchy Managed workspaces' });
        return;
      }

      try {
        // Expand path
        let projectPath = projectConfig.path;
        if (projectPath.startsWith('~')) {
          projectPath = projectPath.replace('~', process.env.HOME || '');
        }

        const result = await gitManager.pushBranch(projectPath, branchName);
        if (result.success) {
          socket.emit('pushBranchSuccess', { project, message: result.message });
        } else {
          socket.emit('pushBranchError', { project, error: result.message });
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[Orchestrator] Push failed for ${project}:`, error);
        socket.emit('pushBranchError', { project, error });
      }
    });

    // Handle git merge branch request
    socket.on('mergeBranch', async ({ project, branchName }: { project: string; branchName: string }) => {
      console.log(`[Orchestrator] Merge branch '${branchName}' requested for ${project}`);
      const projectConfig = getProjectConfigForSession(project);

      if (!projectConfig) {
        socket.emit('mergeBranchError', { project, error: 'Project not found' });
        return;
      }

      // Git operations only available for orchyManaged workspaces
      const session = sessionManager.getCurrentSession();
      const workspace = session?.workspaceId ? workspaceManager.getWorkspace(session.workspaceId) : undefined;
      if (!workspace?.orchyManaged) {
        socket.emit('mergeBranchError', { project, error: 'Git features are only available for Orchy Managed workspaces' });
        return;
      }

      try {
        // Expand path
        let projectPath = projectConfig.path;
        if (projectPath.startsWith('~')) {
          projectPath = projectPath.replace('~', process.env.HOME || '');
        }

        const targetBranch = projectConfig.mainBranch || 'main';
        const result = await gitManager.mergeBranch(projectPath, branchName, targetBranch);
        if (result.success) {
          socket.emit('mergeBranchSuccess', { project, message: result.message });
        } else {
          socket.emit('mergeBranchError', { project, error: result.message });
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[Orchestrator] Merge failed for ${project}:`, error);
        socket.emit('mergeBranchError', { project, error });
      }
    });

    // Check branch status for projects before starting a session
    // Note: This is now only called for orchyManaged workspaces from the frontend
    socket.on('checkBranchStatus', async ({ projects }: { projects: string[] }) => {
      console.log(`[Orchestrator] Checking branch status for: ${projects.join(', ')}`);

      const results: Array<{
        project: string;
        hasGitRepo: boolean;
        currentBranch: string | null;
        mainBranch: string;
        isOnMainBranch: boolean;
        hasUncommittedChanges: boolean;
        uncommittedDetails?: { staged: number; unstaged: number; untracked: number };
      }> = [];

      for (const projectName of projects) {
        const projectConfig = getProjectConfigForSession(projectName);
        if (!projectConfig) continue;

        try {
          let projectPath = projectConfig.path;
          if (projectPath.startsWith('~')) {
            projectPath = projectPath.replace('~', process.env.HOME || '');
          }

          // Check if this path has a git repo
          const hasGitRepo = await gitManager.isGitRepo(projectPath);
          if (!hasGitRepo) {
            results.push({
              project: projectName,
              hasGitRepo: false,
              currentBranch: null,
              mainBranch: 'main',
              isOnMainBranch: true,
              hasUncommittedChanges: false,
            });
            continue;
          }

          const currentBranch = await gitManager.getCurrentBranch(projectPath);
          const mainBranch = projectConfig.mainBranch || 'main';
          const isOnMainBranch = currentBranch === mainBranch;

          // Check for uncommitted changes
          const uncommittedStatus = await gitManager.hasUncommittedChanges(projectPath);

          results.push({
            project: projectName,
            hasGitRepo: true,
            currentBranch,
            mainBranch,
            isOnMainBranch,
            hasUncommittedChanges: uncommittedStatus.hasChanges,
            uncommittedDetails: uncommittedStatus.hasChanges ? {
              staged: uncommittedStatus.staged,
              unstaged: uncommittedStatus.unstaged,
              untracked: uncommittedStatus.untracked,
            } : undefined,
          });
        } catch (err) {
          console.error(`[Orchestrator] Error checking branch for ${projectName}:`, err);
          results.push({
            project: projectName,
            hasGitRepo: false,
            currentBranch: null,
            mainBranch: projectConfig.mainBranch || 'main',
            isOnMainBranch: false,
            hasUncommittedChanges: false,
          });
        }
      }

      socket.emit('branchStatus', { results });
    });

    // Checkout main branch for projects
    // If stashFirst is true, stash uncommitted changes before checkout
    // Note: This is only called for orchyManaged workspaces from the frontend
    socket.on('checkoutMainBranch', async ({ projects, stashFirst }: { projects: string[]; stashFirst?: boolean }) => {
      console.log(`[Orchestrator] Checking out main branch for: ${projects.join(', ')}${stashFirst ? ' (stashing first)' : ''}`);

      const results: Array<{ project: string; success: boolean; error?: string; stashed?: boolean }> = [];

      for (const projectName of projects) {
        const projectConfig = getProjectConfigForSession(projectName);
        if (!projectConfig) continue;

        try {
          let projectPath = projectConfig.path;
          if (projectPath.startsWith('~')) {
            projectPath = projectPath.replace('~', process.env.HOME || '');
          }

          let stashed = false;

          // If stashFirst is requested, stash uncommitted changes
          if (stashFirst) {
            const uncommittedStatus = await gitManager.hasUncommittedChanges(projectPath);
            if (uncommittedStatus.hasChanges) {
              const stashResult = await gitManager.stashChanges(projectPath, `Auto-stash before switching to main`);
              if (!stashResult.success) {
                results.push({
                  project: projectName,
                  success: false,
                  error: `Failed to stash changes: ${stashResult.message}`,
                });
                continue;
              }
              stashed = true;
            }
          }

          const mainBranch = projectConfig.mainBranch || 'main';
          const result = await gitManager.createAndCheckoutBranch(projectPath, mainBranch);

          results.push({
            project: projectName,
            success: result.success,
            error: result.success ? undefined : result.message,
            stashed,
          });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          results.push({ project: projectName, success: false, error });
        }
      }

      socket.emit('checkoutMainBranchResult', { results });
    });

    // Handle GitHub info request (check if project is a GitHub project)
    // Only for orchyManaged workspaces
    socket.on('getGitHubInfo', async ({ project }: { project: string }) => {
      console.log(`[Orchestrator] GitHub info requested for ${project}`);
      const projectConfig = getProjectConfigForSession(project);

      if (!projectConfig) {
        socket.emit('gitHubInfo', { project, isGitHub: false });
        return;
      }

      // Git features only for orchyManaged workspaces
      const session = sessionManager.getCurrentSession();
      const workspace = session?.workspaceId ? workspaceManager.getWorkspace(session.workspaceId) : undefined;
      if (!workspace?.orchyManaged) {
        socket.emit('gitHubInfo', { project, isGitHub: false });
        return;
      }

      try {
        let projectPath = projectConfig.path;
        if (projectPath.startsWith('~')) {
          projectPath = projectPath.replace('~', process.env.HOME || '');
        }

        const result = await gitManager.isGitHubProject(projectPath);
        socket.emit('gitHubInfo', { project, ...result });
      } catch (err) {
        console.error(`[Orchestrator] Failed to get GitHub info for ${project}:`, err);
        socket.emit('gitHubInfo', { project, isGitHub: false });
      }
    });

    // Handle get branches request (for PR base branch selection)
    // Only for orchyManaged workspaces
    socket.on('getBranches', async ({ project }: { project: string }) => {
      console.log(`[Orchestrator] Branches requested for ${project}`);
      const projectConfig = getProjectConfigForSession(project);

      if (!projectConfig) {
        socket.emit('branches', { project, branches: [] });
        return;
      }

      // Git features only for orchyManaged workspaces
      const session = sessionManager.getCurrentSession();
      const workspace = session?.workspaceId ? workspaceManager.getWorkspace(session.workspaceId) : undefined;
      if (!workspace?.orchyManaged) {
        socket.emit('branches', { project, branches: [] });
        return;
      }

      try {
        let projectPath = projectConfig.path;
        if (projectPath.startsWith('~')) {
          projectPath = projectPath.replace('~', process.env.HOME || '');
        }

        const branches = await gitManager.getRemoteBranches(projectPath);
        socket.emit('branches', { project, branches });
      } catch (err) {
        console.error(`[Orchestrator] Failed to get branches for ${project}:`, err);
        socket.emit('branches', { project, branches: [] });
      }
    });

    // Handle create PR request
    // Only for orchyManaged workspaces
    socket.on('createPR', async ({
      project,
      branchName,
      baseBranch,
      title,
      body
    }: {
      project: string;
      branchName: string;
      baseBranch?: string;
      title?: string;
      body?: string;
    }) => {
      console.log(`[Orchestrator] Create PR requested for ${project}, branch '${branchName}'`);
      const projectConfig = getProjectConfigForSession(project);

      if (!projectConfig) {
        socket.emit('createPRError', { project, error: 'Project not found' });
        return;
      }

      // Git features only for orchyManaged workspaces
      const session = sessionManager.getCurrentSession();
      const workspace = session?.workspaceId ? workspaceManager.getWorkspace(session.workspaceId) : undefined;
      if (!workspace?.orchyManaged) {
        socket.emit('createPRError', { project, error: 'Git features are only available for Orchy Managed workspaces' });
        return;
      }

      try {
        let projectPath = projectConfig.path;
        if (projectPath.startsWith('~')) {
          projectPath = projectPath.replace('~', process.env.HOME || '');
        }

        // Check if it's a GitHub project
        const ghInfo = await gitManager.isGitHubProject(projectPath);
        if (!ghInfo.isGitHub) {
          socket.emit('createPRError', { project, error: 'Project is not hosted on GitHub' });
          return;
        }

        // Get session info for PR description
        const session = sessionManager.getCurrentSession();
        const targetBranch = baseBranch || projectConfig.mainBranch || 'main';

        // Validate: Check if head branch exists on remote (was pushed)
        const headBranchExists = await gitManager.remoteBranchExists(projectPath, branchName);
        if (!headBranchExists) {
          socket.emit('createPRError', {
            project,
            error: `Branch '${branchName}' hasn't been pushed to remote. Push the branch first.`
          });
          return;
        }

        // Validate: Check if base branch exists on remote
        const baseBranchExists = await gitManager.remoteBranchExists(projectPath, targetBranch);
        if (!baseBranchExists) {
          socket.emit('createPRError', {
            project,
            error: `Target branch '${targetBranch}' doesn't exist on remote.`
          });
          return;
        }

        // Validate: Check if there are commits to merge
        const commitCount = await gitManager.getCommitCount(projectPath, `origin/${targetBranch}`, branchName);
        if (commitCount === 0) {
          socket.emit('createPRError', {
            project,
            error: `No commits between '${targetBranch}' and '${branchName}'. Make sure you have changes to merge.`
          });
          return;
        }

        // Generate PR title and body using Claude AI (or fallback if not provided)
        let prTitle = title;
        let prBody = body;

        if (!prTitle || !prBody) {
          // Gather data for PR generation
          const taskSummaries = taskExecutor?.getTaskSummaries(project) || [];
          const commits = await gitManager.getCommitLog(projectPath, targetBranch, branchName);

          console.log(`[Orchestrator] Generating PR content with Claude for ${project}...`);

          const generated = await gitManager.generatePRContent(projectPath, {
            featureDescription: session?.feature || 'Feature update',
            taskSummaries,
            commits,
            baseBranch: targetBranch,
            headBranch: branchName,
          });

          prTitle = prTitle || generated.title;
          prBody = prBody || generated.body;
        }

        const result = await gitManager.createPullRequest(projectPath, {
          title: prTitle,
          body: prBody,
          baseBranch: targetBranch,
          headBranch: branchName,
        });

        if (result.success) {
          socket.emit('createPRSuccess', { project, message: result.message, prUrl: result.prUrl });
          chatHandler.systemMessage(`Pull request created: ${result.prUrl}`);
        } else {
          socket.emit('createPRError', { project, error: result.message });
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[Orchestrator] Create PR failed for ${project}:`, error);
        socket.emit('createPRError', { project, error });
      }
    });

    // Handle approve changes request (managed git - merges all branches)
    socket.on('approveChanges', async ({ sessionId }: { sessionId: string }) => {
      console.log(`[Orchestrator] Approve changes requested for session ${sessionId}`);
      try {
        const result = await executeMergeSession(sessionId);
        if (result.success) {
          socket.emit('approveChangesSuccess', { sessionId, results: result.results });
        } else {
          socket.emit('approveChangesError', { sessionId, error: 'Some merge operations failed', results: result.results });
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[Orchestrator] Approve changes failed:`, error);
        socket.emit('approveChangesError', { sessionId, error });
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // Template Management Socket Events
    // Projects are now stored in workspaces, not in a global projects.json
    // ═══════════════════════════════════════════════════════════════

    // Get list of all configured projects - returns empty (projects are in workspaces now)
    socket.on('getProjects', () => {
      socket.emit('projects', {});
    });

    // Detect project type and get configuration suggestions
    socket.on('detectProjectType', ({ path: projectPath }: { path: string }) => {
      try {
        const suggestions = templateManager.detectProjectType(projectPath);
        socket.emit('projectTypeSuggestions', { path: projectPath, suggestions });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        socket.emit('detectProjectTypeError', { path: projectPath, error });
      }
    });

    // Get available templates
    socket.on('getTemplates', () => {
      const templates = templateManager.getTemplates();
      socket.emit('templates', templates);
    });

    // Create project from template (returns config, doesn't save to projects.json)
    socket.on('createFromTemplate', async (options: CreateFromTemplateOptions) => {
      try {
        await templateManager.createFromTemplate(options);
        socket.emit('createFromTemplateSuccess', { name: options.name, template: options.template });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        socket.emit('createFromTemplateError', { name: options.name, error });
      }
    });

    // Create project from template and add to existing workspace
    socket.on('createProjectFromTemplateForWorkspace', async ({
      workspaceId,
      name,
      targetPath,
      template,
      permissions,
    }: {
      workspaceId: string;
      name: string;
      targetPath: string;
      template: string;
      permissions?: { dangerouslyAllowAll?: boolean; allow: string[] };
    }) => {
      console.log(`[Orchestrator] createProjectFromTemplateForWorkspace received:`, { workspaceId, name, targetPath, template });
      try {
        // Check if workspace is Orchy Managed
        const workspace = workspaceManager.getWorkspace(workspaceId);
        const isOrchyManaged = workspace?.orchyManaged === true;

        // Create the project from template
        const projectConfig = await templateManager.createFromTemplate({
          name,
          targetPath,
          template: template as any,
          permissions: permissions || {
            allow: TEMPLATE_PERMISSIONS[template] || [],
          },
          skipGitInit: isOrchyManaged,  // Skip per-project git for Orchy Managed workspaces
        });

        // Add to workspace (this bypasses the orchyManaged check since it's template-based)
        const workspaceProject: WorkspaceProjectConfig = {
          name,
          ...projectConfig,
        };

        // Directly add to workspace projects (bypassing the socket handler check)
        const existingWorkspace = workspaceManager.getWorkspace(workspaceId);
        if (existingWorkspace?.projects.some(p => p.name === name)) {
          throw new Error(`Project "${name}" already exists in workspace`);
        }
        existingWorkspace?.projects.push(workspaceProject);
        if (existingWorkspace) {
          existingWorkspace.updatedAt = Date.now();
          workspaceManager.updateWorkspace(workspaceId, { projects: existingWorkspace.projects });
        }

        // For Orchy Managed workspaces, commit the new project to main at workspace root
        if (isOrchyManaged && workspace) {
          try {
            // Find workspace root path (parent of any project)
            const firstProject = workspace.projects[0];
            if (firstProject) {
              let workspaceRootPath = firstProject.path;
              if (workspaceRootPath.startsWith('~')) {
                workspaceRootPath = workspaceRootPath.replace('~', process.env.HOME || '');
              }
              // Go up one directory level from project path to get workspace root
              workspaceRootPath = path.dirname(workspaceRootPath);

              // Commit the new project
              const commitResult = await gitManager.commit(
                workspaceRootPath,
                `Add ${name} from ${template} template`
              );
              if (commitResult.success) {
                console.log(`[Orchestrator] Auto-committed new project ${name} to workspace git`);
              } else {
                console.warn(`[Orchestrator] Failed to auto-commit new project: ${commitResult.message}`);
              }
            }
          } catch (gitErr) {
            console.error(`[Orchestrator] Git commit error for new project:`, gitErr);
            // Don't fail - the project was still created successfully
          }
        }

        // Emit success
        socket.emit('workspaces', workspaceManager.getWorkspaces());
        socket.emit('createFromTemplateSuccess', { name, template });
        console.log(`[Orchestrator] Created project ${name} from template ${template} and added to workspace ${workspaceId}`);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[Orchestrator] Failed to create project from template:`, error);
        socket.emit('createFromTemplateError', { name, error });
      }
    });

    // Quick start with session: create projects, workspace, and start session in one go
    socket.on('quickStartSession', async ({ appName, feature, templateNames, designName }: { appName: string; feature: string; templateNames: string[]; designName?: string }) => {
      const targetPath = `~/orchy/${appName}`;
      const expandedTargetPath = targetPath.replace('~', process.env.HOME || '');
      const createdProjectConfigs: WorkspaceProjectConfig[] = [];
      let createdParentDir = false;
      let createdWorkspaceId: string | null = null;

      // Cleanup function to revert on failure
      const cleanup = () => {
        console.log('[Orchestrator] Quick start failed, cleaning up...');

        // Remove created workspace
        if (createdWorkspaceId) {
          try {
            workspaceManager.deleteWorkspace(createdWorkspaceId);
            console.log(`[Orchestrator] Cleanup: removed workspace ${createdWorkspaceId}`);
          } catch (e) {
            // Ignore cleanup errors
          }
        }

        // Remove the parent directory if we created it
        if (createdParentDir && fs.existsSync(expandedTargetPath)) {
          try {
            fs.rmSync(expandedTargetPath, { recursive: true, force: true });
            console.log(`[Orchestrator] Cleanup: removed directory ${expandedTargetPath}`);
          } catch (e) {
            // Ignore cleanup errors
          }
        }

        // Emit updated workspaces after cleanup
        socket.emit('workspaces', workspaceManager.getWorkspaces());
      };

      try {
        // Create parent directory if it doesn't exist
        if (!fs.existsSync(expandedTargetPath)) {
          fs.mkdirSync(expandedTargetPath, { recursive: true });
          createdParentDir = true;
        }

        // Create projects from selected templates
        for (const templateName of templateNames) {
          // Determine project suffix from template name
          const suffix = templateName.includes('frontend') ? 'frontend' :
                        templateName.includes('backend') ? 'backend' :
                        templateName.replace(/^(react|vite|vue|express|nestjs)-?/, '');
          const projectName = suffix;

          // Check if this project depends on others (frontend depends on backend for E2E)
          const dependsOn = templateName.includes('frontend') && createdProjectConfigs.some(p => p.name.includes('backend'))
            ? [createdProjectConfigs.find(p => p.name.includes('backend'))!.name]
            : undefined;

          // Create project in workspace root with suffix as directory name (e.g., ~/orchy/blog2/frontend)
          // Use directoryName to avoid nesting: ~/orchy/blog2/frontend instead of ~/orchy/blog2/frontend/blog2-frontend
          const projectConfig = await templateManager.createFromTemplate({
            name: projectName,
            targetPath: targetPath,  // Workspace root (e.g., ~/orchy/blog2)
            directoryName: suffix,   // Directory name (e.g., 'frontend')
            template: templateName as any,
            dependsOn,
            permissions: {
              allow: TEMPLATE_PERMISSIONS[templateName] || [],
            },
            skipGitInit: true,  // Orchy Managed: git is handled at workspace root level
          });

          createdProjectConfigs.push({
            name: projectName,
            ...projectConfig,
          });

          // Attach design to frontend project if specified
          if (designName && templateName.includes('frontend')) {
            try {
              const designUpdate = await templateManager.attachDesignToProject(
                projectConfig.path,
                projectName,
                designName
              );
              // Update the project config with attachedDesign
              const projectIdx = createdProjectConfigs.findIndex(p => p.name === projectName);
              if (projectIdx >= 0) {
                createdProjectConfigs[projectIdx] = {
                  ...createdProjectConfigs[projectIdx],
                  ...designUpdate,
                };
              }
              console.log(`[Orchestrator] Attached design '${designName}' to ${projectName}`);
            } catch (designErr) {
              console.error(`[Orchestrator] Failed to attach design to ${projectName}:`, designErr);
            }
          }
        }

        // Create workspace with the newly created projects (Orchy Managed monorepo)
        const workspace = workspaceManager.createWorkspace({
          name: appName,
          projects: createdProjectConfigs,
          orchyManaged: true,  // This is a template-created monorepo workspace
        });
        createdWorkspaceId = workspace.id;

        // Initialize git at workspace root (Orchy Managed monorepo structure)
        try {
          console.log(`[Orchestrator] Initializing git at workspace root: ${expandedTargetPath}`);
          const initResult = await gitManager.initRepo(expandedTargetPath, 'main');
          if (initResult.success) {
            // Create initial commit with all project files
            const projectNames = createdProjectConfigs.map(p => p.name).join(', ');
            const commitResult = await gitManager.commit(expandedTargetPath, `Initial commit: ${appName} workspace (${projectNames})`);
            if (commitResult.success) {
              console.log(`[Orchestrator] Git initialized at workspace root with initial commit`);
            } else {
              console.warn(`[Orchestrator] Git init succeeded but initial commit failed: ${commitResult.message}`);
            }
          } else {
            console.warn(`[Orchestrator] Failed to initialize git at workspace root: ${initResult.message}`);
          }
        } catch (gitErr) {
          console.error(`[Orchestrator] Git initialization error at workspace root:`, gitErr);
        }

        // Emit updated workspaces
        socket.emit('workspaces', workspaceManager.getWorkspaces());

        // Now start the session with this workspace
        // Include workspace root project for orchyManaged workspaces
        const createdProjectNames = createdProjectConfigs.map(p => p.name);
        const sessionProjects = workspace.orchyManaged
          ? [...createdProjectNames, WORKSPACE_ROOT_PROJECT]
          : createdProjectNames;
        const session = sessionManager.createSession(feature, sessionProjects, workspace.id);

        // Initialize git branch at workspace root (Orchy Managed monorepo)
        const gitBranches: Record<string, string> = {};
        // Always create git branch for orchyManaged workspaces
        if (workspace.orchyManaged) {
          try {
            // Generate branch name with AI
            let actualBranchName: string;
            try {
              console.log('[Orchestrator] Quick start: generating branch name with AI...');
              actualBranchName = await generateBranchName(feature);
              console.log(`[Orchestrator] Generated branch name: ${actualBranchName}`);
            } catch (err) {
              console.warn('[Orchestrator] Failed to generate branch name with AI, using fallback:', err);
              actualBranchName = gitManager.generateBranchName(feature);
            }

            // Checkout main and pull latest at workspace root
            const checkoutResult = await gitManager.createAndCheckoutBranch(expandedTargetPath, 'main');
            if (!checkoutResult.success) {
              console.warn(`[Orchestrator] Failed to checkout main at workspace root: ${checkoutResult.message}`);
            }

            // Pull latest (ignore errors for repos without remote)
            try {
              const pullResult = await gitManager.pullBranch(expandedTargetPath, 'main');
              if (pullResult.success) {
                console.log(`[Orchestrator] Pulled latest main at workspace root`);
              }
            } catch (pullErr) {
              console.log(`[Orchestrator] Pull skipped for workspace (no remote or error): ${pullErr}`);
            }

            // Create feature branch at workspace root
            const branchResult = await gitManager.createAndCheckoutBranch(expandedTargetPath, actualBranchName);
            if (branchResult.success) {
              // Use _workspace key for Orchy Managed workspace-level branch
              gitBranches['_workspace'] = actualBranchName;
              console.log(`[Orchestrator] Git branch '${actualBranchName}' ${branchResult.created ? 'created' : 'checked out'} at workspace root`);
            } else {
              console.error(`[Orchestrator] Failed to create feature branch '${actualBranchName}': ${branchResult.message}`);
              chatHandler.systemMessage(`Git warning: Could not create feature branch '${actualBranchName}'. ${branchResult.message}. Changes may not be tracked properly.`);
            }
          } catch (gitErr) {
            console.error(`[Orchestrator] Failed to initialize git branch at workspace root:`, gitErr);
            chatHandler.systemMessage(`Git error: ${gitErr}. Session will continue but git features may not work.`);
          }
        }

        // Store git branches in session
        if (Object.keys(gitBranches).length > 0) {
          session.gitBranches = gitBranches;
          sessionStore.updateGitBranches(session.id, gitBranches);
        }

        // Set current session ID on StatusMonitor and LogAggregator for persistence
        statusMonitor.setCurrentSessionId(session.id);
        logAggregator.setCurrentSessionId(session.id);

        // Create session logger for debugging
        sessionLogger = new SessionLogger(session.id);
        sessionLogger.log('SESSION_CREATE', { feature, projects: createdProjectNames });

        // Initialize status for each project
        for (const project of createdProjectNames) {
          statusMonitor.initializeProject(project);
          const sessionDir = sessionManager.getSessionDir(project);
          if (sessionDir) {
            logAggregator.registerProject(project, sessionDir);
          }
        }

        (ui.io as any).emitSessionCreated(session);
        chatHandler.systemMessage(`Session created: ${session.id}`);
        sessionLogger.chat('system', `Session created: ${session.id}`);

        // Get project paths for Planning Agent to explore
        const projectPaths: Record<string, string> = {};
        for (const projectConf of createdProjectConfigs) {
          projectPaths[projectConf.name] = projectConf.path;
        }

        // Request plan from Planning Agent with project paths
        sessionLogger.chat('user', `Create a plan for: ${feature}`);
        chatHandler.requestPlan(feature, createdProjectNames, projectPaths);

        console.log(`[Orchestrator] Quick start session created: ${session.id} with workspace ${workspace.id}`);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[Orchestrator] Quick start session failed:', error);
        cleanup();
        socket.emit('quickStartError', { error });
      }
    });

    // Create workspace from templates (without starting a session)
    socket.on('createWorkspaceFromTemplate', async ({ appName, templateNames, context, designName, github }: {
      appName: string;
      templateNames: string[];
      context?: string;
      designName?: string;
      github?: {
        enabled: boolean;
        visibility?: 'public' | 'private';
        ownerType?: 'user' | 'org';
        owner?: string;
      };
    }) => {
      const targetPath = `~/orchy/${appName}`;
      const expandedTargetPath = targetPath.replace('~', process.env.HOME || '');
      const createdProjectConfigs: WorkspaceProjectConfig[] = [];
      let createdParentDir = false;
      let createdWorkspaceId: string | null = null;

      // Cleanup function to revert on failure
      const cleanup = () => {
        console.log('[Orchestrator] Create workspace from template failed, cleaning up...');

        // Remove created workspace
        if (createdWorkspaceId) {
          try {
            workspaceManager.deleteWorkspace(createdWorkspaceId);
            console.log(`[Orchestrator] Cleanup: removed workspace ${createdWorkspaceId}`);
          } catch (e) {
            // Ignore cleanup errors
          }
        }

        // Remove the parent directory if we created it
        if (createdParentDir && fs.existsSync(expandedTargetPath)) {
          try {
            fs.rmSync(expandedTargetPath, { recursive: true, force: true });
            console.log(`[Orchestrator] Cleanup: removed directory ${expandedTargetPath}`);
          } catch (e) {
            // Ignore cleanup errors
          }
        }

        // Emit updated workspaces after cleanup
        socket.emit('workspaces', workspaceManager.getWorkspaces());
      };

      try {
        // Create parent directory if it doesn't exist
        if (!fs.existsSync(expandedTargetPath)) {
          fs.mkdirSync(expandedTargetPath, { recursive: true });
          createdParentDir = true;
        }

        // Create projects from selected templates
        for (const templateName of templateNames) {
          // Determine project suffix from template name
          const suffix = templateName.includes('frontend') ? 'frontend' :
                        templateName.includes('backend') ? 'backend' :
                        templateName.replace(/^(react|vite|vue|express|nestjs)-?/, '');
          const projectName = suffix;

          // Check if this project depends on others (frontend depends on backend for E2E)
          const dependsOn = templateName.includes('frontend') && createdProjectConfigs.some(p => p.name.includes('backend'))
            ? [createdProjectConfigs.find(p => p.name.includes('backend'))!.name]
            : undefined;

          // Create project in workspace root with suffix as directory name (e.g., ~/orchy/blog2/frontend)
          // Use directoryName to avoid nesting: ~/orchy/blog2/frontend instead of ~/orchy/blog2/frontend/blog2-frontend
          const projectConfig = await templateManager.createFromTemplate({
            name: projectName,
            targetPath: targetPath,  // Workspace root (e.g., ~/orchy/blog2)
            directoryName: suffix,   // Directory name (e.g., 'frontend')
            template: templateName as any,
            dependsOn,
            permissions: {
              allow: TEMPLATE_PERMISSIONS[templateName] || [],
            },
            skipGitInit: true,  // Orchy Managed: git is handled at workspace root level
          });

          createdProjectConfigs.push({
            name: projectName,
            ...projectConfig,
          });

          // Attach design to frontend project if specified
          if (designName && templateName.includes('frontend')) {
            try {
              const designUpdate = await templateManager.attachDesignToProject(
                projectConfig.path,
                projectName,
                designName
              );
              // Update the project config with attachedDesign
              const projectIdx = createdProjectConfigs.findIndex(p => p.name === projectName);
              if (projectIdx >= 0) {
                createdProjectConfigs[projectIdx] = {
                  ...createdProjectConfigs[projectIdx],
                  ...designUpdate,
                };
              }
              console.log(`[Orchestrator] Attached design '${designName}' to ${projectName}`);
            } catch (designErr) {
              console.error(`[Orchestrator] Failed to attach design to ${projectName}:`, designErr);
            }
          }
        }

        // Create workspace with the newly created projects (Orchy Managed monorepo)
        const workspace = workspaceManager.createWorkspace({
          name: appName,
          projects: createdProjectConfigs,
          context,
          orchyManaged: true,  // This is a template-created monorepo workspace
          github: github?.enabled ? {
            enabled: true,
            visibility: github.visibility || 'private',
            ownerType: github.ownerType || 'user',
            owner: github.owner,
          } : undefined,
        });
        createdWorkspaceId = workspace.id;

        // Initialize git at workspace root (Orchy Managed monorepo structure)
        let githubRepoCreated = false;
        let githubRepoName: string | undefined;

        try {
          console.log(`[Orchestrator] Initializing git at workspace root: ${expandedTargetPath}`);
          const initResult = await gitManager.initRepo(expandedTargetPath, 'main');
          if (initResult.success) {
            // Create initial commit with all project files
            const projectNames = createdProjectConfigs.map(p => p.name).join(', ');
            const commitResult = await gitManager.commit(expandedTargetPath, `Initial commit: ${appName} workspace (${projectNames})`);
            if (commitResult.success) {
              console.log(`[Orchestrator] Git initialized at workspace root with initial commit`);

              // Create GitHub repository if enabled
              if (github?.enabled) {
                try {
                  console.log(`[Orchestrator] Creating GitHub repository for ${appName}...`);
                  const repoResult = await githubManager.createRepoOnly({
                    name: appName,
                    visibility: github.visibility || 'private',
                    ownerType: github.ownerType || 'user',
                    owner: github.owner,
                    description: `${appName} workspace created by Orchy`,
                  });

                  if (repoResult.success && repoResult.repo) {
                    console.log(`[Orchestrator] GitHub repository created: ${repoResult.repo}`);
                    githubRepoCreated = true;
                    githubRepoName = repoResult.repo;

                    // Add remote origin
                    const remoteResult = await githubManager.addRemote(expandedTargetPath, repoResult.repo);
                    if (remoteResult.success) {
                      console.log(`[Orchestrator] Added remote origin: ${repoResult.repo}`);

                      // Push initial commit
                      const pushResult = await githubManager.pushToRemote(expandedTargetPath, 'main', repoResult.repo);
                      if (pushResult.success) {
                        console.log(`[Orchestrator] Pushed initial commit to GitHub`);
                      } else {
                        console.warn(`[Orchestrator] Failed to push initial commit: ${pushResult.error}`);
                      }
                    } else {
                      console.warn(`[Orchestrator] Failed to add remote: ${remoteResult.error}`);
                    }

                    // Update workspace with actual repo name
                    workspaceManager.updateWorkspace(workspace.id, {
                      github: {
                        enabled: true,
                        repo: repoResult.repo,
                        visibility: github.visibility || 'private',
                        ownerType: github.ownerType || 'user',
                        owner: github.owner,
                      },
                    });
                  } else {
                    console.warn(`[Orchestrator] Failed to create GitHub repo: ${repoResult.error}`);
                  }
                } catch (ghErr) {
                  console.error(`[Orchestrator] GitHub repository creation error:`, ghErr);
                  // Don't fail workspace creation - GitHub is optional
                }
              }
            } else {
              console.warn(`[Orchestrator] Git init succeeded but initial commit failed: ${commitResult.message}`);
            }
          } else {
            console.warn(`[Orchestrator] Failed to initialize git at workspace root: ${initResult.message}`);
          }
        } catch (gitErr) {
          console.error(`[Orchestrator] Git initialization error at workspace root:`, gitErr);
          // Don't fail the workspace creation - git is optional
        }

        // Emit updated workspaces and success with workspace ID
        socket.emit('workspaces', workspaceManager.getWorkspaces());
        socket.emit('workspaceFromTemplateCreated', {
          workspaceId: workspace.id,
          githubRepoCreated,
          githubRepo: githubRepoName,
        });

        console.log(`[Orchestrator] Orchy Managed workspace created: ${workspace.id}`);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[Orchestrator] Create workspace from template failed:', error);
        cleanup();
        socket.emit('quickStartError', { error });
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // Workspace Management Socket Events
    // ═══════════════════════════════════════════════════════════════

    socket.on('getWorkspaces', () => {
      socket.emit('workspaces', workspaceManager.getWorkspaces());
    });

    socket.on('createWorkspace', ({ name, projects, context }: { name: string; projects: WorkspaceProjectConfig[]; context?: string }) => {
      try {
        workspaceManager.createWorkspace({ name, projects, context });
        socket.emit('workspaces', workspaceManager.getWorkspaces());
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[Orchestrator] Failed to create workspace:', error);
        socket.emit('workspaceError', { error });
      }
    });

    socket.on('updateWorkspace', ({ id, updates }: { id: string; updates: { name?: string; projects?: WorkspaceProjectConfig[]; context?: string; github?: GitHubConfig; mainBranch?: string } }) => {
      try {
        workspaceManager.updateWorkspace(id, updates);
        socket.emit('workspaces', workspaceManager.getWorkspaces());
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[Orchestrator] Failed to update workspace:', error);
        socket.emit('workspaceError', { error });
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // Workspace Project CRUD Socket Events
    // ═══════════════════════════════════════════════════════════════

    socket.on('addProjectToWorkspace', ({ workspaceId, project }: { workspaceId: string; project: WorkspaceProjectConfig }) => {
      try {
        // Check if workspace is Orchy Managed
        const workspace = workspaceManager.getWorkspace(workspaceId);
        if (workspace?.orchyManaged) {
          // Orchy Managed workspaces only allow template-based projects
          // This handler is for adding existing projects, so reject
          socket.emit('workspaceError', {
            error: 'Orchy Managed workspaces only allow adding projects from templates to maintain the unified repository structure.'
          });
          return;
        }
        workspaceManager.addProjectToWorkspace(workspaceId, project);
        socket.emit('workspaces', workspaceManager.getWorkspaces());
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[Orchestrator] Failed to add project to workspace:', error);
        socket.emit('workspaceError', { error });
      }
    });

    socket.on('updateWorkspaceProject', ({ workspaceId, projectName, updates }: { workspaceId: string; projectName: string; updates: Partial<ProjectConfig> }) => {
      try {
        workspaceManager.updateWorkspaceProject(workspaceId, projectName, updates);
        socket.emit('workspaces', workspaceManager.getWorkspaces());
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[Orchestrator] Failed to update workspace project:', error);
        socket.emit('workspaceError', { error });
      }
    });

    socket.on('removeProjectFromWorkspace', ({ workspaceId, projectName }: { workspaceId: string; projectName: string }) => {
      try {
        workspaceManager.removeProjectFromWorkspace(workspaceId, projectName);
        socket.emit('workspaces', workspaceManager.getWorkspaces());
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[Orchestrator] Failed to remove project from workspace:', error);
        socket.emit('workspaceError', { error });
      }
    });

    socket.on('deleteWorkspace', ({ id }: { id: string }) => {
      try {
        // Delete all sessions associated with this workspace first
        const sessionResult = sessionManager.deleteSessionsByWorkspace(id);
        console.log(`[Orchestrator] Deleted ${sessionResult.deleted} sessions for workspace ${id}`);

        workspaceManager.deleteWorkspace(id);
        socket.emit('workspaces', workspaceManager.getWorkspaces());
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[Orchestrator] Failed to delete workspace:', error);
        socket.emit('workspaceError', { error });
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // Session Persistence Socket Events
    // ═══════════════════════════════════════════════════════════════

    // Get list of all sessions
    socket.on('getSessions', () => {
      const sessions = sessionManager.listSessions();
      socket.emit('sessionList', sessions);
    });

    // Load a specific session (view only - does NOT modify global state)
    socket.on('loadSession', ({ sessionId }: { sessionId: string }) => {
      try {
        // Check if this session is the currently active one
        const currentSession = sessionManager.getCurrentSession();
        const isActiveSession = currentSession?.id === sessionId;

        // Get session data WITHOUT modifying global state
        // This allows viewing old sessions while another session is running
        const fullData = sessionStore.getFullSessionData(sessionId);
        if (!fullData) {
          socket.emit('loadSessionError', { error: 'Session not found' });
          return;
        }

        // Send full session data to client
        // readOnly=true indicates this is just a view, not an active session
        socket.emit('sessionLoaded', {
          ...fullData,
          isActive: isActiveSession,
          readOnly: !isActiveSession,  // True when viewing inactive sessions
        });

        console.log(`[Orchestrator] Session ${sessionId} loaded (active: ${isActiveSession}, readOnly: ${!isActiveSession})`);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[Orchestrator] Failed to load session:', error);
        socket.emit('loadSessionError', { error });
      }
    });

    // Delete a session
    socket.on('deleteSession', ({ sessionId }: { sessionId: string }) => {
      try {
        const success = sessionManager.deleteSession(sessionId);
        if (success) {
          socket.emit('deleteSessionSuccess', { sessionId });
          // Send updated session list
          socket.emit('sessionList', sessionManager.listSessions());
        } else {
          socket.emit('deleteSessionError', { sessionId, error: 'Session not found' });
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        socket.emit('deleteSessionError', { sessionId, error });
      }
    });

    // Activate a session (start dev servers and make it the active session)
    socket.on('activateSession', async ({ sessionId }: { sessionId: string }) => {
      try {
        // If there's already an active session, mark it as interrupted
        const currentSession = sessionManager.getCurrentSession();
        if (currentSession && currentSession.id !== sessionId) {
          sessionManager.markSessionInterrupted();
          processManager.stopAll();
        }

        // Load the session
        const fullData = sessionManager.loadSession(sessionId);
        if (!fullData) {
          socket.emit('activateSessionError', { error: 'Session not found' });
          return;
        }

        // Set current session ID on StatusMonitor and LogAggregator
        statusMonitor.setCurrentSessionId(sessionId);
        logAggregator.setCurrentSessionId(sessionId);

        // Restore statuses and logs to in-memory stores
        statusMonitor.restoreStatuses(fullData.session.statuses);
        logAggregator.restoreLogs(fullData.logs);

        // Initialize event watchers for each project
        for (const project of fullData.session.projects) {
          const sessionDir = sessionManager.getSessionDir(project);
          if (sessionDir) {
            logAggregator.registerProject(project, sessionDir);
                      }
        }

        // Create session logger
        sessionLogger = new SessionLogger(sessionId);

        // Update session status to 'running'
        sessionStore.loadSession(sessionId); // Ensure it's loaded
        const session = sessionStore.loadSession(sessionId);
        if (session) {
          session.status = 'running';
          // Write back (loadSession already sets currentSessionId)
        }

        // Start dev servers for all projects
        for (const project of fullData.session.projects) {
          try {
            console.log(`[Orchestrator] Starting dev server for ${project}...`);
            await processManager.startDevServer(project);
          } catch (err) {
            console.error(`[Orchestrator] Failed to start dev server for ${project}:`, err);
            statusMonitor.updateStatus(project, 'FATAL_DEBUGGING', `Dev server failed: ${err}`);
          }
        }

        // Emit success
        socket.emit('sessionActivated', { sessionId });

        // Send full session data to all clients
        const updatedFullData = sessionStore.getFullSessionData(sessionId);
        if (updatedFullData) {
          (ui.io as any).emit('sessionLoaded', {
            ...updatedFullData,
            isActive: true,
          });
        }

        // Send updated session list to all clients
        (ui.io as any).emit('sessionList', sessionManager.listSessions());

        console.log(`[Orchestrator] Session ${sessionId} activated`);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[Orchestrator] Failed to activate session:', error);
        socket.emit('activateSessionError', { error });
      }
    });

    // Stop dev servers only (does NOT mark session as interrupted)
    socket.on('stopDevServers', async () => {
      try {
        console.log('[Orchestrator] Stopping dev servers...');
        await processManager.stopAllDevServers();
        socket.emit('devServersStopped');
        // Emit updated dev server status
        ui.io.emit('devServerStatus', { servers: [] });
        console.log('[Orchestrator] Dev servers stopped');
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[Orchestrator] Failed to stop dev servers:', error);
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // Standalone Dev Server Management (for floating panel controls)
    // ═══════════════════════════════════════════════════════════════

    // Get status of all running dev servers
    socket.on('getDevServerStatus', () => {
      const servers = processManager.getAllDevServerStatuses();
      socket.emit('devServerStatus', { servers });
    });

    // Start dev servers for a workspace (standalone, outside of session)
    socket.on('startDevServers', async ({ workspaceId, projects }: { workspaceId: string; projects?: string[] }) => {
      try {
        console.log(`[Orchestrator] Starting dev servers for workspace ${workspaceId}`);

        // Get workspace config
        const workspace = workspaceManager.getWorkspace(workspaceId);
        if (!workspace) {
          socket.emit('devServerError', { error: 'Workspace not found' });
          return;
        }

        // Get project configs from workspace
        const workspaceProjectConfigs = workspaceManager.getWorkspaceProjectConfigs(workspaceId);

        // Merge into config.projects so ProcessManager has access
        Object.assign(config.projects, workspaceProjectConfigs);

        // Determine which projects to start
        const projectsToStart = projects || workspace.projects
          .filter(p => p.devServerEnabled !== false && p.devServer)
          .map(p => p.name);

        if (projectsToStart.length === 0) {
          socket.emit('devServerError', { error: 'No dev server enabled projects found' });
          return;
        }

        // Start each dev server
        for (const project of projectsToStart) {
          const projectConfig = workspaceProjectConfigs[project];
          if (!projectConfig || !projectConfig.devServer) {
            console.log(`[Orchestrator] Skipping ${project} - no dev server config`);
            continue;
          }

          // Emit starting status
          ui.io.emit('devServerStatus', {
            servers: processManager.getAllDevServerStatuses().concat([{
              project,
              status: 'starting' as const,
              port: processManager.getPortFromUrl(projectConfig.devServer.url),
              url: projectConfig.devServer.url || null,
              startedAt: null,
            }])
          });

          try {
            await processManager.startDevServer(project);
            console.log(`[Orchestrator] Dev server started for ${project}`);
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            console.error(`[Orchestrator] Failed to start dev server for ${project}:`, error);
            ui.io.emit('devServerError', { project, error });
          }
        }

        // Emit final status
        ui.io.emit('devServerStatus', { servers: processManager.getAllDevServerStatuses() });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[Orchestrator] Failed to start dev servers:', error);
        socket.emit('devServerError', { error });
      }
    });

    // Stop a single dev server
    socket.on('stopDevServer', async ({ project }: { project: string }) => {
      try {
        console.log(`[Orchestrator] Stopping dev server for ${project}`);
        await processManager.stopDevServer(project);
        ui.io.emit('devServerStatus', { servers: processManager.getAllDevServerStatuses() });
        console.log(`[Orchestrator] Dev server stopped for ${project}`);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[Orchestrator] Failed to stop dev server for ${project}:`, error);
        socket.emit('devServerError', { project, error });
      }
    });

    // Restart a single dev server
    socket.on('restartDevServer', async ({ project }: { project: string }) => {
      try {
        console.log(`[Orchestrator] Restarting dev server for ${project}`);

        // Emit stopping status
        const currentServers = processManager.getAllDevServerStatuses();
        const updatedServers = currentServers.map(s =>
          s.project === project ? { ...s, status: 'stopping' as const } : s
        );
        ui.io.emit('devServerStatus', { servers: updatedServers });

        await processManager.restartDevServer(project);

        ui.io.emit('devServerStatus', { servers: processManager.getAllDevServerStatuses() });
        console.log(`[Orchestrator] Dev server restarted for ${project}`);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[Orchestrator] Failed to restart dev server for ${project}:`, error);
        socket.emit('devServerError', { project, error });
      }
    });

    // Check port availability for workspace projects
    socket.on('checkPortAvailability', async ({ workspaceId, projects }: { workspaceId: string; projects?: string[] }) => {
      try {
        console.log(`[Orchestrator] Checking port availability for workspace ${workspaceId}`);

        const workspace = workspaceManager.getWorkspace(workspaceId);
        if (!workspace) {
          socket.emit('portCheckError', { error: 'Workspace not found' });
          return;
        }

        const workspaceProjectConfigs = workspaceManager.getWorkspaceProjectConfigs(workspaceId);
        const projectsToCheck = projects || workspace.projects
          .filter(p => p.devServerEnabled !== false && p.devServer?.url)
          .map(p => p.name);

        const conflicts: Array<{
          project: string;
          port: number;
          url: string;
          inUse: boolean;
          processName?: string;
          processPid?: number;
        }> = [];

        for (const project of projectsToCheck) {
          const projectConfig = workspaceProjectConfigs[project];
          if (!projectConfig?.devServer?.url) continue;

          const port = processManager.getPortFromUrl(projectConfig.devServer.url);
          if (!port) continue;

          // Skip if we already have this server running (it's our own port)
          if (processManager.isDevServerRunning(project)) {
            continue;
          }

          const portStatus = await processManager.checkPortStatus(port);
          if (portStatus.inUse) {
            conflicts.push({
              project,
              port,
              url: projectConfig.devServer.url,
              inUse: true,
              processName: portStatus.processName,
              processPid: portStatus.processPid,
            });
          }
        }

        if (conflicts.length > 0) {
          socket.emit('portConflict', { conflicts });
        } else {
          socket.emit('portCheckResult', { hasConflicts: false });
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[Orchestrator] Port check failed:', error);
        socket.emit('portCheckError', { error });
      }
    });

    // Kill process on a specific port
    socket.on('killPortProcess', async ({ port }: { port: number }) => {
      try {
        console.log(`[Orchestrator] Killing process on port ${port}`);
        const result = await processManager.killProcessOnPort(port);
        socket.emit('portKillResult', {
          port,
          success: result.success,
          processName: result.processName,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[Orchestrator] Failed to kill process on port ${port}:`, error);
        socket.emit('portKillResult', { port, success: false, error });
      }
    });

    // Get logs for a specific dev server
    socket.on('getDevServerLogs', ({ project }: { project: string }) => {
      const logs = processManager.getProjectLogs(project);
      // Filter for dev server logs only (not agent logs)
      const devServerLogs = logs
        .filter(line => !line.startsWith('[agent]'))
        .map((text, idx) => ({
          project,
          stream: text.includes('[stderr]') ? 'stderr' as const : 'stdout' as const,
          text: text.replace(/^\[(stdout|stderr)\]\s*/, ''),
          timestamp: Date.now() - (logs.length - idx) * 100, // Approximate timestamps
        }));
      socket.emit('devServerLogs', { project, logs: devServerLogs });
    });

    // Start a new session - clean up everything
    socket.on('startNewSession', async () => {
      try {
        console.log('[Orchestrator] Starting new session - cleaning up...');

        // Stop all processes (dev servers + agents)
        await processManager.stopAll();

        // Stop planning agent
        planningAgent.stop();

        // Clear chat handler history
        chatHandler.clearHistory();

        // Mark current session as interrupted if exists
        const currentSession = sessionManager.getCurrentSession();
        if (currentSession) {
          sessionManager.markSessionInterrupted();
        }

        // Clear session manager state
        sessionManager.clearCurrentSession();

        socket.emit('newSessionReady');
        console.log('[Orchestrator] New session ready');
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[Orchestrator] Failed to start new session:', error);
      }
    });

    // Stop the active session (stops dev servers, marks as interrupted)
    // Also works for completed sessions where user wants to stop dev servers
    socket.on('stopSession', ({ sessionId }: { sessionId: string }) => {
      try {
        const currentSession = sessionManager.getCurrentSession();

        // If there's an active session that doesn't match, reject
        // But if currentSession is null (completed), allow stopping dev servers
        if (currentSession && currentSession.id !== sessionId) {
          socket.emit('stopSessionError', { sessionId, error: 'Session not active' });
          return;
        }

        // Mark session as interrupted (if still active)
        if (currentSession) {
          sessionManager.markSessionInterrupted();
        }

        // Stop all processes (dev servers, agents, etc.)
        processManager.stopAll();

        // Emit success
        socket.emit('sessionStopped', { sessionId });

        // Send updated session list to all clients
        (ui.io as any).emit('sessionList', sessionManager.listSessions());

        console.log(`[Orchestrator] Session ${sessionId} stopped (dev servers terminated)`);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[Orchestrator] Failed to stop session:', error);
        socket.emit('stopSessionError', { sessionId, error });
      }
    });

    // On connection, always send session list
    const sessions = sessionManager.listSessions();
    socket.emit('sessionList', sessions);

    // If there's an active session, send its full data with isActive flag
    const currentSession = sessionManager.getCurrentSession();
    if (currentSession) {
      const fullData = sessionStore.getFullSessionData(currentSession.id);
      if (fullData) {
        socket.emit('sessionLoaded', {
          ...fullData,
          isActive: true,
        });
      }
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Graceful shutdown
  // ═══════════════════════════════════════════════════════════════

  const shutdown = () => {
    console.log('\n[Orchestrator] Shutting down...');

    // Flush all pending session writes before shutdown
    sessionStore.flushAll();

    // Mark current session as interrupted if it exists and isn't completed
    const currentSession = sessionManager.getCurrentSession();
    if (currentSession) {
      const sessionData = sessionStore.loadSession(currentSession.id);
      if (sessionData && sessionData.status !== 'completed') {
        sessionManager.markSessionInterrupted();
      }
    }

    // Stop all processes
    processManager.stopAll();

    // Stop Planning Agent
    planningAgent.stop();

    // Stop UI server
    ui.stop();

    console.log('[Orchestrator] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // ═══════════════════════════════════════════════════════════════
  // Start the orchestrator
  // ═══════════════════════════════════════════════════════════════

  // Start UI server
  ui.start();

  // Start Planning Agent
  try {
    await planningAgent.start();
  } catch (err) {
    console.warn('[Orchestrator] Planning Agent failed to start:', err);
    console.warn('[Orchestrator] Continuing without Planning Agent (chat will not work)');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Orchestrator ready!');
  console.log(`  Open http://localhost:${orchestratorPort} to get started`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Output URL using stdout.write (bypasses obfuscator's console stripping)
  process.stdout.write(`\x1b[32m  Server running at:\x1b[0m \x1b[36mhttp://localhost:${orchestratorPort}\x1b[0m\n\n`);

  // Open browser automatically unless --no-browser flag is set
  if (!cliOptions.noBrowser) {
    setTimeout(() => {
      openBrowser(`http://localhost:${orchestratorPort}`);
    }, 500);
  }
  console.log('Status summary:');
  console.log(statusMonitor.getSummary());

  // Emit ready signal for Tauri sidecar communication
  // This MUST be the last output so Tauri can parse the port
  emitReadySignal(orchestratorPort);
}

// Run
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
