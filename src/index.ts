import * as fs from 'fs';
import * as path from 'path';
import { Config, Plan, HookEvent, LogEntry, OrchestratorEvent, TaskDefinition, StreamingMessage, ContentBlock } from './types';
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

  // Handle user chat events from queue
  eventQueue.on('userChat', async ({ message }: { message: string }) => {
    try {
      await chatHandler.handleUserMessage(message);
      // After message completes, check if there are queued messages to process
      eventQueue.triggerProcessing();
    } catch (err) {
      console.error('[Orchestrator] Error handling user chat:', err);
      eventQueue.triggerProcessing();
    }
  });

  // Handle E2E prompt requests from queue
  eventQueue.on('e2ePromptRequest', async ({ project, taskSummary, testScenarios }: {
    project: string;
    taskSummary: string;
    testScenarios: string[];
  }) => {
    try {
      const e2ePrompt = await chatHandler.requestE2EPrompt(project, taskSummary, testScenarios);
      if (e2ePrompt && e2ePrompt.trim()) {
        console.log(`[Orchestrator] Executing E2E for ${project} (prompt: ${e2ePrompt.length} chars)`);
        await actionExecutor.execute({ type: 'send_e2e', project, prompt: e2ePrompt });
      } else {
        console.warn(`[Orchestrator] No E2E prompt generated for ${project}`);
      }
    } catch (err) {
      console.error(`[Orchestrator] E2E prompt request failed for ${project}:`, err);
    }
    eventQueue.triggerProcessing();
  });

  // Handle failure analysis requests from queue
  eventQueue.on('failureAnalysis', async ({ project, error, context }: {
    project: string;
    error: string;
    context: string[];
  }) => {
    try {
      await chatHandler.requestFailureAnalysis(project, error, context);
    } catch (err) {
      console.error(`[Orchestrator] Failure analysis failed for ${project}:`, err);
    }
    eventQueue.triggerProcessing();
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
  eventQueue.on('e2eComplete', async ({ project, result, testScenarios, devServerLogs, allProjects }: {
    project: string;
    result: string;
    testScenarios: string[];
    devServerLogs: string;
    allProjects: string[];
  }) => {
    try {
      // Ask Planning Agent to analyze the E2E results
      const analysis = await chatHandler.analyzeE2EResult(project, result, testScenarios, devServerLogs, allProjects);

      if (analysis.passed) {
        // E2E passed! Mark as complete
        console.log(`[Orchestrator] E2E tests PASSED for ${project}`);
        statusMonitor.updateStatus(project, 'IDLE', 'E2E tests passed');
        e2eRetryCount.delete(project); // Reset retry count on success
      } else {
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
          try {
            // Send fixes to all targeted projects in parallel
            const fixPromises = analysis.fixes.map(async (fix) => {
              const targetProject = fix.project;
              const fixPrompt = `The E2E tests for ${project} failed. Analysis: ${analysis.analysis}

You need to fix the following in ${targetProject}:
${fix.prompt}

After fixing, the E2E tests will be re-run automatically.`;

              console.log(`[Orchestrator] Sending fix to ${targetProject} (E2E failed in ${project})`);
              statusMonitor.updateStatus(targetProject, 'E2E_FIXING', `Fixing issues from ${project} E2E`);
              await actionExecutor.sendE2EFix(targetProject, fixPrompt);
            });

            await Promise.all(fixPromises);

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
          } catch (err) {
            console.error(`[Orchestrator] E2E fix failed:`, err);
            statusMonitor.updateStatus(project, 'BLOCKED', 'E2E fix failed');
          }
        } else if (analysis.fixPrompt) {
          // Legacy: single project fix
          const fixPrompt = `The E2E tests failed with the following issues:

${analysis.analysis}

Please fix these issues:
${analysis.fixPrompt}

After fixing, the E2E tests will be re-run automatically.`;

          try {
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
          } catch (err) {
            console.error(`[Orchestrator] E2E fix failed for ${project}:`, err);
            statusMonitor.updateStatus(project, 'BLOCKED', 'E2E fix failed');
          }
        } else {
          // No fix prompt available, mark as blocked
          statusMonitor.updateStatus(project, 'BLOCKED', 'E2E failed, no fix available');
        }
      }
    } catch (err) {
      console.error(`[Orchestrator] E2E analysis failed for ${project}:`, err);
      // On analysis error, mark as blocked
      statusMonitor.updateStatus(project, 'BLOCKED', 'E2E analysis failed');
    }
    // Trigger processing of next queued event
    eventQueue.triggerProcessing();
  });

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

  // Track projects waiting for E2E (waiting on dependencies)
  const pendingE2E: Map<string, { message: string; waitingOn: string[] }> = new Map();

  // Helper to get dev server URL for a project
  const getDevServerUrl = (project: string): string => {
    const projectConfig = config.projects[project];
    if (projectConfig?.devServer?.port) {
      return `http://localhost:${projectConfig.devServer.port}`;
    }
    // Default: frontend projects use 5173, backend uses 3000
    const isFrontend = project.toLowerCase().includes('frontend');
    return isFrontend ? 'http://localhost:5173' : 'http://localhost:3000';
  };

  // Helper to check and trigger E2E for a project (queues the request)
  const tryTriggerE2E = async (project: string, message: string) => {
    const session = sessionManager.getCurrentSession();

    // If no test plan for this project, mark as IDLE (complete) immediately
    if (!session?.plan?.testPlan?.[project] || session.plan.testPlan[project].length === 0) {
      console.log(`[Orchestrator] ${project} has no E2E tests, marking as complete`);
      statusMonitor.updateStatus(project, 'IDLE', 'No E2E tests configured');
      // This will trigger checkPendingE2E via the statusChange event
      return;
    }

    // Check if frontend needs to wait for backend
    // Frontend E2E tests typically need backend to be running and ready
    const isFrontend = project.toLowerCase().includes('frontend');
    const backendProject = session.projects.find(p => p.toLowerCase().includes('backend'));

    if (isFrontend && backendProject) {
      const backendStatus = statusMonitor.getStatus(backendProject);
      if (backendStatus?.status !== 'IDLE') {
        // Backend not done yet, queue frontend E2E
        console.log(`[Orchestrator] ${project} waiting for ${backendProject} to complete E2E first`);
        pendingE2E.set(project, { message, waitingOn: [backendProject] });
        return;
      }
    }

    // Health check before E2E - verify dev server is actually responding
    console.log(`[Orchestrator] Running health check for ${project} before E2E...`);
    const health = await processManager.checkDevServerHealthWithRetry(project, 3, 2000);

    if (!health.healthy) {
      console.log(`[Orchestrator] Dev server unhealthy for ${project}: ${health.error}`);
      console.log(`[Orchestrator] Attempting restart for ${project}...`);

      try {
        await processManager.restartDevServer(project);

        // Re-check health after restart
        const retryHealth = await processManager.checkDevServerHealthWithRetry(project, 3, 2000);
        if (!retryHealth.healthy) {
          console.error(`[Orchestrator] Dev server still unhealthy after restart for ${project}`);
          statusMonitor.updateStatus(project, 'FATAL_DEBUGGING',
            `Dev server failed health check: ${retryHealth.error}`);
          return;
        }

        console.log(`[Orchestrator] Dev server for ${project} recovered after restart`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[Orchestrator] Failed to restart dev server for ${project}:`, err);
        statusMonitor.updateStatus(project, 'FATAL_DEBUGGING', `Dev server restart failed: ${errorMsg}`);
        return;
      }
    }

    // Queue E2E prompt request - will be processed when Planning Agent is free
    console.log(`[Orchestrator] Queueing E2E prompt request for ${project}`);
    eventQueue.add({
      type: 'e2e_prompt_request',
      project,
      taskSummary: message,
      testScenarios: session.plan.testPlan[project],
      devServerUrl: getDevServerUrl(project)
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

  statusMonitor.on('projectReady', async ({ project, message }) => {
    console.log(`[Orchestrator] ${project} is READY: ${message}`);
    await tryTriggerE2E(project, message);
  });

  statusMonitor.on('statusChange', async ({ project, status }) => {
    // When a project becomes IDLE (E2E complete), check if any pending E2E can start
    if (status === 'IDLE') {
      await checkPendingE2E(project);
    }
  });

  statusMonitor.on('fatalRecovery', ({ project }) => {
    console.log(`[Orchestrator] ${project} reports FATAL_RECOVERY, restarting dev server`);
    processManager.restartDevServer(project).catch(err => {
      console.error(`[Orchestrator] Failed to restart ${project}:`, err);
    });
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

      const runTask = async (task: TaskDefinition) => {
        const sessionDir = sessionManager.getSessionDir(task.project);
        if (!sessionDir) return;

        const projectConfig = config.projects[task.project];

        // Build task prompt with critical instructions
        let taskPrompt = task.task;

        // Add critical rules that agents must follow
        taskPrompt += `\n\n**CRITICAL RULES - YOU MUST FOLLOW THESE**:
1. DO NOT write any tests (unit tests, Jest tests, integration tests, etc.) - testing is handled separately
2. DO NOT start dev servers (npm start, npm run dev, etc.) - the orchestrator already manages dev servers
3. Focus ONLY on implementing the feature code`;

        // Append build requirement if buildCommand is configured
        if (projectConfig?.buildCommand) {
          taskPrompt += `\n\n**BUILD REQUIREMENT**: Before completing this task, you MUST run the build command and ensure it passes:
\`\`\`bash
${projectConfig.buildCommand}
\`\`\`
Do NOT mark this task as complete until the build passes without errors.`;
        }

        statusMonitor.updateStatus(task.project, 'WORKING', 'Starting agent task...');
        stateMachine.markAgentActive(task.project);

        try {
          await processManager.startAgent(task.project, sessionDir, taskPrompt);

          // Decrement pending task count for this project
          const remaining = (pendingTasksPerProject.get(task.project) || 1) - 1;
          pendingTasksPerProject.set(task.project, remaining);

          // Only set READY when ALL tasks for this project are complete
          if (remaining === 0) {
            statusMonitor.updateStatus(task.project, 'READY', 'All tasks completed');
          } else {
            console.log(`[Orchestrator] ${task.project} task completed, ${remaining} task(s) remaining`);
          }
        } catch (err) {
          console.error(`[Orchestrator] Task ${task.project} failed:`, err);
          statusMonitor.updateStatus(task.project, 'FATAL_DEBUGGING', `Task failed: ${err}`);
        } finally {
          stateMachine.markAgentIdle(task.project);
        }
      };

      // Run all tasks in parallel - planning agent already gave each agent the full context
      console.log(`[Orchestrator] Starting ${tasks.length} tasks in parallel: ${tasks.map(t => t.project).join(', ')}`);
      await Promise.all(tasks.map(runTask))

      chatHandler.systemMessage('All agents started. Monitoring progress...');
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

    // Load a specific session
    socket.on('loadSession', ({ sessionId }: { sessionId: string }) => {
      try {
        // Check if this session is the currently active one
        const currentSession = sessionManager.getCurrentSession();
        const isActiveSession = currentSession?.id === sessionId;

        // For viewing (not activating), just get the data without modifying state
        const fullData = sessionStore.getFullSessionData(sessionId);
        if (!fullData) {
          socket.emit('loadSessionError', { error: 'Session not found' });
          return;
        }

        // Only update monitors/watchers if this is NOT an active session view request
        // (active sessions already have these set up)
        if (!isActiveSession) {
          // Set current session ID on StatusMonitor and LogAggregator for viewing
          statusMonitor.setCurrentSessionId(sessionId);
          logAggregator.setCurrentSessionId(sessionId);

          // Restore statuses and logs to in-memory stores
          statusMonitor.restoreStatuses(fullData.session.statuses);
          logAggregator.restoreLogs(fullData.logs);

          // Initialize event watchers for each project
          for (const project of fullData.session.projects) {
            const sessionDir = sessionManager.getSessionDir(project);
            if (sessionDir) {
              eventWatcher.watchProject(project, sessionDir);
            }
          }

          // Create session logger
          sessionLogger = new SessionLogger(ORCHESTRATOR_DIR, sessionId);
        }

        // Send full session data to client (include pending plan and active status)
        socket.emit('sessionLoaded', {
          ...fullData,
          pendingPlan: fullData.session.pendingPlan,
          isActive: isActiveSession,
        });

        console.log(`[Orchestrator] Session ${sessionId} loaded (active: ${isActiveSession})`);
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
