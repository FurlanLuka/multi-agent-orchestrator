import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { Config, Plan, HookEvent, LogEntry, OrchestratorEvent, TaskDefinition, StreamingMessage, ContentBlock, StuckState, TaskVerificationContext } from './types';
import { SessionManager } from './core/session-manager';
import { SessionStore } from './core/session-store';
import { ProcessManager } from './core/process-manager';
import { ProjectManager, AddProjectOptions, CreateFromTemplateOptions } from './core/project-manager';
import { EventWatcher } from './core/event-watcher';
import { StatusMonitor } from './core/status-monitor';
import { ApprovalQueue } from './core/approval-queue';
import { LogAggregator } from './core/log-aggregator';
import { StateMachine } from './core/state-machine';
import { EventQueue } from './core/event-queue';
import { ActionExecutor } from './core/action-executor';
import { PlanningAgentManager } from './planning/planning-agent-manager';
import { ChatHandler } from './planning/chat-handler';
import { createUIServer } from './ui/server';
import { SessionLogger } from './core/session-logger';
import { detectCycles } from './utils/dependency-graph';
import { TaskExecutor } from './core/task-executor';

// Get orchestrator directory (where this code lives)
const ORCHESTRATOR_DIR = path.resolve(__dirname, '..');

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Multi-Agent Orchestrator');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Directory: ${ORCHESTRATOR_DIR}`);
  console.log('');

  // Load configuration
  const configPath = path.join(ORCHESTRATOR_DIR, 'projects.config.json');
  if (!fs.existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`);
    process.exit(1);
  }

  const config: Config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  console.log(`  Projects: ${Object.keys(config.projects).join(', ')}`);
  console.log('');

  // Initialize core components
  const sessionStore = new SessionStore(ORCHESTRATOR_DIR);
  const sessionManager = new SessionManager(config, ORCHESTRATOR_DIR, sessionStore);
  const processManager = new ProcessManager(config);
  const projectManager = new ProjectManager(configPath, config, ORCHESTRATOR_DIR);
  const eventWatcher = new EventWatcher();
  const statusMonitor = new StatusMonitor();
  const approvalQueue = new ApprovalQueue(true); // UI mode
  const logAggregator = new LogAggregator();

  // Wire up SessionStore to StatusMonitor and LogAggregator for persistence
  statusMonitor.setSessionStore(sessionStore);
  logAggregator.setSessionStore(sessionStore);

  // Initialize state machine and new event-driven components
  const stateMachine = new StateMachine();
  const planningAgent = new PlanningAgentManager(ORCHESTRATOR_DIR);
  planningAgent.setProjectConfig(config.projects);  // Provide project context to Planning Agent
  const chatHandler = new ChatHandler(planningAgent);
  const eventQueue = new EventQueue(stateMachine, planningAgent);
  const actionExecutor = new ActionExecutor(processManager, statusMonitor, stateMachine);

  // Session logger (initialized when session is created)
  let sessionLogger: SessionLogger | null = null;

  // Create UI server with dependencies
  const ui = createUIServer(3456, {
    sessionManager,
    statusMonitor,
    approvalQueue,
    logAggregator
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

  processManager.on('fatalCrash', ({ project, type, crashCount, recentLogs }) => {
    console.log(`[Orchestrator] ${project} ${type} FATAL crash (count: ${crashCount})`);
    statusMonitor.updateStatus(project, 'FATAL_DEBUGGING', `Process crashed ${crashCount} times`);

    // Queue failure analysis request - will be processed when Planning Agent is free
    eventQueue.add({
      type: 'failure_analysis',
      project,
      error: `${type} crashed ${crashCount} times`,
      context: recentLogs
    });
  });

  processManager.on('agentComplete', ({ project }) => {
    console.log(`[Orchestrator] ${project} agent completed`);
  });

  // ═══════════════════════════════════════════════════════════════
  // Wire up Event Watcher (outbox events from agents via hooks)
  // ALL events go through EventQueue → Planning Agent → ActionExecutor
  // ═══════════════════════════════════════════════════════════════

  eventWatcher.on('event', (event: OrchestratorEvent) => {
    const project = 'project' in event ? event.project : 'unknown';
    console.log(`[Orchestrator] Event: ${event.type} from ${project}`);

    // Add event to queue for Planning Agent analysis
    eventQueue.add(event);

    // Also handle immediate UI updates for certain event types
    if (event.type === 'status' || event.type === 'notification') {
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
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Wire up EventQueue → ActionExecutor
  // ═══════════════════════════════════════════════════════════════

  eventQueue.on('action', async (action) => {
    try {
      await actionExecutor.execute(action);
    } catch (err) {
      console.error('[Orchestrator] Failed to execute action:', err);
    }
  });

  // Forward queue events to UI for visibility
  eventQueue.on('eventAdded', (event) => {
    (ui.io as any).emit('queueUpdate', {
      size: eventQueue.getQueueSize(),
      events: eventQueue.getQueuedEvents().map(e => ({
        id: e.id,
        type: e.type,
        project: e.project,
        queuedAt: e.queuedAt,
        preview: e.type === 'user_chat' ? (e.data as any).message?.slice(0, 50) : undefined
      }))
    });
  });

  eventQueue.on('eventRemoved', () => {
    (ui.io as any).emit('queueUpdate', {
      size: eventQueue.getQueueSize(),
      events: eventQueue.getQueuedEvents().map(e => ({
        id: e.id,
        type: e.type,
        project: e.project,
        queuedAt: e.queuedAt,
        preview: e.type === 'user_chat' ? (e.data as any).message?.slice(0, 50) : undefined
      }))
    });
  });

  eventQueue.on('processing', (event) => {
    (ui.io as any).emit('queueProcessing', {
      id: event.id,
      type: event.type,
      project: event.project
    });
  });

  eventQueue.on('cleared', () => {
    (ui.io as any).emit('queueUpdate', { size: 0, events: [] });
  });

  eventQueue.on('idle', () => {
    // Clear the processing indicator when queue is empty
    (ui.io as any).emit('queueProcessing', null);
  });

  // Helper to wrap async event handlers with error handling
  const wrapHandler = <T>(eventName: string, handler: (data: T) => Promise<void>) => {
    return async (data: T) => {
      try {
        await handler(data);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Orchestrator] Error in ${eventName}:`, err);
        chatHandler?.systemMessage(`Error in ${eventName}: ${errorMsg}`);
      } finally {
        eventQueue.triggerProcessing(); // Always continue processing
      }
    };
  };

  // Handle user chat events from queue
  eventQueue.on('userChat', wrapHandler('userChat', async ({ message }: { message: string }) => {
    await chatHandler.handleUserMessage(message);
  }));

  // Handle E2E prompt requests from queue
  eventQueue.on('e2ePromptRequest', wrapHandler('e2ePromptRequest', async ({ project, taskSummary, testScenarios }: {
    project: string;
    taskSummary: string;
    testScenarios: string[];
  }) => {
    const e2ePrompt = await chatHandler.requestE2EPrompt(project, taskSummary, testScenarios);
    if (e2ePrompt && e2ePrompt.trim()) {
      console.log(`[Orchestrator] Executing E2E for ${project} (prompt: ${e2ePrompt.length} chars)`);
      await actionExecutor.execute({ type: 'send_e2e', project, prompt: e2ePrompt });
    } else {
      console.warn(`[Orchestrator] No E2E prompt generated for ${project}`);
    }
  }));

  // Handle failure analysis requests from queue
  eventQueue.on('failureAnalysis', wrapHandler('failureAnalysis', async ({ project, error, context }: {
    project: string;
    error: string;
    context: string[];
  }) => {
    await chatHandler.requestFailureAnalysis(project, error, context);
  }));

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

  // Handle E2E completion - queue for Planning Agent analysis
  actionExecutor.on('e2eComplete', ({ project, result }) => {
    console.log(`[Orchestrator] E2E completed for ${project}, queueing for analysis...`);

    const session = sessionManager.getCurrentSession();
    const testScenarios = session?.plan?.testPlan?.[project] || [];
    const allProjects = session?.projects || [];

    // Get recent dev server logs from ALL projects to provide cross-project context
    const allDevServerLogs = allProjects.map(proj => {
      const logs = logAggregator.getLogsByType(proj, 'devServer', 50)
        .map(e => `[${e.stream}] ${e.text}`)
        .join('\n');
      return logs ? `=== ${proj} dev server logs ===\n${logs}` : '';
    }).filter(Boolean).join('\n\n');

    // Queue for Planning Agent - will be processed when PA is free
    eventQueue.add({
      type: 'e2e_complete',
      project,
      result,
      testScenarios,
      devServerLogs: allDevServerLogs,
      allProjects
    });
  });

  // Handle E2E complete events from queue
  eventQueue.on('e2eComplete', wrapHandler('e2eComplete', async ({ project, result, testScenarios, devServerLogs, allProjects }: {
    project: string;
    result: string;
    testScenarios: string[];
    devServerLogs: string;
    allProjects: string[];
  }) => {
    // Ask Planning Agent to analyze the E2E results
    const analysis = await chatHandler.analyzeE2EResult(project, result, testScenarios, devServerLogs, allProjects);

    if (analysis.passed) {
      // E2E passed! Mark as complete
      console.log(`[Orchestrator] E2E tests PASSED for ${project}`);
      statusMonitor.updateStatus(project, 'IDLE', 'E2E tests passed');
      e2eRetryCount.delete(project); // Reset retry count on success
      // Reset any E2E_FIXING projects back to IDLE since tests passed
      for (const proj of allProjects) {
        const status = statusMonitor.getStatus(proj);
        if (status?.status === 'E2E_FIXING') {
          statusMonitor.updateStatus(proj, 'IDLE', 'E2E tests passed');
        }
      }
      return;
    }

    // E2E failed - check retry count
    const retries = e2eRetryCount.get(project) || 0;

    if (retries >= MAX_E2E_RETRIES) {
      console.error(`[Orchestrator] E2E tests failed for ${project} after ${retries} retries, giving up`);
      chatHandler.systemMessage(`E2E tests failed for ${project} after ${MAX_E2E_RETRIES} fix attempts. Manual intervention required.`);
      statusMonitor.updateStatus(project, 'BLOCKED', `E2E failed after ${MAX_E2E_RETRIES} fix attempts`);
      return;
    }

    // Try to fix
    console.log(`[Orchestrator] E2E tests FAILED for ${project}, attempting fix (retry ${retries + 1}/${MAX_E2E_RETRIES})`);
    e2eRetryCount.set(project, retries + 1);

    // Check for new multi-project fixes format first
    if (analysis.fixes && analysis.fixes.length > 0) {
      // Get session to check valid project names
      const session = sessionManager.getCurrentSession();
      const validProjects = new Set(session?.projects || allProjects);

      // Debug: Log the fixes array
      console.log(`[Orchestrator] E2E analysis returned ${analysis.fixes.length} fix(es):`);
      analysis.fixes.forEach((f, i) => {
        console.log(`[Orchestrator]   Fix ${i}: project="${f.project}", prompt length=${f.prompt?.length || 0}`);
      });

      // Send fixes to all targeted projects SEQUENTIALLY to avoid any race conditions
      for (const fix of analysis.fixes) {
        const targetProject = fix.project;

        // Debug: Triple-check the project name
        console.log(`[Orchestrator] Processing fix for project: "${targetProject}" (type: ${typeof targetProject})`);

        // Validate that target project exists in current session
        if (!validProjects.has(targetProject)) {
          console.error(`[Orchestrator] E2E fix target project "${targetProject}" not found in session projects: ${Array.from(validProjects).join(', ')}`);
          chatHandler.systemMessage(`Error: Cannot apply fix - project "${targetProject}" not found. Available projects: ${Array.from(validProjects).join(', ')}`);
          continue; // Skip this fix
        }

        const fixPrompt = `The E2E tests for ${project} failed. Analysis: ${analysis.analysis}

You need to fix the following in ${targetProject}:
${fix.prompt}

After fixing, the E2E tests will be re-run automatically.`;

        console.log(`[Orchestrator] >>> SENDING FIX TO: "${targetProject}" (E2E failed in "${project}")`);
        statusMonitor.updateStatus(targetProject, 'E2E_FIXING', `Fixing issues from ${project} E2E`);
        await actionExecutor.sendE2EFix(targetProject, fixPrompt);
        console.log(`[Orchestrator] <<< FIX SENT TO: "${targetProject}"`);
      }

      // After all fixes complete, re-run E2E on the original project
      console.log(`[Orchestrator] Fixes applied, re-running E2E tests for ${project}`);
      const e2ePrompt = await chatHandler.requestE2EPrompt(
        project,
        `Re-running E2E after fix attempt ${retries + 1}`,
        testScenarios
      );

      if (e2ePrompt && e2ePrompt.trim()) {
        await actionExecutor.execute({ type: 'send_e2e', project, prompt: e2ePrompt });
      }
    } else if (analysis.fixPrompt) {
      // Legacy: single project fix
      const fixPrompt = `The E2E tests failed with the following issues:

${analysis.analysis}

Please fix these issues:
${analysis.fixPrompt}

After fixing, the E2E tests will be re-run automatically.`;

      await actionExecutor.sendE2EFix(project, fixPrompt);

      // After fix completes, re-run E2E
      console.log(`[Orchestrator] Fix applied for ${project}, re-running E2E tests`);
      const e2ePrompt = await chatHandler.requestE2EPrompt(
        project,
        `Re-running E2E after fix attempt ${retries + 1}`,
        testScenarios
      );

      if (e2ePrompt && e2ePrompt.trim()) {
        await actionExecutor.execute({ type: 'send_e2e', project, prompt: e2ePrompt });
      }
    } else {
      // No fix prompt available, mark as blocked
      statusMonitor.updateStatus(project, 'BLOCKED', 'E2E failed, no fix available');
    }
  }));

  // ═══════════════════════════════════════════════════════════════
  // Wire up State Machine events
  // ═══════════════════════════════════════════════════════════════

  stateMachine.on('stateChange', ({ previous, current }) => {
    console.log(`[Orchestrator] State: ${previous} → ${current}`);
    (ui.io as any).emit('stateChange', { state: current });
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
  });

  // Forward task status changes to UI
  statusMonitor.on('taskStatusChange', (event) => {
    (ui.io as any).emitTaskStatus(event);
  });

  // Track projects waiting for E2E (waiting on dependencies)
  const pendingE2E: Map<string, { message: string; waitingOn: string[]; taskIndex?: number }> = new Map();

  // Track tasks waiting for dependencies (task execution) - keyed by task index
  const pendingTasks: Map<number, { task: TaskDefinition; taskIndex: number; waitingOn: number[] }> = new Map();

  // Track completed task indices
  const completedTasks: Set<number> = new Set();

  // Track failed task indices
  const failedTasks: Set<number> = new Set();

  // Helper to get dev server URL for a project
  const getDevServerUrl = (project: string): string => {
    const projectConfig = config.projects[project];
    // Use explicit URL if configured (takes precedence)
    if (projectConfig?.devServer?.url) {
      return projectConfig.devServer.url;
    }
    // Fall back to port-based URL
    if (projectConfig?.devServer?.port) {
      return `http://localhost:${projectConfig.devServer.port}`;
    }
    // Default: frontend projects use 5173, backend uses 3000
    const isFrontend = project.toLowerCase().includes('frontend');
    return isFrontend ? 'http://localhost:5173' : 'http://localhost:3000';
  };

  // ═══════════════════════════════════════════════════════════════
  // Project verification: deps, build, restart, health check
  // Used after tasks complete and before E2E tests run
  // ═══════════════════════════════════════════════════════════════

  // Build result with full output for Planning Agent analysis
  interface BuildResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    error?: string;
  }

  const runBuildCommand = (project: string, command: string): Promise<BuildResult> => {
    return new Promise((resolve) => {
      // Expand ~ to home directory (same as project-manager does)
      let projectPath = config.projects[project].path;
      if (projectPath.startsWith('~')) {
        projectPath = projectPath.replace('~', process.env.HOME || '');
      }

      // Parse command into cmd + args (same pattern as installDependencies which works)
      const parts = command.split(' ');
      const cmd = parts[0];
      const args = parts.slice(1);

      console.log(`[Orchestrator] Running build: ${command} in ${projectPath}`);

      // Use shell: true to let Node find npm via PATH
      const child = spawn(cmd, args, {
        cwd: projectPath,
        shell: true,
        env: process.env
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
        logAggregator.addLog({
          project,
          type: 'agent',
          stream: 'stdout',
          text: data.toString(),
          timestamp: Date.now()
        });
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        logAggregator.addLog({
          project,
          type: 'agent',
          stream: 'stderr',
          text: data.toString(),
          timestamp: Date.now()
        });
      });

      child.on('close', (code) => {
        const exitCode = code ?? 1;
        if (exitCode === 0) {
          console.log(`[Orchestrator] Build succeeded for ${project}`);
          resolve({ success: true, stdout, stderr, exitCode });
        } else {
          const errorMsg = stderr || stdout || `Build exited with code ${exitCode}`;
          console.log(`[Orchestrator] Build failed for ${project}: ${errorMsg}`);
          resolve({ success: false, stdout, stderr, exitCode, error: errorMsg });
        }
      });

      child.on('error', (err) => {
        console.error(`[Orchestrator] Build spawn error for ${project}:`, err);
        resolve({ success: false, stdout, stderr, exitCode: 1, error: String(err) });
      });
    });
  };

  // Collect all verification context for Planning Agent intelligent analysis
  const collectVerificationContext = async (
    project: string,
    taskName: string,
    taskDescription: string
  ): Promise<TaskVerificationContext> => {
    const context: TaskVerificationContext = {
      project,
      taskName,
      taskDescription
    };

    const projectConfig = config.projects[project];

    // Step 1: Install dependencies
    console.log(`[Orchestrator] [Context] Installing dependencies for ${project}...`);
    statusMonitor.updateStatus(project, 'WORKING', 'Installing dependencies...');
    try {
      await projectManager.installDependencies(project);
    } catch (err) {
      console.log(`[Orchestrator] [Context] Dependency install failed: ${err}`);
      // Continue to collect more context even if deps fail
    }

    // Step 2: Run build and capture full output
    if (projectConfig?.buildCommand) {
      console.log(`[Orchestrator] [Context] Running build for ${project}...`);
      statusMonitor.updateStatus(project, 'WORKING', 'Running build...');
      const buildResult = await runBuildCommand(project, projectConfig.buildCommand);
      context.buildOutput = {
        stdout: buildResult.stdout,
        stderr: buildResult.stderr,
        exitCode: buildResult.exitCode
      };
    }

    // Step 3: Restart dev server
    console.log(`[Orchestrator] [Context] Restarting dev server for ${project}...`);
    statusMonitor.updateStatus(project, 'WORKING', 'Restarting dev server...');
    try {
      await processManager.restartDevServer(project);
    } catch (err) {
      console.log(`[Orchestrator] [Context] Dev server restart failed: ${err}`);
    }

    // Step 4: Collect dev server logs (recent output)
    const devLogs = logAggregator.getLogsByType(project, 'devServer', 100);
    context.devServerLogs = devLogs.map(l => l.text).join('\n');

    // Step 5: Health check
    console.log(`[Orchestrator] [Context] Health check for ${project}...`);
    statusMonitor.updateStatus(project, 'WORKING', 'Checking dev server health...');
    const health = await processManager.checkDevServerHealthWithRetry(project, 5, 2000);
    context.healthCheck = {
      healthy: health.healthy,
      error: health.error
    };

    console.log(`[Orchestrator] [Context] Collection complete for ${project}. Health: ${health.healthy ? 'OK' : 'FAILED'}`);
    return context;
  };

  // Helper to check and trigger E2E for a project (queues the request)
  const tryTriggerE2E = async (project: string, message: string) => {
    const session = sessionManager.getCurrentSession();
    const projectConfig = config.projects[project];

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

    // Check if this project's E2E tests need to wait for other projects
    // E2E tests wait for any project that this project's tasks depend on
    const projectDependencies = new Set<string>();

    // Collect dependencies: if any task for THIS project depends on a task from another project,
    // wait for that other project's E2E to complete
    for (const task of session.plan.tasks) {
      if (task.project === project) {
        for (const depIndex of task.dependencies) {
          // Get the project of the dependency task
          const depTask = session.plan.tasks[depIndex];
          if (depTask && depTask.project !== project && session.projects.includes(depTask.project)) {
            projectDependencies.add(depTask.project);
          }
        }
      }
    }

    // Check if any dependencies are not yet complete (IDLE)
    const waitingOn: string[] = [];
    for (const dep of projectDependencies) {
      const depStatus = statusMonitor.getStatus(dep);
      if (depStatus?.status !== 'IDLE') {
        waitingOn.push(dep);
      }
    }

    if (waitingOn.length > 0) {
      console.log(`[Orchestrator] ${project} E2E waiting for: ${waitingOn.join(', ')}`);
      pendingE2E.set(project, { message, waitingOn });
      return;
    }

    // No pre-E2E verification needed - all tasks for this project already passed verification
    const devServerUrl = getDevServerUrl(project);

    // Check if project has custom E2E instructions
    if (projectConfig?.e2eInstructions) {
      console.log(`[Orchestrator] Using custom E2E instructions for ${project}`);

      // Build E2E prompt from custom instructions
      const e2ePrompt = `# E2E Testing for ${project}

Dev Server URL: ${devServerUrl}

## CRITICAL RULES - YOU MUST FOLLOW THESE
1. DO NOT start, build, or restart any servers - the orchestrator manages all servers
2. DO NOT run npm install, npm run build, npm run dev, or similar commands
3. The dev server is ALREADY RUNNING at the URL above - just run tests against it
4. If the server is not responding, FAIL the tests and report the error - DO NOT try to fix it
5. Your ONLY job is to run E2E tests and report results

## Custom Testing Instructions

${projectConfig.e2eInstructions}

## Test Scenarios to Verify
${session.plan.testPlan[project].map((s, i) => `${i + 1}. ${s}`).join('\n')}

**IMPORTANT**: Output TEST STATUS MARKERS for real-time tracking:
- Before each test: [TEST_STATUS] {"scenario": "exact scenario text", "status": "running"}
- After passing: [TEST_STATUS] {"scenario": "exact scenario text", "status": "passed"}
- After failing: [TEST_STATUS] {"scenario": "exact scenario text", "status": "failed", "error": "brief error description"}`;

      // Execute E2E directly without going through Planning Agent
      await actionExecutor.execute({ type: 'send_e2e', project, prompt: e2ePrompt });
      return;
    }

    // Queue E2E prompt request - will be processed when Planning Agent is free
    console.log(`[Orchestrator] Queueing E2E prompt request for ${project}`);
    eventQueue.add({
      type: 'e2e_prompt_request',
      project,
      taskSummary: message,
      testScenarios: session.plan.testPlan[project],
      devServerUrl
    });
  };

  // Helper to check pending E2E when a project becomes IDLE
  const checkPendingE2E = async (completedProject: string) => {
    for (const [waitingProject, { message, waitingOn }] of pendingE2E) {
      if (waitingOn.includes(completedProject)) {
        // Remove the completed project from waitingOn
        const remaining = waitingOn.filter(p => p !== completedProject);
        if (remaining.length === 0) {
          // All dependencies satisfied, trigger E2E
          console.log(`[Orchestrator] ${waitingProject} dependencies satisfied, triggering E2E`);
          pendingE2E.delete(waitingProject);

          // Use tryTriggerE2E which includes health checks
          await tryTriggerE2E(waitingProject, message);
        } else {
          pendingE2E.set(waitingProject, { message, waitingOn: remaining });
        }
      }
    }
  };

  // Container for runTask function reference (set during execution start)
  const taskRunner: { fn: ((task: TaskDefinition, taskIndex: number) => Promise<void>) | null } = { fn: null };

  // Helper to check pending tasks when a task completes
  const checkPendingTasks = async (completedTaskIndex: number) => {
    completedTasks.add(completedTaskIndex);
    const tasksToStart: Array<{ task: TaskDefinition; taskIndex: number }> = [];

    for (const [taskIndex, pending] of pendingTasks) {
      if (pending.waitingOn.includes(completedTaskIndex)) {
        // Remove the completed task from waitingOn
        const remaining = pending.waitingOn.filter(i => !completedTasks.has(i));
        if (remaining.length === 0) {
          // All dependencies satisfied, queue for execution
          console.log(`[Orchestrator] Task #${taskIndex} (${pending.task.project}) dependencies satisfied, starting`);
          pendingTasks.delete(taskIndex);
          tasksToStart.push({ task: pending.task, taskIndex });

          // Update task status
          statusMonitor.updateTaskStatus(taskIndex, 'working', 'Dependencies satisfied, starting...');
        } else {
          pendingTasks.set(taskIndex, { ...pending, waitingOn: remaining });
          statusMonitor.updateTaskStatus(taskIndex, 'waiting', `Waiting on tasks: ${remaining.join(', ')}`, remaining);
        }
      }
    }

    // Start unblocked tasks - only one per project at a time
    if (tasksToStart.length > 0 && taskRunner.fn) {
      // Group by project - only start one task per project
      const tasksByProject = new Map<string, { task: TaskDefinition; taskIndex: number }[]>();
      for (const t of tasksToStart) {
        const existing = tasksByProject.get(t.task.project) || [];
        existing.push(t);
        tasksByProject.set(t.task.project, existing);
      }

      // Take only the first task from each project
      const tasksToRun: { task: TaskDefinition; taskIndex: number }[] = [];
      const deferredTasks: { task: TaskDefinition; taskIndex: number }[] = [];

      for (const [_project, tasks] of tasksByProject) {
        tasksToRun.push(tasks[0]); // First task runs now
        if (tasks.length > 1) {
          // Put remaining tasks back in pending
          for (let i = 1; i < tasks.length; i++) {
            deferredTasks.push(tasks[i]);
          }
        }
      }

      // Put deferred tasks back into pendingTasks
      for (const { task, taskIndex } of deferredTasks) {
        console.log(`[Orchestrator] Deferring task #${taskIndex} (${task.project}) - another task for same project is running`);
        pendingTasks.set(taskIndex, { task, taskIndex, waitingOn: [] });
        statusMonitor.updateTaskStatus(taskIndex, 'waiting', 'Waiting for other task on same project');
      }

      console.log(`[Orchestrator] Starting ${tasksToRun.length} unblocked tasks (${deferredTasks.length} deferred)`);
      await Promise.all(tasksToRun.map(({ task, taskIndex }) => taskRunner.fn!(task, taskIndex)));
    }
  };

  // Helper to check if all remaining tasks are blocked by failures
  const checkAllTasksFailed = (tasks: TaskDefinition[]) => {
    // If no tasks or no pending tasks, nothing to check
    if (tasks.length === 0 || pendingTasks.size === 0) {
      return;
    }

    // Check if any tasks are still in progress (not completed, not failed, not pending)
    const inProgressTasks = tasks.filter((_task, idx) =>
      !completedTasks.has(idx) && !failedTasks.has(idx) && !pendingTasks.has(idx)
    );

    if (inProgressTasks.length > 0) {
      // Some tasks are still running, don't declare stuck yet
      return;
    }

    // Check if all pending tasks are blocked by failed tasks
    let allBlocked = true;
    for (const [_taskIdx, pending] of pendingTasks) {
      // Check if any of the waiting-on tasks are not failed (still possible to complete)
      const hasNonFailedDep = pending.waitingOn.some(depIdx =>
        !failedTasks.has(depIdx) && !completedTasks.has(depIdx)
      );
      if (hasNonFailedDep) {
        allBlocked = false;
        break;
      }
      // All dependencies are either failed or this shouldn't be pending
      // If all deps are complete but task is still pending, it will be started soon
      const allDepsComplete = pending.waitingOn.every(depIdx => completedTasks.has(depIdx));
      if (allDepsComplete) {
        allBlocked = false;
        break;
      }
    }

    if (allBlocked && pendingTasks.size > 0 && failedTasks.size > 0) {
      console.error('[Orchestrator] Execution stuck: all remaining tasks blocked by failures');
      const failedTaskNames = Array.from(failedTasks)
        .map(idx => `#${idx} (${tasks[idx]?.name || 'unknown'})`)
        .join(', ');
      const pendingTaskNames = Array.from(pendingTasks.keys())
        .map(idx => `#${idx} (${tasks[idx]?.name || 'unknown'})`)
        .join(', ');

      const message = `Execution stuck: ${failedTasks.size} task(s) failed [${failedTaskNames}], blocking ${pendingTasks.size} pending task(s) [${pendingTaskNames}]`;
      chatHandler.systemMessage(message);
      (ui.io as any).emit('executionStuck', {
        failedTasks: Array.from(failedTasks),
        pendingTasks: Array.from(pendingTasks.keys()),
        completedTasks: Array.from(completedTasks),
        message
      });
    }
  };

  statusMonitor.on('projectReady', async ({ project, message }) => {
    console.log(`[Orchestrator] ${project} is READY: ${message}`);
    await tryTriggerE2E(project, message);
  });

  // Listen for task completion to check pending task dependencies
  statusMonitor.on('taskComplete', async ({ taskIndex, project }) => {
    console.log(`[Orchestrator] Task #${taskIndex} (${project}) completed, checking pending tasks`);
    await checkPendingTasks(taskIndex);
  });

  statusMonitor.on('statusChange', async ({ project, status }) => {
    // When a project becomes IDLE (E2E complete), check if any pending E2E can start
    if (status === 'IDLE') {
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

  // Forward streaming events to UI for agentic chat
  // Also persist chat messages on message_complete
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
        // All messages to Planning Agent go through the queue for consistency
        // Queue handles busy check and sequential processing
        eventQueue.add({ type: 'user_chat', message });
      }
    });

    // Handle session creation request
    socket.on('startSession', async ({ feature, projects }: { feature: string; projects: string[] }) => {
      try {
        // Create session
        const session = sessionManager.createSession(feature, projects);

        // Set current session ID on StatusMonitor and LogAggregator for persistence
        statusMonitor.setCurrentSessionId(session.id);
        logAggregator.setCurrentSessionId(session.id);

        // Create session logger for debugging
        sessionLogger = new SessionLogger(ORCHESTRATOR_DIR, session.id);
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
      // Initialize task tracking and broadcast to all clients
      statusMonitor.initializeTasks(plan.tasks);
      (ui.io as any).emitTaskStates(statusMonitor.getAllTaskStates());
      // Send updated session to UI so session.plan is set
      const updatedSession = sessionManager.getCurrentSession();
      if (updatedSession) {
        (ui.io as any).emitSession(updatedSession);
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

      // Check for circular dependencies before starting
      const cycleResult = detectCycles(session.plan.tasks);
      if (cycleResult.hasCycle) {
        console.error('[Orchestrator] Circular dependency detected:', cycleResult.message);
        chatHandler.systemMessage(`Cannot start execution: ${cycleResult.message}`);
        (ui.io as any).emit('executionError', {
          type: 'circular_dependency',
          message: cycleResult.message,
          cycle: cycleResult.cycle
        });
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
          // Don't update status to IDLE here - it triggers allComplete check prematurely
          console.log(`[Orchestrator] Starting dev server for ${project}...`);
          await processManager.startDevServer(project);
        } catch (err) {
          console.error(`[Orchestrator] Failed to start dev server for ${project}:`, err);
          statusMonitor.updateStatus(project, 'FATAL_DEBUGGING', `Dev server failed: ${err}`);
        }
      }

      // Start ALL agents in parallel - they can code simultaneously
      // Dependencies only matter for E2E testing (handled separately in tryTriggerE2E)
      const tasks = session.plan.tasks;

      // Handle case where there are no tasks (alreadyImplemented: true)
      // Projects without tasks should go straight to READY (triggers E2E) or IDLE (if no E2E tests)
      if (tasks.length === 0) {
        console.log('[Orchestrator] No tasks to execute - feature already implemented');
        chatHandler.systemMessage('Feature already implemented. Running E2E tests...');

        for (const project of session.projects) {
          // Set to READY which will trigger tryTriggerE2E via the projectReady event
          statusMonitor.updateStatus(project, 'READY', 'No implementation needed');
        }
        return;
      }

      // Find projects that have no tasks assigned but are in the session
      // These should also go straight to READY/E2E
      const projectsWithTasks = new Set(tasks.map(t => t.project));
      for (const project of session.projects) {
        if (!projectsWithTasks.has(project)) {
          console.log(`[Orchestrator] ${project} has no tasks - marking as READY`);
          statusMonitor.updateStatus(project, 'READY', 'No implementation needed');
        }
      }

      // Track pending tasks per project to avoid setting READY prematurely
      // when multiple tasks for the same project run in parallel
      const pendingTasksPerProject: Map<string, number> = new Map();
      for (const task of tasks) {
        const current = pendingTasksPerProject.get(task.project) || 0;
        pendingTasksPerProject.set(task.project, current + 1);
      }

      // Define runTask with taskIndex parameter for task-level tracking
      // Includes verification loop: agent runs → collect context → Planning Agent analyzes → if fail, agent fixes
      const runTask = async (task: TaskDefinition, taskIndex: number) => {
        const sessionDir = sessionManager.getSessionDir(task.project);
        if (!sessionDir) return;

        const devServerUrl = getDevServerUrl(task.project);
        const MAX_FIX_ATTEMPTS = 3;
        let fixAttempts = 0;
        let taskCompleted = false;

        // Build initial task prompt with critical instructions
        const buildTaskPrompt = (basePrompt: string): string => {
          let prompt = basePrompt;

          // Add dev server URL info
          prompt += `\n\n**DEV SERVER**: The dev server for this project is running at: ${devServerUrl}`;

          // Add critical rules that agents must follow
          prompt += `\n\n**CRITICAL RULES - YOU MUST FOLLOW THESE**:
1. DO NOT write any tests (unit tests, Jest tests, integration tests, etc.) - testing is handled separately by the orchestrator
2. DO NOT start dev servers (npm start, npm run dev, etc.) - the orchestrator already manages dev servers
3. DO NOT run npm install - the orchestrator handles dependency installation
4. DO NOT use browser automation tools (Playwright, browser_*, mcp__playwright__*) to test or verify your work - the orchestrator handles all testing
5. Focus ONLY on implementing the feature code - write the code and nothing else`;

          return prompt;
        };

        let currentPrompt = buildTaskPrompt(task.task);
        const originalTaskDescription = task.task;

        statusMonitor.updateStatus(task.project, 'WORKING', 'Starting agent task...');
        stateMachine.markAgentActive(task.project);

        try {
          // Verification loop: run agent → verify → fix if needed
          while (fixAttempts < MAX_FIX_ATTEMPTS && !taskCompleted) {
            // Update status based on whether this is initial run or fix attempt
            if (fixAttempts === 0) {
              statusMonitor.updateTaskStatus(taskIndex, 'working', 'Agent implementing...');
            } else {
              statusMonitor.updateTaskStatus(taskIndex, 'fixing',
                `Fixing errors (attempt ${fixAttempts}/${MAX_FIX_ATTEMPTS})`);
            }

            // Run the agent
            try {
              await processManager.startAgent(task.project, sessionDir, currentPrompt);
            } catch (agentErr) {
              console.error(`[Orchestrator] Agent error for task #${taskIndex}:`, agentErr);
              // Agent itself failed - this is a hard failure
              throw agentErr;
            }

            // Agent completed - collect verification context and let Planning Agent analyze
            statusMonitor.updateTaskStatus(taskIndex, 'verifying', 'Collecting context for analysis...');
            console.log(`[Orchestrator] Task #${taskIndex} agent done, collecting verification context...`);

            // Collect all context: deps, build output, dev server logs, health check
            const verificationContext = await collectVerificationContext(
              task.project,
              task.name,
              originalTaskDescription
            );

            // Let Planning Agent intelligently analyze all context
            statusMonitor.updateTaskStatus(taskIndex, 'verifying', 'Planning Agent analyzing results...');
            console.log(`[Orchestrator] Task #${taskIndex} sending context to Planning Agent for analysis...`);
            const analysis = await planningAgent.analyzeTaskResult(verificationContext);

            if (analysis.passed) {
              // Planning Agent determined task is complete!
              console.log(`[Orchestrator] Task #${taskIndex} PASSED: ${analysis.analysis}`);
              taskCompleted = true;
              break;
            }

            // Planning Agent determined task needs fixes
            fixAttempts++;
            console.log(`[Orchestrator] Task #${taskIndex} FAILED: ${analysis.analysis}`);
            console.log(`[Orchestrator] Suggested action: ${analysis.suggestedAction}`);

            if (fixAttempts >= MAX_FIX_ATTEMPTS || analysis.suggestedAction === 'escalate') {
              // Max attempts reached or Planning Agent says to escalate
              console.error(`[Orchestrator] Task #${taskIndex} failed after ${fixAttempts} attempts`);
              statusMonitor.updateTaskStatus(taskIndex, 'failed', analysis.analysis);
              failedTasks.add(taskIndex);
              statusMonitor.updateStatus(task.project, 'FATAL_DEBUGGING', analysis.analysis);
              checkAllTasksFailed(tasks);
              return;
            }

            if (analysis.suggestedAction === 'skip') {
              // Planning Agent says issue is minor, mark as complete anyway
              console.log(`[Orchestrator] Task #${taskIndex} - Planning Agent suggests skipping issue`);
              taskCompleted = true;
              break;
            }

            // Use Planning Agent's intelligent fix prompt
            statusMonitor.updateTaskStatus(taskIndex, 'fixing', `Fix attempt ${fixAttempts}/${MAX_FIX_ATTEMPTS}`);
            currentPrompt = analysis.fixPrompt || `## FIX REQUIRED

Your previous implementation for task "${task.name}" has issues.

**Problem:** ${analysis.analysis}

**Original Task:**
${originalTaskDescription}

Please fix the issue and try again.`;
            console.log(`[Orchestrator] Asking agent to fix (attempt ${fixAttempts}/${MAX_FIX_ATTEMPTS})`);
          }

          if (taskCompleted) {
            // Mark task as completed (this emits taskComplete event which triggers checkPendingTasks)
            statusMonitor.updateTaskStatus(taskIndex, 'completed', 'Task completed and verified');

            // Decrement pending task count for this project
            const remaining = (pendingTasksPerProject.get(task.project) || 1) - 1;
            pendingTasksPerProject.set(task.project, remaining);

            // Only set READY when ALL tasks for this project are complete
            if (remaining === 0) {
              statusMonitor.updateStatus(task.project, 'READY', 'All tasks completed');
            } else {
              console.log(`[Orchestrator] ${task.project} task completed, ${remaining} task(s) remaining`);
            }
          }
        } catch (err) {
          console.error(`[Orchestrator] Task #${taskIndex} (${task.project}) failed:`, err);
          statusMonitor.updateTaskStatus(taskIndex, 'failed', `Task failed: ${err}`);
          failedTasks.add(taskIndex);
          statusMonitor.updateStatus(task.project, 'FATAL_DEBUGGING', `Task failed: ${err}`);
          checkAllTasksFailed(tasks);
        } finally {
          stateMachine.markAgentIdle(task.project);
        }
      };

      // Store runTask reference for checkPendingTasks to use
      taskRunner.fn = runTask;

      // ═══════════════════════════════════════════════════════════════
      // Dependency-aware task execution (task-to-task dependencies)
      // ═══════════════════════════════════════════════════════════════

      // Partition tasks: ready (no deps) vs waiting (has deps)
      const readyTasks: Array<{ task: TaskDefinition; taskIndex: number }> = [];
      const waitingTasksByProject: Map<string, number[]> = new Map();

      tasks.forEach((task, taskIndex) => {
        // Debug: Log task dependencies
        console.log(`[Orchestrator] Task #${taskIndex} (${task.project}:${task.name}) dependencies: ${JSON.stringify(task.dependencies)}`);

        // Filter to valid dependencies (task indices that haven't completed yet)
        const validDeps = task.dependencies.filter(depIndex => {
          // Check if dependency index is valid
          if (depIndex < 0 || depIndex >= tasks.length) {
            console.warn(`[Orchestrator]   Invalid dependency index ${depIndex} for task #${taskIndex}`);
            return false;
          }
          // Check if dependency task is already completed
          const isCompleted = completedTasks.has(depIndex);
          console.log(`[Orchestrator]   Dep task #${depIndex}: completed=${isCompleted}`);
          return !isCompleted;
        });

        if (validDeps.length === 0) {
          readyTasks.push({ task, taskIndex });
          statusMonitor.updateTaskStatus(taskIndex, 'pending', 'Ready to start');
        } else {
          // Queue as pending task
          pendingTasks.set(taskIndex, { task, taskIndex, waitingOn: validDeps });
          statusMonitor.updateTaskStatus(taskIndex, 'waiting', `Waiting on tasks: ${validDeps.join(', ')}`, validDeps);

          // Track that this project has waiting tasks
          const projectWaiting = waitingTasksByProject.get(task.project) || [];
          projectWaiting.push(taskIndex);
          waitingTasksByProject.set(task.project, projectWaiting);

          console.log(`[Orchestrator] Task #${taskIndex} (${task.project}) waiting on tasks: ${validDeps.join(', ')}`);
        }
      });

      // Set BLOCKED status for projects where ALL tasks are waiting
      for (const [project, waitingIndices] of waitingTasksByProject) {
        const projectTaskCount = tasks.filter(t => t.project === project).length;
        if (waitingIndices.length === projectTaskCount) {
          // All tasks for this project are waiting on dependencies
          statusMonitor.updateStatus(project, 'BLOCKED', 'Waiting on dependencies');
        }
      }

      // Start ready tasks - only one per project at a time
      if (readyTasks.length > 0) {
        // Group by project - only start one task per project
        const tasksByProject = new Map<string, { task: TaskDefinition; taskIndex: number }[]>();
        for (const t of readyTasks) {
          const existing = tasksByProject.get(t.task.project) || [];
          existing.push(t);
          tasksByProject.set(t.task.project, existing);
        }

        // Take only the first task from each project
        const tasksToRun: { task: TaskDefinition; taskIndex: number }[] = [];

        for (const [_project, projectTasks] of tasksByProject) {
          tasksToRun.push(projectTasks[0]); // First task runs now
          if (projectTasks.length > 1) {
            // Put remaining tasks in pending (with no deps, they'll start when current task finishes)
            for (let i = 1; i < projectTasks.length; i++) {
              const { task, taskIndex } = projectTasks[i];
              console.log(`[Orchestrator] Deferring task #${taskIndex} (${task.project}) - another task for same project starting first`);
              pendingTasks.set(taskIndex, { task, taskIndex, waitingOn: [] });
              statusMonitor.updateTaskStatus(taskIndex, 'waiting', 'Waiting for other task on same project');
            }
          }
        }

        console.log(`[Orchestrator] Starting ${tasksToRun.length} tasks immediately: ${tasksToRun.map(t => `#${t.taskIndex}(${t.task.project})`).join(', ')}`);
        await Promise.all(tasksToRun.map(({ task, taskIndex }) => runTask(task, taskIndex)));
      }

      if (pendingTasks.size > 0) {
        console.log(`[Orchestrator] ${pendingTasks.size} tasks waiting on dependencies`);
      }

      chatHandler.systemMessage('Agents started. Monitoring progress...');
    });

    // Handle pause request
    socket.on('pause', () => {
      if (stateMachine.getState() === 'RUNNING') {
        eventQueue.pause();
        chatHandler.systemMessage('Pausing... waiting for agents to reach idle state.');
      }
    });

    // Handle resume request
    socket.on('resume', () => {
      if (stateMachine.getState() === 'PAUSED') {
        eventQueue.resume();
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

    // Install dependencies for a project
    socket.on('installDependencies', async ({ name }: { name: string }) => {
      try {
        await projectManager.installDependencies(name);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[Orchestrator] dependency install failed:`, error);
        // Error event already emitted by projectManager
      }
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
        sessionLogger = new SessionLogger(ORCHESTRATOR_DIR, sessionId);

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
    socket.on('stopSession', ({ sessionId }: { sessionId: string }) => {
      try {
        const currentSession = sessionManager.getCurrentSession();
        if (!currentSession || currentSession.id !== sessionId) {
          socket.emit('stopSessionError', { sessionId, error: 'Session not active' });
          return;
        }

        // Mark session as interrupted
        sessionManager.markSessionInterrupted();

        // Stop all processes
        processManager.stopAll();

        // Stop file watchers
        eventWatcher.stopAll();

        // Emit success
        socket.emit('sessionStopped', { sessionId });

        // Send updated session list to all clients
        (ui.io as any).emit('sessionList', sessionManager.listSessions());

        console.log(`[Orchestrator] Session ${sessionId} stopped`);
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
  console.log('  Open http://localhost:3456 to get started');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Status summary:');
  console.log(statusMonitor.getSummary());
}

// Run
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
