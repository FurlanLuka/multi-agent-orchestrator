import * as fs from 'fs';
import * as path from 'path';
import { Config, Plan, HookEvent, LogEntry, OrchestratorEvent } from './types';
import { SessionManager } from './core/session-manager';
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
  const sessionManager = new SessionManager(config, ORCHESTRATOR_DIR);
  const processManager = new ProcessManager(config);
  const projectManager = new ProjectManager(configPath, config, ORCHESTRATOR_DIR);
  const eventWatcher = new EventWatcher();
  const statusMonitor = new StatusMonitor();
  const approvalQueue = new ApprovalQueue(true); // UI mode
  const logAggregator = new LogAggregator();

  // Initialize state machine and new event-driven components
  const stateMachine = new StateMachine();
  const planningAgent = new PlanningAgentManager(ORCHESTRATOR_DIR);
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

  processManager.on('ready', ({ project, type }) => {
    console.log(`[Orchestrator] ${project} ${type} is ready`);
    if (type === 'devServer') {
      statusMonitor.updateStatus(project, 'IDLE', 'Dev server ready');
    }
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

    // Ask Planning Agent for debugging guidance
    chatHandler.requestFailureAnalysis(
      project,
      `${type} crashed ${crashCount} times`,
      recentLogs
    );
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

  // Handle E2E completion - analyze results and decide next step
  actionExecutor.on('e2eComplete', async ({ project, result }) => {
    console.log(`[Orchestrator] E2E completed for ${project}, analyzing results...`);

    const session = sessionManager.getCurrentSession();
    const testScenarios = session?.plan?.testPlan?.[project] || [];

    try {
      // Ask Planning Agent to analyze the E2E results
      const analysis = await chatHandler.analyzeE2EResult(project, result, testScenarios);

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

        if (analysis.fixPrompt) {
          // Send fix prompt to agent
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

  // Helper to check and trigger E2E for a project
  const tryTriggerE2E = async (project: string, message: string) => {
    const session = sessionManager.getCurrentSession();
    if (!session?.plan?.testPlan?.[project]) {
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

    // Generate E2E prompt from Planning Agent
    const e2ePrompt = await chatHandler.requestE2EPrompt(project, message, session.plan.testPlan[project]);

    // Execute the E2E tests via ActionExecutor
    if (e2ePrompt && e2ePrompt.trim()) {
      console.log(`[Orchestrator] Executing E2E for ${project} (prompt: ${e2ePrompt.length} chars)`);
      await actionExecutor.execute({ type: 'send_e2e', project, prompt: e2ePrompt });
    } else {
      console.warn(`[Orchestrator] No E2E prompt generated for ${project}`);
    }
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
          const session = sessionManager.getCurrentSession();
          if (session?.plan?.testPlan?.[waitingProject]) {
            // Generate E2E prompt from Planning Agent
            const e2ePrompt = await chatHandler.requestE2EPrompt(waitingProject, message, session.plan.testPlan[waitingProject]);

            // Execute the E2E tests via ActionExecutor
            if (e2ePrompt && e2ePrompt.trim()) {
              console.log(`[Orchestrator] Executing E2E for ${waitingProject} (prompt: ${e2ePrompt.length} chars)`);
              await actionExecutor.execute({ type: 'send_e2e', project: waitingProject, prompt: e2ePrompt });
            } else {
              console.warn(`[Orchestrator] No E2E prompt generated for ${waitingProject}`);
            }
          }
        } else {
          pendingE2E.set(waitingProject, { message, waitingOn: remaining });
        }
      }
    }
  };

  statusMonitor.on('projectReady', ({ project, message }) => {
    console.log(`[Orchestrator] ${project} is READY: ${message}`);
    tryTriggerE2E(project, message).catch(err => {
      console.error(`[Orchestrator] E2E trigger failed for ${project}:`, err);
    });
  });

  statusMonitor.on('statusChange', ({ project, status }) => {
    // When a project becomes IDLE (E2E complete), check if any pending E2E can start
    if (status === 'IDLE') {
      checkPendingE2E(project).catch(err => {
        console.error(`[Orchestrator] Pending E2E check failed for ${project}:`, err);
      });
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
  });

  chatHandler.on('planApproved', (plan: Plan) => {
    console.log(`[Orchestrator] Plan approved, setting on session`);
    sessionManager.setPlan(plan);
    sessionLogger?.log('PLAN_APPROVED', { feature: plan.feature, taskCount: plan.tasks.length });
  });

  // Forward streaming events to UI for agentic chat
  chatHandler.on('stream', (event) => {
    (ui.io as any).emitChatStream(event);
  });

  // ═══════════════════════════════════════════════════════════════
  // Wire up UI Socket events
  // ═══════════════════════════════════════════════════════════════

  ui.io.on('connection', (socket) => {
    // Handle user chat with optional target
    socket.on('chat', ({ message, target }: { message: string; target?: string }) => {
      if (target && target !== 'planning') {
        // Direct prompt to specific agent (bypasses queue)
        console.log(`[Orchestrator] Chat to agent: ${target}`);
        const success = actionExecutor.sendDirect(target, message);
        if (!success) {
          chatHandler.systemMessage(`Failed to send message to ${target}`);
        }
      } else {
        // Route to Planning Agent via queue (or directly if paused)
        if (stateMachine.getState() === 'PAUSED') {
          // When paused, send directly to Planning Agent for immediate response
          chatHandler.handleUserMessage(message);
        } else {
          // When running, queue the message
          eventQueue.add({ type: 'user_chat', message });
        }
      }
    });

    // Handle session creation request
    socket.on('startSession', async ({ feature, projects }: { feature: string; projects: string[] }) => {
      try {
        // Create session
        const session = sessionManager.createSession(feature, projects);

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
      chatHandler.systemMessage('Plan approved! Ready to start execution.');
    });

    // Handle execution start
    socket.on('startExecution', async () => {
      const session = sessionManager.getCurrentSession();
      if (!session || !session.plan) {
        chatHandler.systemMessage('No session or plan available');
        return;
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

      // Start agents with their tasks
      // Set status to WORKING BEFORE starting agent (since startAgent awaits completion)
      for (const task of session.plan.tasks) {
        const sessionDir = sessionManager.getSessionDir(task.project);
        if (sessionDir) {
          // Set WORKING status first, before the async task starts
          statusMonitor.updateStatus(task.project, 'WORKING', 'Starting agent task...');
          stateMachine.markAgentActive(task.project);

          // Start the agent - this awaits completion of the task
          await processManager.startAgent(task.project, sessionDir, task.task);

          // After task completes, set to READY (triggers E2E flow)
          statusMonitor.updateStatus(task.project, 'READY', 'Task completed');
          stateMachine.markAgentIdle(task.project);
        }
      }

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

    // Run npm install for a project
    socket.on('runNpmInstall', async ({ name }: { name: string }) => {
      try {
        await projectManager.runNpmInstall(name);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[Orchestrator] npm install failed:`, error);
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
  });

  // ═══════════════════════════════════════════════════════════════
  // Graceful shutdown
  // ═══════════════════════════════════════════════════════════════

  const shutdown = () => {
    console.log('\n[Orchestrator] Shutting down...');

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
