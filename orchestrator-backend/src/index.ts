import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import * as os from 'os';
import { exec } from 'child_process';

// Setup file logging for GUI app debugging
const LOG_DIR = path.join(os.homedir(), '.aio-config', 'logs');
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
  \x1b[33mLogs:\x1b[0m        ~/.aio-config/logs/orchestrator.log

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

import { Config, Plan, HookEvent, LogEntry, OrchestratorEvent, TaskDefinition, StreamingMessage, ContentBlock, StuckState, UserActionRequiredEvent, RequestFlow, FlowStep } from '@aio/types';
import { SessionManager } from './core/session-manager';
import { SessionStore } from './core/session-store';
import { ProcessManager } from './core/process-manager';
import { ProjectManager, AddProjectOptions, CreateFromTemplateOptions } from './core/project-manager';
import { EventWatcher } from './core/event-watcher';
import { StatusMonitor } from './core/status-monitor';
import { ApprovalQueue } from './core/approval-queue';
import { LogAggregator } from './core/log-aggregator';
import { StateMachine } from './core/state-machine';
import { ActionExecutor } from './core/action-executor';
import { PlanningAgentManager } from './planning/planning-agent-manager';
import { ChatHandler } from './planning/chat-handler';
import { createUIServer } from './ui/server';
import { SessionLogger } from './core/session-logger';
import { TaskExecutor } from './core/task-executor';
import { GitManager } from './core/git-manager';
import { TEMPLATE_PERMISSIONS } from '@aio/types';
import { getPaths, getProjectsConfigPath, initializeConfigIfNeeded, ensureSetupExtracted } from './config/paths';
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
AIO Orchestrator - Multi-agent orchestrator for Claude Code

Usage: aio [options]

Options:
  --port, -p PORT    Specify port to run on (default: 3456)
  --no-browser       Don't open browser automatically
  --help, -h         Show this help message

Environment variables:
  ORCHESTRATOR_PORT  Default port (default: 3456)

Examples:
  aio                    Start server, open browser
  aio --port 8080        Use specific port
  aio --no-browser       Don't open browser
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

  // Extract setup files from binary to filesystem (production only)
  ensureSetupExtracted();

  // Load configuration using centralized path resolver
  const configPath = getProjectsConfigPath();
  console.log(`  Config:    ${configPath}`);

  const config: Config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  console.log(`  Projects: ${Object.keys(config.projects).join(', ')}`);
  console.log('');

  // Initialize core components
  // SessionStore uses the sessions directory from path resolver
  const sessionStore = new SessionStore(paths.sessionsDir);
  const sessionManager = new SessionManager(config, sessionStore);
  const processManager = new ProcessManager(config);
  const projectManager = new ProjectManager(configPath, config);
  const eventWatcher = new EventWatcher();
  const statusMonitor = new StatusMonitor();
  const approvalQueue = new ApprovalQueue(true); // UI mode
  const logAggregator = new LogAggregator();
  const gitManager = new GitManager();

  // Wire up SessionStore to StatusMonitor and LogAggregator for persistence
  statusMonitor.setSessionStore(sessionStore);
  logAggregator.setSessionStore(sessionStore);

  // Initialize state machine and new event-driven components
  const stateMachine = new StateMachine();
  const planningAgent = new PlanningAgentManager(ORCHESTRATOR_DIR);
  planningAgent.setProjectConfig(config.projects);  // Provide project context to Planning Agent
  const chatHandler = new ChatHandler(planningAgent);
  const actionExecutor = new ActionExecutor(processManager, statusMonitor, stateMachine);

  // TaskExecutor instance - will be fully initialized after session is created (needs getSessionDir)
  let taskExecutor: TaskExecutor | null = null;

  // Session logger (initialized when session is created)
  let sessionLogger: SessionLogger | null = null;

  // Create UI server with dependencies
  const ui = createUIServer(orchestratorPort, {
    sessionManager,
    statusMonitor,
    approvalQueue,
    logAggregator,
    config
  });

  // Set orchestrator port for MCP permission server communication
  processManager.setOrchestratorPort(orchestratorPort);

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

  // ═══════════════════════════════════════════════════════════════
  // Wire up Event Watcher (outbox events from agents via hooks)
  // WHITELIST: Only handle events we explicitly support
  // ═══════════════════════════════════════════════════════════════

  eventWatcher.on('event', (event: OrchestratorEvent) => {
    const project = 'project' in event ? event.project : 'unknown';

    // WHITELIST: Only handle events we explicitly support
    switch (event.type) {
      case 'cross_project_blocked': {
        // Handle cross-project access attempts
        const blocked = event as any;
        console.warn(`[Orchestrator] BLOCKED: ${project} tried to access ${blocked.target_path}`);

        // Emit a chat event so the user sees it
        ui.io.emit('chatResponse', {
          message: `Agent "${project}" tried to access file outside its project`,
          status: 'warning',
          details: `**Tool:** ${blocked.tool}\n**Target:** ${blocked.target_path}\n**Project root:** ${blocked.project_root}\n\nThe agent was instructed to report cross-project issues to the orchestrator instead.`
        });
        break;
      }

      case 'status':
      case 'notification': {
        // Handle status/notification events immediately
        const hookEvent = event as HookEvent;
        if ('status' in hookEvent) {
          const status = hookEvent.status === 'NEEDS_INPUT' ? 'IDLE' :
                         hookEvent.status === 'ERROR' ? 'FATAL_DEBUGGING' :
                         hookEvent.status;
          const message = 'message' in hookEvent ? hookEvent.message : '';
          statusMonitor.updateStatus(project, status as any, message);
          (ui.io as any).emitStatus(project, status, message);

          // Mark agent idle when status is IDLE
          if (hookEvent.status === 'IDLE') {
            stateMachine.markAgentIdle(project);
          }
        }
        break;
      }

      default:
        // Everything else (tool_start, tool_complete, unknown) - ignore silently
        // Status updates come through processManager.on('workerStatus') instead
        break;
    }

    // NO eventQueue.add() - everything handled immediately or ignored
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
        statusMonitor.updateStatus(project, 'BLOCKED', `E2E failed after ${MAX_E2E_RETRIES} fix attempts`);
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

          (ui.io as any).emitWaitingForProject({
            project,
            waitingFor: waitingOn
          });

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

          // Execute through TaskExecutor (handles: agent → verification → commit)
          if (!taskExecutor) {
            console.error(`[Orchestrator] TaskExecutor not initialized for E2E fix`);
            statusMonitor.updateStatus(targetProject, 'FAILED', 'TaskExecutor not initialized');
            pendingE2ERetry.delete(targetProject);
            e2eFixingFor.delete(targetProject);
            continue;
          }

          try {
            const result = await taskExecutor.executeTask(fixTask, fixTaskIndex);

            if (!result.success) {
              console.error(`[Orchestrator] E2E fix task failed for ${targetProject}: ${result.message}`);
              statusMonitor.updateStatus(targetProject, 'BLOCKED', `E2E fix failed: ${result.message}`);
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
        statusMonitor.updateStatus(project, 'BLOCKED', 'E2E failed, no fix available');
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

  // Helper to get dev server URL for a project (from config only, no hardcoded defaults)
  const getDevServerUrl = (project: string): string | null => {
    const projectConfig = config.projects[project];
    // Use explicit URL if configured (takes precedence)
    if (projectConfig?.devServer?.url) {
      return projectConfig.devServer.url;
    }
    // Fall back to port-based URL
    if (projectConfig?.devServer?.port) {
      return `http://localhost:${projectConfig.devServer.port}`;
    }
    // No hardcoded defaults - return null if not configured
    return null;
  };

  // ═══════════════════════════════════════════════════════════════
  // Project verification: deps, build, restart, health check
  // Used after tasks complete and before E2E tests run
  // ═══════════════════════════════════════════════════════════════

  // Helper to check and trigger E2E for a project (queues the request)
  const tryTriggerE2E = async (project: string, message: string) => {
    const session = sessionManager.getCurrentSession();
    const projectConfig = config.projects[project];

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

        // Emit waiting event for UI (legacy)
        (ui.io as any).emitWaitingForProject({ project, waitingFor: waitingOn });
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
      const projectConfig = config.projects[waitingProject];

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
      console.log(`[Orchestrator] ${project} completed E2E fix, re-running E2E tests`);
      pendingE2ERetry.delete(project);

      // Trigger E2E re-run with preserved test scenarios and retry count
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

  statusMonitor.on('allComplete', () => {
    console.log('[Orchestrator] All projects IDLE - Feature complete!');
    chatHandler.systemMessage('All projects completed! Feature implementation done.');
    (ui.io as any).emitAllComplete();

    // Mark session as completed
    sessionManager.markSessionCompleted();
  });

  // ═══════════════════════════════════════════════════════════════
  // Wire up Approval Queue events
  // ═══════════════════════════════════════════════════════════════

  approvalQueue.on('responded', ({ request, approved }) => {
    console.log(`[Orchestrator] Approval ${request.id}: ${approved ? 'APPROVED' : 'REJECTED'}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // Wire up Project Manager events
  // ═══════════════════════════════════════════════════════════════

  projectManager.on('projectAdded', ({ name, config: projectConfig }) => {
    console.log(`[Orchestrator] Project added: ${name}`);
    (ui.io as any).emit('projectAdded', { name, config: projectConfig });
    chatHandler.systemMessage(`Project "${name}" has been added.`);
  });

  projectManager.on('projectRemoved', ({ name }) => {
    console.log(`[Orchestrator] Project removed: ${name}`);
    (ui.io as any).emit('projectRemoved', { name });
  });

  projectManager.on('npmInstallStart', ({ project }) => {
    console.log(`[Orchestrator] npm install started for ${project}`);
    (ui.io as any).emit('npmInstallStart', { project });
    chatHandler.systemMessage(`Running npm install for "${project}"...`);
  });

  projectManager.on('npmInstallLog', ({ project, text, stream }) => {
    (ui.io as any).emit('npmInstallLog', { project, text, stream });
  });

  projectManager.on('npmInstallComplete', ({ project }) => {
    console.log(`[Orchestrator] npm install completed for ${project}`);
    (ui.io as any).emit('npmInstallComplete', { project });
    chatHandler.systemMessage(`npm install completed for "${project}".`);
  });

  projectManager.on('npmInstallError', ({ project, error }) => {
    console.error(`[Orchestrator] npm install failed for ${project}:`, error);
    (ui.io as any).emit('npmInstallError', { project, error });
    chatHandler.systemMessage(`npm install failed for "${project}": ${error}`);
  });

  projectManager.on('hooksConfigured', ({ project }) => {
    console.log(`[Orchestrator] Hooks configured for ${project}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // Wire up Chat Handler / Planning Agent events
  // ═══════════════════════════════════════════════════════════════

  chatHandler.on('chat', ({ from, message }) => {
    (ui.io as any).emitChat(from, message);
    sessionLogger?.chat(from, message);
  });

  chatHandler.on('planProposal', ({ plan, summary }) => {
    console.log(`[Orchestrator] Plan proposed: ${plan.feature}`);
    (ui.io as any).emitPlanProposal(plan, summary);
    sessionLogger?.planProposal(plan);

    // Persist pending plan for session recovery
    const currentSessionId = sessionStore.getCurrentSessionId();
    if (currentSessionId) {
      sessionStore.setPendingPlan(currentSessionId, { plan, summary });
    }
  });

  chatHandler.on('planCleared', () => {
    console.log(`[Orchestrator] Plan cleared (user continuing conversation)`);
    (ui.io as any).emit('planCleared');

    // Clear persisted pending plan
    const currentSessionId = sessionStore.getCurrentSessionId();
    if (currentSessionId) {
      sessionStore.clearPendingPlan(currentSessionId);
    }
  });

  chatHandler.on('planApproved', (plan: Plan) => {
    console.log(`[Orchestrator] Plan approved, setting on session`);
    sessionManager.setPlan(plan);
    statusMonitor.initializeTasks(plan.tasks);  // Initialize task tracking
    // Broadcast initial task states to all connected clients
    (ui.io as any).emitTaskStates(statusMonitor.getAllTaskStates());
    sessionLogger?.log('PLAN_APPROVED', { feature: plan.feature, taskCount: plan.tasks.length });
    // Note: sessionStore.setPlan already clears pendingPlan
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
                // Continue with remaining tasks
                chatHandler.systemMessage(`Continuing with ${remainingTasks.length} remaining task(s)...`);
                for (const { task, taskIndex } of remainingTasks) {
                  console.log(`[Orchestrator] Resuming task #${taskIndex} (${action.project}:${task.name})`);
                  statusMonitor.updateTaskStatus(taskIndex, 'pending', 'Starting...');

                  const result = await taskExecutor!.executeTask(task, taskIndex);

                  if (!result.success) {
                    console.log(`[Orchestrator] Task #${taskIndex} failed, stopping for user intervention`);
                    chatHandler.systemMessage(
                      `Task "${task.name}" failed. Execution stopped. Please provide a fix instruction.`
                    );
                    return; // Stop and wait for user
                  }
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

  // Forward verification start events to UI
  chatHandler.on('verificationStart', (event) => {
    (ui.io as any).emitVerificationStart(event);
  });

  // Forward E2E analyzing events to UI
  chatHandler.on('e2eAnalyzing', (event) => {
    (ui.io as any).emitE2EAnalyzing(event);
  });

  // Forward chat response events as instant flows (structured responses from Planning Agent)
  chatHandler.on('chatResponse', (event) => {
    // Convert to instant flow for unified UI
    (ui.io as any).emitInstantFlow({
      id: `response_${Date.now()}`,
      type: 'info',
      startedAt: Date.now(),
      steps: [],
      result: {
        passed: event.status !== 'error',
        summary: event.message,
        details: event.details
      }
    });
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
    socket.on('startSession', async ({ feature, projects, branchName }: { feature: string; projects: string[]; branchName?: string }) => {
      try {
        // Create session
        const session = sessionManager.createSession(feature, projects);

        // Initialize git branches for git-enabled projects
        const gitBranches: Record<string, string> = {};
        for (const project of projects) {
          const projectConfig = config.projects[project];
          if (projectConfig?.gitEnabled) {
            try {
              // Expand path
              let projectPath = projectConfig.path;
              if (projectPath.startsWith('~')) {
                projectPath = projectPath.replace('~', process.env.HOME || '');
              }

              // Initialize git repo (non-destructive, ensures main branch exists)
              const mainBranchForProject = projectConfig.mainBranch || 'main';
              await gitManager.initRepo(projectPath, mainBranchForProject);

              // Generate branch name if not provided
              const actualBranchName = branchName?.trim() || gitManager.generateBranchName(feature);

              // Create and checkout branch
              const branchResult = await gitManager.createAndCheckoutBranch(projectPath, actualBranchName);
              if (branchResult.success) {
                gitBranches[project] = actualBranchName;
                console.log(`[Orchestrator] Git branch '${actualBranchName}' ${branchResult.created ? 'created' : 'checked out'} for ${project}`);
              } else {
                console.error(`[Orchestrator] Failed to setup git branch for ${project}: ${branchResult.message}`);
              }
            } catch (err) {
              console.error(`[Orchestrator] Git setup failed for ${project}:`, err);
            }
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
        sessionLogger.log('SESSION_CREATE', { feature, projects });

        // Initialize status for each project
        for (const project of projects) {
          statusMonitor.initializeProject(project);
          const sessionDir = sessionManager.getSessionDir(project);
          if (sessionDir) {
            logAggregator.registerProject(project, sessionDir);
            eventWatcher.watchProject(project, sessionDir);
          }
        }

        (ui.io as any).emitSessionCreated(session);
        chatHandler.systemMessage(`Session created: ${session.id}`);
        sessionLogger.chat('system', `Session created: ${session.id}`);

        // Get project paths for Planning Agent to explore
        const projectPaths: Record<string, string> = {};
        for (const project of projects) {
          const projectConfig = projectManager.getProject(project);
          if (projectConfig) {
            projectPaths[project] = projectConfig.path;
          }
        }

        // Request plan from Planning Agent with project paths
        sessionLogger.chat('user', `Create a plan for: ${feature}`);
        chatHandler.requestPlan(feature, projects, projectPaths);
      } catch (err) {
        console.error('[Orchestrator] Failed to create session:', err);
        chatHandler.systemMessage(`Failed to create session: ${err}`);
        sessionLogger?.error('SESSION_CREATE', err);
      }
    });

    // Handle plan approval
    socket.on('approvePlan', (plan: Plan) => {
      sessionManager.setPlan(plan);
      // Clear the chat-handler's internal pending plan state
      chatHandler.clearPendingPlan();
      // Initialize task tracking and broadcast to all clients
      statusMonitor.initializeTasks(plan.tasks);
      (ui.io as any).emitTaskStates(statusMonitor.getAllTaskStates());
      // Send updated session to UI so session.plan is set
      const updatedSession = sessionManager.getCurrentSession();
      if (updatedSession) {
        (ui.io as any).emitSession(updatedSession);
      }

      // Clear pending plan on all clients (prevents race condition where planProposal might re-appear)
      (ui.io as any).emit('planCleared');

      // Emit plan approved as instant flow (goes straight to history as green card)
      (ui.io as any).emitInstantFlow({
        id: `plan_approved_${Date.now()}`,
        type: 'success',
        startedAt: Date.now(),
        steps: [],
        result: {
          passed: true,
          summary: `Plan approved: "${plan.feature}" - ${plan.tasks.length} tasks across ${new Set(plan.tasks.map(t => t.project)).size} projects`
        }
      });

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

      // Group tasks by project
      const tasksByProject = new Map<string, Array<{ task: TaskDefinition; taskIndex: number }>>();
      tasks.forEach((task, taskIndex) => {
        const existing = tasksByProject.get(task.project) || [];
        existing.push({ task, taskIndex });
        tasksByProject.set(task.project, existing);
      });

      // Create TaskExecutor instance for this execution
      taskExecutor = new TaskExecutor({
        processManager,
        statusMonitor,
        stateMachine,
        logAggregator,
        projectManager,
        planningAgent,
        config,
        getSessionDir: (project: string) => sessionManager.getSessionDir(project),
        getDevServerUrl,
        gitManager,
        getGitBranch: (project: string) => session?.gitBranches?.[project],
        io: ui.io,  // For flow events during task verification
      });

      // Clear task summaries from any previous session
      taskExecutor.clearTaskSummaries();

      // Track failed tasks for user fix continuation
      taskExecutor.on('taskFailed', ({ taskIndex, project }: { taskIndex: number; project: string }) => {
        console.log(`[Orchestrator] Tracking failed task #${taskIndex} for ${project}`);
        failedTaskIndex.set(project, taskIndex);
      });

      // Forward userActionRequired events to UI
      taskExecutor.on('userActionRequired', (event) => {
        console.log(`[Orchestrator] User action required for task #${event.taskIndex}`);
        (ui.io as any).emitUserActionRequired(event);
      });

      // Run tasks: parallel across projects, sequential within each project
      const projectPromises = Array.from(tasksByProject.entries()).map(async ([project, projectTasks]) => {
        console.log(`[Orchestrator] Starting ${projectTasks.length} task(s) for ${project}`);

        // Run tasks sequentially within this project
        for (const { task, taskIndex } of projectTasks) {
          console.log(`[Orchestrator] Running task #${taskIndex} (${project}:${task.name})`);
          statusMonitor.updateTaskStatus(taskIndex, 'pending', 'Starting...');

          const result = await taskExecutor!.executeTask(task, taskIndex);

          if (!result.success) {
            console.error(`[Orchestrator] Task #${taskIndex} failed: ${result.message}`);
            // STOP execution on this project - status is FAILED, wait for user intervention
            console.log(`[Orchestrator] Stopping execution for ${project} - requires user intervention`);
            chatHandler.systemMessage(
              `Task "${task.name}" failed for ${project}. Execution stopped. ` +
              `Please provide a fix instruction to continue.`
            );
            return; // Exit the task loop for this project
          }
        }

        // All tasks for this project completed, set to READY
        statusMonitor.updateStatus(project, 'READY', 'All tasks completed');
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

    // Handle direct prompt to specific agent (bypasses queue)
    socket.on('directPrompt', ({ project, prompt }: { project: string; prompt: string }) => {
      console.log(`[Orchestrator] Direct prompt to ${project}`);
      const success = actionExecutor.sendDirect(project, prompt);
      if (!success) {
        chatHandler.systemMessage(`Failed to send prompt to ${project}`);
      }
    });

    // Handle approval responses from UI
    socket.on('approve', ({ id, approved }: { id: string; approved: boolean }) => {
      approvalQueue.respond(id, approved);
    });

    // Handle user action response (credentials/config submitted by user)
    socket.on('userActionResponse', ({ taskIndex, values }: { taskIndex: number; values: Record<string, string> }) => {
      console.log(`[Orchestrator] User action response received for task #${taskIndex}`);
      if (taskExecutor) {
        taskExecutor.handleUserActionResponse(taskIndex, values);
      } else {
        console.error(`[Orchestrator] TaskExecutor not available to handle user action response`);
      }
    });

    // Handle permission response from UI (for live permission approval via MCP)
    socket.on('permissionResponse', async ({ project, taskIndex, approved, toolName, allowAll }: {
      project: string;
      taskIndex: number;
      approved: boolean;
      toolName: string;
      allowAll?: boolean;
    }) => {
      const key = `${project}_${taskIndex}`;
      const pendingPermissions = (ui.io as any).pendingPermissions as Map<string, {
        resolve: (result: string) => void;
        project: string;
        taskIndex: number;
        toolName: string;
        toolInput: Record<string, unknown>;
      }>;

      const pending = pendingPermissions?.get(key);

      if (!pending) {
        console.warn(`[Orchestrator] No pending permission for ${key}`);
        return;
      }

      console.log(`[Orchestrator] Permission ${approved ? 'approved' : 'denied'} for ${project}: ${toolName}${allowAll ? ' (allow all)' : ''}`);

      if (approved) {
        // Add permission to project config for future use (project agents only)
        if (project !== 'planner') {
          const projectConfig = config.projects[project];
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
              try {
                await projectManager.updateProject(project, { permissions: projectConfig.permissions });
                console.log(`[Orchestrator] Permission saved for ${project}: ${permission}`);
              } catch (err) {
                console.error(`[Orchestrator] Failed to save permission:`, err);
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

      // 4. Reset task status to working (triggers UI update showing "in progress")
      statusMonitor.updateTaskStatus(failedIdx, 'working', 'Retrying...');
      statusMonitor.updateStatus(project, 'WORKING', `Retrying task: ${task.name}`);

      // 5. Re-execute the task
      try {
        const result = await taskExecutor!.executeTask(task, failedIdx);

        if (!result.success) {
          chatHandler.systemMessage(`Retry failed for ${task.name}: ${result.message}`);
          return;
        }

        // Continue with remaining tasks (same logic as user fix continuation)
        const allTasks = session?.plan?.tasks || [];
        const remainingTasks = allTasks
          .map((t, idx) => ({ task: t, taskIndex: idx }))
          .filter(({ task: t, taskIndex }) =>
            t.project === project && taskIndex > failedIdx
          );

        for (const { task: t, taskIndex } of remainingTasks) {
          statusMonitor.updateTaskStatus(taskIndex, 'pending', 'Starting...');
          const res = await taskExecutor!.executeTask(t, taskIndex);
          if (!res.success) {
            chatHandler.systemMessage(`Task "${t.name}" failed. Please provide a fix.`);
            return;
          }
        }

        // All tasks for this project completed, set to READY
        statusMonitor.updateStatus(project, 'READY', 'All tasks completed after retry');
        chatHandler.systemMessage(`Retry successful for ${project}. All tasks completed.`);
      } catch (err) {
        console.error(`[Orchestrator] Retry failed:`, err);
        chatHandler.systemMessage(`Retry failed: ${err}`);
      }
    });

    // Handle git push branch request
    socket.on('pushBranch', async ({ project, branchName }: { project: string; branchName: string }) => {
      console.log(`[Orchestrator] Push branch '${branchName}' requested for ${project}`);
      const projectConfig = config.projects[project];

      if (!projectConfig) {
        socket.emit('pushBranchError', { project, error: 'Project not found' });
        return;
      }

      if (!projectConfig.gitEnabled) {
        socket.emit('pushBranchError', { project, error: 'Git is not enabled for this project' });
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
      const projectConfig = config.projects[project];

      if (!projectConfig) {
        socket.emit('mergeBranchError', { project, error: 'Project not found' });
        return;
      }

      if (!projectConfig.gitEnabled) {
        socket.emit('mergeBranchError', { project, error: 'Git is not enabled for this project' });
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

    // Handle GitHub info request (check if project is a GitHub project)
    socket.on('getGitHubInfo', async ({ project }: { project: string }) => {
      console.log(`[Orchestrator] GitHub info requested for ${project}`);
      const projectConfig = config.projects[project];

      if (!projectConfig || !projectConfig.gitEnabled) {
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
    socket.on('getBranches', async ({ project }: { project: string }) => {
      console.log(`[Orchestrator] Branches requested for ${project}`);
      const projectConfig = config.projects[project];

      if (!projectConfig || !projectConfig.gitEnabled) {
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
      const projectConfig = config.projects[project];

      if (!projectConfig) {
        socket.emit('createPRError', { project, error: 'Project not found' });
        return;
      }

      if (!projectConfig.gitEnabled) {
        socket.emit('createPRError', { project, error: 'Git is not enabled for this project' });
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

    // ═══════════════════════════════════════════════════════════════
    // Project Management Socket Events
    // ═══════════════════════════════════════════════════════════════

    // Get list of all configured projects
    socket.on('getProjects', () => {
      const projects = projectManager.getProjects();
      socket.emit('projects', projects);
    });

    // Add a new project
    socket.on('addProject', async (options: AddProjectOptions) => {
      try {
        await projectManager.addProject(options);
        socket.emit('addProjectSuccess', { name: options.name });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[Orchestrator] Failed to add project:`, error);
        socket.emit('addProjectError', { error });
      }
    });

    // Remove a project
    socket.on('removeProject', ({ name }: { name: string }) => {
      try {
        projectManager.removeProject(name);
        socket.emit('removeProjectSuccess', { name });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[Orchestrator] Failed to remove project:`, error);
        socket.emit('removeProjectError', { name, error });
      }
    });

    // Update project configuration
    socket.on('updateProject', ({ name, updates }: { name: string; updates: any }) => {
      try {
        projectManager.updateProject(name, updates);
        socket.emit('updateProjectSuccess', { name });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[Orchestrator] Failed to update project:`, error);
        socket.emit('updateProjectError', { name, error });
      }
    });

    // Install dependencies for a project - DEPRECATED: use installCommand in project config instead
    // Kept for backwards compatibility but does nothing now
    socket.on('installDependencies', async ({ name }: { name: string }) => {
      console.log(`[Orchestrator] installDependencies called for ${name} - use installCommand in project config instead`);
    });

    // Detect project type and get configuration suggestions
    socket.on('detectProjectType', ({ path: projectPath }: { path: string }) => {
      try {
        const suggestions = projectManager.detectProjectType(projectPath);
        socket.emit('projectTypeSuggestions', { path: projectPath, suggestions });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        socket.emit('detectProjectTypeError', { path: projectPath, error });
      }
    });

    // Setup hooks for an existing project
    socket.on('setupProjectHooks', async ({ name }: { name: string }) => {
      try {
        await projectManager.setupProjectHooks(name);
        socket.emit('setupProjectHooksSuccess', { name });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        socket.emit('setupProjectHooksError', { name, error });
      }
    });

    // Get available templates
    socket.on('getTemplates', () => {
      const templates = projectManager.getTemplates();
      socket.emit('templates', templates);
    });

    // Create project from template
    socket.on('createFromTemplate', async (options: CreateFromTemplateOptions) => {
      try {
        await projectManager.createFromTemplate(options);
        socket.emit('createFromTemplateSuccess', { name: options.name, template: options.template });
        // Send updated projects list
        socket.emit('projects', projectManager.getProjects());
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        socket.emit('createFromTemplateError', { name: options.name, error });
      }
    });

    // Quick start: create frontend + backend app with git and e2e enabled
    socket.on('quickStartApp', async ({ appName }: { appName: string }) => {
      try {
        const targetPath = `~/Documents/aio-${appName}`;
        const expandedTargetPath = targetPath.replace('~', process.env.HOME || '');
        const frontendName = `frontend`;
        const backendName = `backend`;

        // Create parent directory if it doesn't exist
        if (!fs.existsSync(expandedTargetPath)) {
          fs.mkdirSync(expandedTargetPath, { recursive: true });
        }

        // Create backend first with template permissions
        await projectManager.createFromTemplate({
          name: `${appName}-${backendName}`,
          targetPath: `${targetPath}/${backendName}`,
          template: 'nestjs-backend',
          permissions: {
            allow: TEMPLATE_PERMISSIONS['nestjs-backend'] || [],
          },
        });

        // Create frontend (depends on backend for E2E) with template permissions
        await projectManager.createFromTemplate({
          name: `${appName}-${frontendName}`,
          targetPath: `${targetPath}/${frontendName}`,
          template: 'vite-frontend',
          dependsOn: [`${appName}-${backendName}`],
          permissions: {
            allow: TEMPLATE_PERMISSIONS['vite-frontend'] || [],
          },
        });

        socket.emit('createFromTemplateSuccess', { name: appName, template: 'quick-start' });
        // Send updated projects list
        socket.emit('projects', projectManager.getProjects());
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        socket.emit('createFromTemplateError', { name: appName, error });
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
          pendingPlan: fullData.session.pendingPlan,
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
          eventWatcher.stopAll();
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
            eventWatcher.watchProject(project, sessionDir);
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

        // Emit success with pending plan if exists
        const pendingPlan = sessionStore.getPendingPlan(sessionId);
        socket.emit('sessionActivated', { sessionId, pendingPlan });

        // Send full session data to all clients (include pending plan)
        const updatedFullData = sessionStore.getFullSessionData(sessionId);
        if (updatedFullData) {
          (ui.io as any).emit('sessionLoaded', {
            ...updatedFullData,
            pendingPlan: updatedFullData.session.pendingPlan,
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

        // Stop file watchers
        eventWatcher.stopAll();

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
          pendingPlan: fullData.session.pendingPlan,
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

    // Stop file watchers
    eventWatcher.stopAll();

    // Stop Planning Agent
    planningAgent.stop();

    // Clear approval queue
    approvalQueue.clearAll();

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
