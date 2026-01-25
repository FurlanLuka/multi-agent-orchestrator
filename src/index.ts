import * as fs from 'fs';
import * as path from 'path';
import { Config, Plan, HookEvent, LogEntry, OrchestratorEvent, TaskDefinition, StreamingMessage, ContentBlock, StuckState, UserActionRequiredEvent } from './types';
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

  // Bug 1 fix: Track which project each fix is for (fixingProject -> failingProject)
  const e2eFixingFor: Map<string, string> = new Map();

  // Handle E2E completion - analyze directly (PA's internal queue handles serialization)
  actionExecutor.on('e2eComplete', async ({ project, result }) => {
    console.log(`[Orchestrator] E2E completed for ${project}, analyzing...`);

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

    try {
      // Direct call - PA's internal queue handles serialization
      const analysis = await chatHandler.analyzeE2EResult(project, result, testScenarios, allDevServerLogs, allProjects);

      if (analysis.passed) {
        // E2E passed! Mark as complete
        console.log(`[Orchestrator] E2E tests PASSED for ${project}`);
        statusMonitor.updateStatus(project, 'IDLE', 'E2E tests passed');
        e2eRetryCount.delete(project); // Reset retry count on success

        // Bug 1 fix: Only reset E2E_FIXING projects that were fixing issues for THIS project
        for (const proj of allProjects) {
          const status = statusMonitor.getStatus(proj);
          if (status?.status === 'E2E_FIXING' && e2eFixingFor.get(proj) === project) {
            statusMonitor.updateStatus(proj, 'IDLE', 'E2E tests passed');
            e2eFixingFor.delete(proj);
          }
        }
        return;
      }

      // Check for infrastructure failures (e.g., no access to testing tools)
      // These should go straight to FATAL_DEBUGGING - not fixable by code changes
      if (analysis.isInfrastructureFailure) {
        console.error(`[Orchestrator] E2E infrastructure failure for ${project}: ${analysis.analysis}`);
        chatHandler.systemMessage(`E2E tests could not run for ${project}: ${analysis.analysis}. This requires manual intervention (e.g., Playwright MCP tools unavailable).`);
        statusMonitor.updateStatus(project, 'FATAL_DEBUGGING', 'E2E infrastructure issue - tools unavailable');
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
        const currentSession = sessionManager.getCurrentSession();
        const validProjects = new Set(currentSession?.projects || allProjects);

        // Debug: Log the fixes array
        console.log(`[Orchestrator] E2E analysis returned ${analysis.fixes.length} fix(es):`);
        analysis.fixes.forEach((f, i) => {
          console.log(`[Orchestrator]   Fix ${i}: project="${f.project}", prompt length=${f.prompt?.length || 0}`);
        });

        // Track which projects received fixes
        const projectsWithFixes = new Set<string>();

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

          projectsWithFixes.add(targetProject);

          const fixPrompt = `The E2E tests for ${project} failed. Analysis: ${analysis.analysis}

You need to fix the following in ${targetProject}:
${fix.prompt}

After fixing, the E2E tests will be re-run automatically.`;

          console.log(`[Orchestrator] >>> SENDING FIX TO: "${targetProject}" (E2E failed in "${project}")`);
          statusMonitor.updateStatus(targetProject, 'E2E_FIXING', `Fixing issues from ${project} E2E`);

          // Bug 1 fix: Track which project this fix is for
          e2eFixingFor.set(targetProject, project);

          // Emit fix sent event for UI
          (ui.io as any).emitFixSent({
            fromProject: project,
            toProject: targetProject,
            reason: 'E2E test failure'
          });

          // Bug 5 fix: Capture and validate fix results
          try {
            const fixResult = await actionExecutor.sendE2EFix(targetProject, fixPrompt);
            const fixSuccess = !(/error|exception|failed|cannot|unable/i.test((fixResult || '').slice(-500)));

            if (!fixSuccess) {
              console.warn(`[Orchestrator] Fix may have failed for ${targetProject}`);
            }
            console.log(`[Orchestrator] <<< FIX SENT TO: "${targetProject}"`);
          } catch (err) {
            console.error(`[Orchestrator] Fix FAILED for ${targetProject}:`, err);
            statusMonitor.updateStatus(targetProject, 'FAILED', `Fix failed: ${err}`);
            e2eFixingFor.delete(targetProject);
          }
        }

        // Check if fixes were ONLY sent to the failing project, or to other projects too
        const fixedOtherProjects = Array.from(projectsWithFixes).some(p => p !== project);

        if (fixedOtherProjects) {
          // Fixes were sent to other projects (e.g., backend fix for frontend E2E failure)
          // DON'T immediately re-run E2E - wait for the other project(s) to complete
          // The normal flow will handle it: other project → READY → IDLE → checkPendingE2E
          const waitingOn = Array.from(projectsWithFixes).filter(p => p !== project);
          console.log(`[Orchestrator] Fixes sent to other projects (${waitingOn.join(', ')}). Waiting for them to complete before re-running ${project} E2E.`);
          // Set the failing project to wait for the fixed projects
          statusMonitor.updateStatus(project, 'BLOCKED', `Waiting for ${waitingOn.join(', ')} to complete fixes`);

          // Emit waiting for project event for UI
          (ui.io as any).emitWaitingForProject({
            project,
            waitingFor: waitingOn
          });

          // Add to pendingE2E so it will be triggered when the other projects go to IDLE
          pendingE2E.set(project, { message: `Re-running E2E after fixes`, waitingOn });
        } else {
          // Only the failing project itself received fixes - re-run E2E directly
          console.log(`[Orchestrator] Fixes applied to ${project}, re-running E2E tests`);
          const e2ePrompt = await chatHandler.requestE2EPrompt(
            project,
            `Re-running E2E after fix attempt ${retries + 1}`,
            testScenarios
          );

          if (e2ePrompt && e2ePrompt.trim()) {
            await actionExecutor.execute({ type: 'send_e2e', project, prompt: e2ePrompt });
          }
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
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Orchestrator] Error analyzing E2E result for ${project}:`, err);
      chatHandler.systemMessage(`Error analyzing E2E result for ${project}: ${errorMsg}`);
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
  });

  // Forward task status changes to UI
  statusMonitor.on('taskStatusChange', (event) => {
    (ui.io as any).emitTaskStatus(event);
  });

  // Track projects waiting for E2E (waiting on other projects)
  const pendingE2E: Map<string, { message: string; waitingOn: string[] }> = new Map();

  // Track projects with E2E requests already in the queue (prevents duplicates)
  const e2eQueuedProjects: Set<string> = new Set();

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

    // 3. Fallback to name-based detection (backwards compatibility)
    if (!dependencies) {
      const frontendPatterns = ['frontend', '-fe', 'fe-', '_fe', 'fe_', 'web', 'client', 'ui'];
      const backendPatterns = ['backend', '-be', 'be-', '_be', 'be_', 'api', 'server'];
      const projectLower = project.toLowerCase();

      const isFrontend = frontendPatterns.some(p => projectLower.includes(p)) ||
                         projectLower.endsWith('fe');

      if (isFrontend) {
        dependencies = session.projects.filter(p => {
          const pLower = p.toLowerCase();
          const pIsFE = frontendPatterns.some(pat => pLower.includes(pat)) || pLower.endsWith('fe');
          const pIsBE = backendPatterns.some(pat => pLower.includes(pat)) || pLower.endsWith('be');
          return (pIsBE || !pIsFE) && p !== project;
        });
        console.log(`[Orchestrator] Detected ${project} as frontend (name-based), dependencies: ${dependencies.join(', ') || 'none'}`);
      }
    }

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
        // Emit waiting event for UI
        if (ui.io) {
          (ui.io as any).emitWaitingForProject({ project, waitingFor: waitingOn });
        }
        return;
      }
    }

    // No pre-E2E verification needed - all tasks for this project already passed verification
    const devServerUrl = getDevServerUrl(project);

    // Bug 6 fix: Use new API to distinguish "no tests passed" from "no data exists"
    const currentSessionId = sessionStore.getCurrentSessionId();
    const passedTestsResult = currentSessionId
      ? sessionStore.getPassedTestsWithMeta(currentSessionId, project)
      : { exists: false, passedTests: [], totalTests: 0 };

    const passedTests = passedTestsResult.passedTests;
    const allScenarios = session.plan.testPlan[project] || [];

    // Bug 2 fix: Use normalized names for comparison
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

      // Build E2E prompt from custom instructions
      const e2ePrompt = `# E2E Testing for ${project}

Dev Server URL: ${devServerUrl}

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

**FAIL FAST**: When a test fails, STOP immediately and report the failure. Do not continue to other tests.`;

      // Execute E2E directly without going through Planning Agent
      await actionExecutor.execute({ type: 'send_e2e', project, prompt: e2ePrompt });
      return;
    }

    // Direct call - PA's internal queue handles serialization
    console.log(`[Orchestrator] Requesting E2E prompt for ${project}`);
    e2eQueuedProjects.add(project);  // Track to prevent duplicates

    // Emit E2E start event for UI
    (ui.io as any).emitE2EStart({
      project,
      testScenarios: scenariosToTest
    });

    try {
      const e2ePrompt = await chatHandler.requestE2EPrompt(project, message, scenariosToTest, devServerUrl, passedTests.length);
      // Clear tracking now that we've processed this E2E request
      e2eQueuedProjects.delete(project);

      if (e2ePrompt && e2ePrompt.trim()) {
        console.log(`[Orchestrator] Executing E2E for ${project} (prompt: ${e2ePrompt.length} chars)`);
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

    // When coming from E2E_FIXING state:
    // - This project was fixing issues for another project's E2E failure
    // - This project already passed its own E2E tests before (that's why it was IDLE)
    // - Set it back to IDLE, which triggers checkPendingE2E to unblock waiting projects
    if (previous === 'E2E_FIXING') {
      console.log(`[Orchestrator] ${project} completed E2E fix, setting to IDLE (will trigger pending E2E checks)`);
      statusMonitor.updateStatus(project, 'IDLE', 'E2E fix completed');
      return;
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

  // Forward chat response events to UI (structured responses from Planning Agent)
  chatHandler.on('chatResponse', (event) => {
    (ui.io as any).emitChatResponse(event);
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
    // Handle dependency check (runs on connect from UI)
    socket.on('checkDependencies', async () => {
      const checkCommand = async (cmd: string, args: string[]): Promise<{ available: boolean; version: string | null; error: string | null }> => {
        return new Promise((resolve) => {
          const { spawn } = require('child_process');
          const proc = spawn(cmd, args, { shell: true, env: process.env });
          let stdout = '';
          let stderr = '';

          proc.stdout?.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          proc.stderr?.on('data', (data: Buffer) => {
            stderr += data.toString();
          });

          proc.on('close', (code: number | null) => {
            if (code === 0) {
              // Extract version from output (usually first line)
              const version = stdout.trim().split('\n')[0] || null;
              resolve({ available: true, version, error: null });
            } else {
              resolve({ available: false, version: null, error: stderr.trim() || 'Command not found' });
            }
          });

          proc.on('error', (err: Error) => {
            resolve({ available: false, version: null, error: err.message });
          });
        });
      };

      const [claudeResult, gitResult] = await Promise.all([
        checkCommand('claude', ['--version']),
        checkCommand('git', ['--version']),
      ]);

      socket.emit('dependencyCheck', {
        claude: claudeResult,
        git: gitResult,
      });
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

      // Emit plan approved card event for UI
      (ui.io as any).emitPlanApprovedCard({
        feature: plan.feature,
        taskCount: plan.tasks.length,
        projectCount: new Set(plan.tasks.map(t => t.project)).size
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
        getGitBranch: (project: string) => session?.gitBranches?.[project]
      });

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

    // Bug 4 fix: Flush all pending session writes before shutdown
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
