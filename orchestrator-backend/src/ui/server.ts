import express, { Express, Request, Response } from 'express';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { StatusMonitor } from '../core/status-monitor';
import { LogAggregator } from '../core/log-aggregator';
import { SessionManager } from '../core/session-manager';
import { Session, Plan, LogEntry, AgentStatus, ChatStreamEvent, TaskStatusEvent, TaskState, PlanningStatusEvent, PlanApprovalEvent, AnalysisResultEvent, UserInputRequest, UserInputResponse, RequestFlow, FlowStep, FlowStatus, TaskCompleteRequest, TaskCompleteResponse, PlanningSessionState, StageApprovalRequest, RefinedFeatureData, TechnicalSpecData } from '@orchy/types';
import { AVAILABLE_PERMISSIONS, PERMISSION_GROUPS, TEMPLATE_PERMISSIONS, ALWAYS_DENIED, getEnabledGroups } from '@orchy/types';
import { getWebDistPath, getPlannerPermissionsPath } from '../config/paths';

export interface UIServerDependencies {
  statusMonitor: StatusMonitor;
  logAggregator: LogAggregator;
  sessionManager: SessionManager;
  config?: {
    projects: Record<string, {
      permissions?: {
        dangerouslyAllowAll?: boolean;
        allow?: string[];
      };
    }>;
  };
  // Callback for task completion (set after TaskExecutor is created)
  onTaskComplete?: (request: TaskCompleteRequest) => Promise<TaskCompleteResponse>;
  // Callback for plan approval (set after PlanningAgent is created)
  onPlanApproval?: (plan: Plan) => Promise<{ status: 'approved' } | { status: 'refine'; feedback: string }>;
  // Callback to kill planning agent when plan is approved (prevents duplicate submissions)
  onKillPlanningAgent?: () => void;
  // Callback to set GitHub secret (set when GitHubManager is available)
  onSetGitHubSecret?: (repo: string, name: string, value: string) => Promise<{ success: boolean; error?: string }>;
}

// Handler type for generating next-stage prompts
// stage2 = Exploration & Planning (after feature refinement)
type GetNextPromptHandler = (
  stage: 'stage2',
  data: {
    refinedDescription?: string;
    requirements?: string[];
  }
) => string | undefined;

export interface UIServer {
  app: Express;
  server: HttpServer;
  io: SocketServer;
  start: () => void;
  stop: () => void;
  finalize: () => void; // Call after all API routes are registered to add the SPA catch-all
  setGitHubSecretHandler: (handler: (repo: string, name: string, value: string) => Promise<{ success: boolean; error?: string }>) => void;
  setTaskCompleteHandler: (handler: (request: TaskCompleteRequest) => Promise<TaskCompleteResponse>) => void;
  setPlanApprovalHandler: (handler: (plan: Plan) => Promise<{ status: 'approved' } | { status: 'refine'; feedback: string }>) => void;
  setKillPlanningAgentHandler: (handler: () => void) => void;
  setGetNextPromptHandler: (handler: GetNextPromptHandler) => void;
}

export function createUIServer(port: number = 3456, initialDeps?: Partial<UIServerDependencies>): UIServer {
  // Use mutable deps object so handlers can be set later
  const deps: Partial<UIServerDependencies> = { ...initialDeps };

  // Handler for generating next-stage prompts
  let getNextPromptHandler: GetNextPromptHandler | null = null;

  const app = express();
  const server = createServer(app);
  const io = new SocketServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Environment check - allow multiple tabs only in development
  const isDev = process.env.NODE_ENV === 'development';

  // Single tab enforcement (production only)
  let mainClientId: string | null = null;
  let mainClientDisconnectTimer: NodeJS.Timeout | null = null;
  const MAIN_CLIENT_GRACE_PERIOD_MS = 5000; // 5 seconds for reconnection

  // Track connected clients (for dev mode)
  const connectedClients = new Set<string>();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Serve static React build
  const webDistPath = getWebDistPath();
  app.use(express.static(webDistPath));

  // REST API endpoints
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Shutdown endpoint - allows UI to trigger server shutdown
  app.post('/api/shutdown', (req: Request, res: Response) => {
    res.json({ status: 'shutting_down' });
    process.stdout.write('\n\x1b[33mShutdown requested by client. Goodbye!\x1b[0m\n');
    // Give time for response to be sent before exiting
    setTimeout(() => {
      process.exit(0);
    }, 500);
  });

  app.get('/api/status', (req: Request, res: Response) => {
    if (deps?.statusMonitor) {
      res.json(deps.statusMonitor.getStatusesObject());
    } else {
      res.json({});
    }
  });

  app.get('/api/session', (req: Request, res: Response) => {
    if (deps?.sessionManager) {
      const session = deps.sessionManager.getCurrentSession();
      res.json(session || { error: 'No active session' });
    } else {
      res.json({ error: 'Session manager not available' });
    }
  });

  app.get('/api/projects', (req: Request, res: Response) => {
    if (deps?.sessionManager) {
      res.json(deps.sessionManager.listProjects());
    } else {
      res.json([]);
    }
  });

  app.get('/api/logs/:project', (req: Request, res: Response) => {
    const { project } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;

    if (deps?.logAggregator) {
      res.json(deps.logAggregator.getLogs(project, limit));
    } else {
      res.json([]);
    }
  });

  // Get session history for a workspace
  app.get('/api/workspaces/:workspaceId/sessions', (req: Request, res: Response) => {
    const { workspaceId } = req.params;
    if (deps?.sessionManager) {
      const sessions = deps.sessionManager.getSessionStore().listSessionsByWorkspace(workspaceId);
      res.json(sessions);
    } else {
      res.json([]);
    }
  });

  // Get full session data by ID (for historical session view)
  app.get('/api/sessions/:sessionId', (req: Request, res: Response) => {
    const { sessionId } = req.params;
    if (deps?.sessionManager) {
      const fullData = deps.sessionManager.getSessionStore().getFullSessionData(sessionId);
      if (fullData) {
        res.json(fullData);
      } else {
        res.status(404).json({ error: 'Session not found' });
      }
    } else {
      res.status(500).json({ error: 'Session manager not available' });
    }
  });

  app.get('/api/approvals', (req: Request, res: Response) => {
    // Legacy endpoint - approvals now handled via MCP permission prompts
    res.json({ current: null, queue: [] });
  });

  // Permissions API - returns available permissions, groups, and templates
  app.get('/api/permissions', (req: Request, res: Response) => {
    res.json({
      categories: AVAILABLE_PERMISSIONS,
      groups: PERMISSION_GROUPS,
      templates: TEMPLATE_PERMISSIONS,
      alwaysDenied: ALWAYS_DENIED,
    });
  });

  // Get enabled groups for a list of permissions
  app.post('/api/permissions/enabled-groups', (req: Request, res: Response) => {
    const { permissions } = req.body as { permissions: string[] };
    if (!permissions || !Array.isArray(permissions)) {
      res.status(400).json({ error: 'permissions array required' });
      return;
    }
    res.json({ enabledGroups: getEnabledGroups(permissions) });
  });

  // Directory browsing endpoint for DirectoryPicker component
  app.get('/api/directories', (req: Request, res: Response) => {
    const basePath = (req.query.path as string) || os.homedir();
    try {
      const expanded = basePath.replace(/^~/, os.homedir());
      const entries = fs.readdirSync(expanded, { withFileTypes: true });
      const directories = entries
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => ({
          name: e.name,
          path: path.join(expanded, e.name)
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json({
        current: expanded,
        parent: path.dirname(expanded),
        directories
      });
    } catch (err) {
      res.status(400).json({ error: 'Invalid path' });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Permission Prompt Handling (for live permission approval via MCP)
  // ═══════════════════════════════════════════════════════════════

  // Store pending permission requests (key -> resolver)
  const pendingPermissions = new Map<string, {
    resolve: (result: string) => void;
    project: string;
    toolName: string;
    toolInput: Record<string, unknown>;
  }>();

  // ═══════════════════════════════════════════════════════════════
  // Task Complete Handling (for persistent agent task verification)
  // ═══════════════════════════════════════════════════════════════

  // HTTP endpoint for MCP server to call when agent signals task completion
  app.post('/api/task-complete', async (req: Request, res: Response) => {
    const { project, summary } = req.body as { project: string; summary: string };

    // Look up the current working task for this project (orchestrator is source of truth)
    const workingTask = deps.statusMonitor?.getWorkingTaskForProject(project);
    const taskIndex = workingTask?.taskIndex;

    if (taskIndex === undefined) {
      console.error(`[UIServer] No working task found for ${project}`);
      res.json({
        status: 'escalate',
        escalationReason: `No working task found for project ${project}`
      } as TaskCompleteResponse);
      return;
    }

    console.log(`[UIServer] Task complete signal for ${project} task #${taskIndex}`);

    // Check if callback is registered
    if (!deps.onTaskComplete) {
      console.error(`[UIServer] No task complete handler registered`);
      res.json({
        status: 'escalate',
        escalationReason: 'Task executor not initialized'
      } as TaskCompleteResponse);
      return;
    }

    try {
      // Call the handler directly (blocks until verification completes)
      const response = await deps.onTaskComplete({ project, taskIndex, summary });
      console.log(`[UIServer] Task complete response for ${project} task #${taskIndex}: ${response.status}`);
      res.json(response);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[UIServer] Task complete error for ${project} task #${taskIndex}:`, err);
      res.json({
        status: 'escalate',
        escalationReason: `Verification error: ${errorMsg}`
      } as TaskCompleteResponse);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Plan Approval Handling (for interactive plan approval via MCP)
  // ═══════════════════════════════════════════════════════════════

  // Store pending plan approvals (key -> resolver)
  const pendingPlanApprovals = new Map<string, {
    resolve: (result: { status: 'approved' } | { status: 'refine'; feedback: string }) => void;
    plan: Plan;
  }>();

  // HTTP endpoint for MCP server to call when agent submits plan for approval
  app.post('/api/plan-approval', async (req: Request, res: Response) => {
    const { plan } = req.body;

    // Generate unique approval ID
    const approvalId = `approval_${Date.now()}`;

    console.log(`[UIServer] Plan submitted for approval: ${approvalId}`);

    // Emit planning status - awaiting approval (chat unlocks)
    io.emit('planningStatus', { phase: 'awaiting_approval', message: 'Plan ready for review' });

    // Complete the planning flow with "Plan ready for review" BEFORE blocking for approval
    // This ensures correct timeline order (flow completes, then gets updated on approval)
    if (currentPlanningFlowId) {
      emitFlowComplete(currentPlanningFlowId, 'completed', {
        passed: true,
        summary: 'Plan ready for review'
      });
    }

    // Emit plan approval event to frontend
    io.emit('planApproval', { approvalId, plan } as PlanApprovalEvent);

    // Create promise that will resolve when user responds
    const response = await new Promise<{ status: 'approved' } | { status: 'refine'; feedback: string }>((resolve) => {
      pendingPlanApprovals.set(approvalId, { resolve, plan });
    });

    // Clean up
    pendingPlanApprovals.delete(approvalId);

    console.log(`[UIServer] Plan approval response: ${response.status}`);

    // Return response to MCP server (which returns to agent)
    res.json(response);
  });

  // Expose pendingPlanApprovals for socket handler
  (io as any).pendingPlanApprovals = pendingPlanApprovals;

  // ═══════════════════════════════════════════════════════════════
  // User Input Handling (for request_user_input MCP tool)
  // ═══════════════════════════════════════════════════════════════

  // Store pending user input requests (key -> resolver)
  const pendingUserInputs = new Map<string, {
    resolve: (result: UserInputResponse) => void;
    request: UserInputRequest;
  }>();

  // HTTP endpoint for MCP server to call when agent requests user input
  app.post('/api/user-input', async (req: Request, res: Response) => {
    const { project, inputs } = req.body;

    // Generate unique request ID
    const requestId = `input_${Date.now()}`;

    // Check if this is a confirmation dialog (first input has type: "confirmation")
    const isConfirmation = inputs.length > 0 && inputs[0].type === 'confirmation';

    // Check if this is a GitHub secret request (first input has type: "github_secret")
    const isGitHubSecret = inputs.length > 0 && inputs[0].type === 'github_secret';
    const githubSecretInput = isGitHubSecret ? inputs[0] : null;

    console.log(`[UIServer] User input requested for ${project}: ${isConfirmation ? 'confirmation dialog' : isGitHubSecret ? 'github_secret' : `${inputs.length} field(s)`}`);

    // Build the request object
    const request: UserInputRequest = {
      requestId,
      project,
      inputs
    };

    // Emit user input request event to frontend
    io.emit('userInputRequired', request);

    // Create promise that will resolve when user responds
    const response = await new Promise<UserInputResponse>((resolve) => {
      pendingUserInputs.set(requestId, { resolve, request });
    });

    // Clean up
    pendingUserInputs.delete(requestId);

    // Handle GitHub secret type
    if (isGitHubSecret && githubSecretInput && deps.onSetGitHubSecret) {
      const secretName = githubSecretInput.name;
      const repo = githubSecretInput.repo;
      const secretValue = response.values[secretName];

      if (secretName && repo && secretValue) {
        console.log(`[UIServer] Setting GitHub secret ${secretName} on ${repo}`);
        const result = await deps.onSetGitHubSecret(repo, secretName, secretValue);
        if (result.success) {
          console.log(`[UIServer] GitHub secret ${secretName} set successfully`);
          res.json({ success: true, secretName, repo });
        } else {
          console.error(`[UIServer] Failed to set GitHub secret: ${result.error}`);
          res.json({ success: false, error: result.error });
        }
      } else {
        res.json({ error: 'Missing secret name, repo, or value' });
      }
      return;
    }

    // Return appropriate response format
    if (isConfirmation) {
      // For confirmation dialogs, return { confirmed: true/false }
      // Frontend sends 'true' or 'false' as string in values['confirmed']
      const confirmed = response.values['confirmed'] === 'true';
      console.log(`[UIServer] Confirmation response: ${confirmed}`);
      res.json({ confirmed });
    } else {
      // For regular inputs, return values object
      console.log(`[UIServer] User input response: ${Object.keys(response.values).length} value(s)`);
      res.json(response.values);
    }
  });

  // Expose pendingUserInputs for socket handler
  (io as any).pendingUserInputs = pendingUserInputs;

  // ═══════════════════════════════════════════════════════════════
  // Multi-Stage Planning Endpoints (6-stage workflow)
  // ═══════════════════════════════════════════════════════════════

  // Planning session state (shared across stages)
  let planningSessionState: PlanningSessionState | null = null;

  // Stage labels for flow cards
  const STAGE_LABELS: Record<string, string> = {
    feature_refinement: 'Feature Refinement',
    exploration_planning: 'Exploration & Planning',
    task_generation: 'Task Generation',
  };

  // Store pending stage approvals (key -> resolver)
  const pendingStageApprovals = new Map<string, {
    resolve: (result: { status: 'approved' } | { status: 'refine'; feedback: string }) => void;
    data: StageApprovalRequest['data'];
  }>();

  // Helper to persist planning state to session store
  const persistPlanningState = () => {
    if (!planningSessionState || !deps.sessionManager) return;
    const currentSessionId = deps.sessionManager.getSessionStore().getCurrentSessionId();
    if (currentSessionId) {
      deps.sessionManager.getSessionStore().setPlanningState(currentSessionId, planningSessionState);
    }
  };

  // Helper to initialize planning session (3-stage workflow)
  const initPlanningSession = () => {
    planningSessionState = {
      currentStage: 'feature_refinement',
      stages: [
        { stage: 'feature_refinement', status: 'active', startedAt: Date.now() },
        { stage: 'exploration_planning', status: 'pending' },
        { stage: 'task_generation', status: 'pending' },
      ],
    };
    io.emit('planningSessionState', { sessionState: planningSessionState });
    persistPlanningState();
  };

  // Helper to advance to next stage (3-stage workflow)
  const advanceStage = (currentStage: string) => {
    if (!planningSessionState) return;

    const stageOrder = [
      'feature_refinement',
      'exploration_planning',
      'task_generation',
    ];

    const currentIdx = stageOrder.indexOf(currentStage);
    if (currentIdx >= 0 && currentIdx < stageOrder.length - 1) {
      // Mark current stage as completed
      const currentStageObj = planningSessionState.stages.find(s => s.stage === currentStage);
      if (currentStageObj) {
        currentStageObj.status = 'completed';
        currentStageObj.completedAt = Date.now();
      }

      // Mark next stage as active
      const nextStage = stageOrder[currentIdx + 1];
      const nextStageObj = planningSessionState.stages.find(s => s.stage === nextStage);
      if (nextStageObj) {
        nextStageObj.status = 'active';
        nextStageObj.startedAt = Date.now();
      }

      planningSessionState.currentStage = nextStage as PlanningSessionState['currentStage'];
    }

    io.emit('planningSessionState', { sessionState: planningSessionState });
    persistPlanningState();
  };

  // Stage 1: Submit Refined Feature
  app.post('/api/submit-refined-feature', async (req: Request, res: Response) => {
    const { refinedDescription, keyRequirements } = req.body;
    const stageId = `stage_refined_${Date.now()}`;

    console.log(`[UIServer] Refined feature submitted: ${stageId}`);

    // Initialize session if not exists
    if (!planningSessionState) {
      initPlanningSession();
    }

    // Store refined feature
    if (planningSessionState) {
      planningSessionState.refinedFeature = { description: refinedDescription, requirements: keyRequirements };
      // Mark stage as awaiting approval
      const stageObj = planningSessionState.stages.find(s => s.stage === 'feature_refinement');
      if (stageObj) stageObj.status = 'awaiting_approval';
      io.emit('planningSessionState', { sessionState: planningSessionState });
      persistPlanningState();
    }

    // Emit stage approval request to frontend
    const data: RefinedFeatureData = { type: 'refined_feature', refinedDescription, keyRequirements };
    io.emit('stageApproval', { stageId, stage: 'feature_refinement', data } as StageApprovalRequest);

    // Block until user responds
    const response = await new Promise<{ status: 'approved' } | { status: 'refine'; feedback: string }>((resolve) => {
      pendingStageApprovals.set(stageId, { resolve, data });
    });

    pendingStageApprovals.delete(stageId);

    // Handle response
    if (response.status === 'approved') {
      // Emit completed flow for the stage
      io.emit('flowStart', {
        id: stageId,
        type: 'planning',
        status: 'completed',
        startedAt: Date.now(),
        completedAt: Date.now(),
        steps: [],
        result: {
          passed: true,
          summary: `${STAGE_LABELS['feature_refinement']} approved`,
          details: `**Description:** ${refinedDescription}\n\n**Requirements:**\n${keyRequirements.map((r: string) => `- ${r}`).join('\n')}`
        }
      });
      advanceStage('feature_refinement');

      // Generate Exploration & Planning prompt
      const nextPrompt = getNextPromptHandler?.('stage2', {
        refinedDescription,
        requirements: keyRequirements
      });

      res.json({ ...response, nextPrompt });
    } else if (planningSessionState) {
      // Mark stage as active again for refinement
      const stageObj = planningSessionState.stages.find(s => s.stage === 'feature_refinement');
      if (stageObj) stageObj.status = 'active';
      io.emit('planningSessionState', { sessionState: planningSessionState });
      persistPlanningState();
      res.json(response);
    } else {
      res.json(response);
    }
  });

  // Stage 2: Submit Technical Spec (Exploration & Planning combined)
  app.post('/api/submit-technical-spec', async (req: Request, res: Response) => {
    const { apiContracts, architectureDecisions, executionOrder } = req.body;
    const stageId = `stage_techspec_${Date.now()}`;

    console.log(`[UIServer] Technical spec submitted: ${apiContracts?.length || 0} contracts`);

    if (planningSessionState) {
      planningSessionState.technicalSpec = { apiContracts, architectureDecisions: architectureDecisions || [], executionOrder };
      const stageObj = planningSessionState.stages.find(s => s.stage === 'exploration_planning');
      if (stageObj) stageObj.status = 'awaiting_approval';
      io.emit('planningSessionState', { sessionState: planningSessionState });
      persistPlanningState();
    }

    // Emit stage approval request
    const data: TechnicalSpecData = { type: 'technical_spec', apiContracts, architectureDecisions: architectureDecisions || [], executionOrder };
    io.emit('stageApproval', { stageId, stage: 'exploration_planning', data } as StageApprovalRequest);

    // Block until user responds
    const response = await new Promise<{ status: 'approved' } | { status: 'refine'; feedback: string }>((resolve) => {
      pendingStageApprovals.set(stageId, { resolve, data });
    });

    pendingStageApprovals.delete(stageId);

    if (response.status === 'approved') {
      // Build details for technical spec
      const apiDetails = apiContracts && apiContracts.length > 0
        ? `**API Contracts (${apiContracts.length}):**\n${apiContracts.map((c: { method: string; endpoint: string }) => `- \`${c.method} ${c.endpoint}\``).join('\n')}`
        : '';
      const archDetails = architectureDecisions && architectureDecisions.length > 0
        ? `\n\n**Architecture Decisions:**\n${architectureDecisions.map((d: string) => `- ${d}`).join('\n')}`
        : '';
      const execDetails = executionOrder && executionOrder.length > 0
        ? `\n\n**Execution Order:**\n${executionOrder.map((e: { project: string }, i: number) => `${i + 1}. ${e.project}`).join('\n')}`
        : '';

      // Emit completed flow for the stage
      io.emit('flowStart', {
        id: stageId,
        type: 'planning',
        status: 'completed',
        startedAt: Date.now(),
        completedAt: Date.now(),
        steps: [],
        result: {
          passed: true,
          summary: `${STAGE_LABELS['exploration_planning']} approved`,
          details: `${apiDetails}${archDetails}${execDetails}`
        }
      });
      advanceStage('exploration_planning');

      // Return with Task Generation instructions
      io.emit('planningSessionState', { sessionState: planningSessionState });
      persistPlanningState();

      const refinedFeature = planningSessionState?.refinedFeature || { description: '', requirements: [] };

      res.json({
        ...response,
        nextStage: 'task_generation',
        instructions: `Technical spec approved! Now proceed to Task Generation.

## Your Task: Generate Implementation Plan

Generate a detailed Plan JSON based on the approved technical spec.

### Context

**Feature:** ${refinedFeature.description}

**Requirements:**
${refinedFeature.requirements.map((r: string, i: number) => `${i + 1}. ${r}`).join('\n')}

**Technical Spec:**
${apiDetails}${archDetails}${execDetails}

## Plan JSON Format

\`\`\`json
{
  "feature": "Feature name",
  "description": "Brief description",
  "overview": "High-level implementation approach",
  "architecture": "Mermaid diagram (flowchart LR)",
  "tasks": [
    {
      "project": "project-name",
      "name": "Task name",
      "task": "## Detailed task description in markdown\\n\\n**Files to create:**\\n- ...\\n\\n**Implementation:**\\n- ..."
    }
  ],
  "testPlan": {
    "project-name": ["E2E scenario 1", "E2E scenario 2"]
  },
  "e2eDependencies": {
    "frontend": ["backend"]
  }
}
\`\`\`

## Task Requirements

Each task MUST include:
1. **Files to create/modify** - exact paths matching project conventions
2. **Implementation details** - functions, classes, components with code examples
3. **For APIs — COMPLETE contract for EVERY endpoint:**
   - HTTP method and full path (e.g. \`POST /api/posts/:id/reactions\`)
   - Request body schema with field names, types, and validation rules
   - Success response body schema with field names and types
   - Error response body schema
   - HTTP status codes for each scenario (200, 201, 400, 401, 404, 409, etc.)
   - Authentication/authorization requirements
   - Include a concrete example request/response pair
4. **For UIs:** component props, state, behavior, and the exact API endpoints it calls
5. **Dependencies:** what to import or install

## Architecture Diagram

The "architecture" field must be SIMPLE Mermaid syntax:

REQUIRED FORMAT:
- Start with: flowchart LR
- Use \\n for newlines in JSON
- Max 6 nodes total
- NO subgraphs

NODE SYNTAX:
- NodeID["Label"] - IDs must be lowercase letters only
- Database: db[("Database")]

ARROW SYNTAX:
- Simple arrows ONLY: A --> B
- NO edge labels

EXAMPLE:
flowchart LR\\n    ui["Frontend"] --> api["Backend API"]\\n    api --> db[("Database")]

## Rules
- Tasks for DIFFERENT projects run IN PARALLEL
- Tasks for SAME project run SEQUENTIALLY
- NO unit tests - only implementation code
- testPlan = E2E scenarios only (automatable via HTTP or browser)

## Submit the Plan

Call \`mcp__orchestrator-planning__submit_plan_for_approval\` with the complete plan JSON.

If response is \`{ "status": "approved" }\`: Stop - execution will start
If response is \`{ "status": "refine", "feedback": "..." }\`: Revise and resubmit`
      });
      return;
    } else if (planningSessionState) {
      const stageObj = planningSessionState.stages.find(s => s.stage === 'exploration_planning');
      if (stageObj) stageObj.status = 'active';
      io.emit('planningSessionState', { sessionState: planningSessionState });
      persistPlanningState();
    }

    res.json(response);
  });

  // Expose for socket handlers
  (io as any).pendingStageApprovals = pendingStageApprovals;
  (io as any).planningSessionState = () => planningSessionState;
  (io as any).initPlanningSession = initPlanningSession;
  (io as any).advanceStage = advanceStage;

  // ═══════════════════════════════════════════════════════════════
  // Planning Question Handling (for interactive Q&A during planning)
  // ═══════════════════════════════════════════════════════════════

  // Track pending planning questions (supports multiple questions shown one at a time)
  const pendingPlanningQuestions = new Map<string, {
    resolve: (answers: string) => void;
    questions: Array<{ question: string; context?: string }>;
    answers: string[];
    currentIndex: number;
  }>();

  // HTTP endpoint for planning questions (called by MCP server)
  // Supports multiple questions - returns all answers joined when complete
  app.post('/api/planning-questions', (req: Request, res: Response) => {
    const { project, questions } = req.body;
    const key = `planning_${project}_${Date.now()}`;

    console.log(`[UIServer] Planning questions for ${project}: ${questions.length} question(s)`);

    // Store resolver and emit first question
    pendingPlanningQuestions.set(key, {
      resolve: (answers: string) => res.send(answers),
      questions,
      answers: [],
      currentIndex: 0
    });

    // Emit to frontend with full questions array
    io.emit('planningQuestion', {
      questionId: key,
      questions,
      currentIndex: 0
    });

    // Timeout after 5 minutes for all questions
    setTimeout(() => {
      if (pendingPlanningQuestions.has(key)) {
        const pending = pendingPlanningQuestions.get(key)!;
        pendingPlanningQuestions.delete(key);
        // Return whatever answers we got, plus defaults for unanswered
        const allAnswers = [...pending.answers];
        for (let i = pending.answers.length; i < pending.questions.length; i++) {
          allAnswers.push('No response provided');
        }
        res.send(allAnswers.map((a, i) => `Q${i + 1}: ${a}`).join('\n\n'));
      }
    }, 300000);
  });

  // Expose pendingPlanningQuestions for socket handler
  (io as any).pendingPlanningQuestions = pendingPlanningQuestions;

  // HTTP endpoint for MCP server to call when Claude needs permission
  app.post('/api/permission-prompt', (req: Request, res: Response) => {
    const { project, toolName, toolInput } = req.body;

    console.log(`[UIServer] Permission prompt for ${project}: ${toolName}`);

    // Check if this permission is already in the project's allow list
    const projectConfig = deps?.config?.projects?.[project];

    // Build the string to match against - prefer toolInput.command for accurate matching
    const inputCommand = typeof toolInput?.command === 'string' ? toolInput.command : null;
    const toolMatch = toolName.match(/^(\w+)\((.+)\)$/s);  // 's' flag for dotall
    const toolType = toolMatch ? toolMatch[1] : toolName;
    const toolNameCommand = toolMatch ? toolMatch[2] : '';
    const actualCommand = inputCommand || toolNameCommand;

    // Build the full match string (e.g., "Bash(curl -s ...)")
    const matchString = actualCommand ? `${toolType}(${actualCommand})` : toolName;

    console.log(`[UIServer] Matching against: ${matchString.substring(0, 100)}...`);

    // Get permissions config - for 'planner' project, use planner-permissions.json
    let permissionsConfig = projectConfig?.permissions;
    if (project === 'planner') {
      const plannerPermissionsPath = getPlannerPermissionsPath();
      if (fs.existsSync(plannerPermissionsPath)) {
        try {
          permissionsConfig = JSON.parse(fs.readFileSync(plannerPermissionsPath, 'utf-8'));
          console.log(`[UIServer] Loaded planner permissions from: ${plannerPermissionsPath}`);
        } catch (err) {
          console.error(`[UIServer] Failed to parse planner permissions:`, err);
        }
      }
    }

    if (permissionsConfig?.allow) {
      const allowList = permissionsConfig.allow as string[];
      const isAllowed = allowList.some(pattern => {
        // Check exact match first
        if (pattern === matchString) return true;
        if (pattern === toolName) return true;

        // Check pattern match (e.g., "Bash(curl *)" matches "Bash(curl -s ...)")
        // Convert glob pattern to regex
        const regexPattern = pattern
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special chars except *
          .replace(/\*/g, '[\\s\\S]*');  // Convert * to [\s\S]* to match any char including newlines

        try {
          const regex = new RegExp(`^${regexPattern}$`);
          const matches = regex.test(matchString);
          if (matches) {
            console.log(`[UIServer] Pattern "${pattern}" matched`);
          }
          return matches;
        } catch (e) {
          console.error(`[UIServer] Invalid regex pattern: ${pattern}`, e);
          return false;
        }
      });

      if (isAllowed) {
        console.log(`[UIServer] Permission auto-approved (in allow list): ${toolName}`);
        res.send('allow');
        return;
      }
    }

    // Not in allow list - prompt user
    console.log(`[UIServer] Permission requires user approval: ${toolName}`);

    // Emit to frontend
    io.emit('permissionPrompt', { project, toolName, toolInput });

    // Store resolver - response comes via socket
    const key = `${project}_${Date.now()}`;
    pendingPermissions.set(key, {
      resolve: (result: string) => {
        res.send(result);  // "allow" or "deny"
      },
      project,
      toolName,
      toolInput
    });

    // Timeout after 10 minutes - auto-deny
    setTimeout(() => {
      if (pendingPermissions.has(key)) {
        console.log(`[UIServer] Permission prompt timeout for ${project}: ${toolName}`);
        pendingPermissions.delete(key);
        res.send('deny');
      }
    }, 600000);
  });

  // Expose pendingPermissions for socket handler in index.ts
  (io as any).pendingPermissions = pendingPermissions;

  // Socket.io connection handling
  io.on('connection', (socket: Socket) => {
    console.log(`[UIServer] Client connected: ${socket.id}${isDev ? ' (dev mode)' : ''}`);
    connectedClients.add(socket.id);

    // In dev mode, all clients are treated equally
    // In production, enforce single tab
    if (isDev) {
      // Dev mode: all clients are main
      socket.emit('clientRole', { role: 'main' });

      // Send current state on connect
      if (deps?.sessionManager) {
        const session = deps.sessionManager.getCurrentSession();
        if (session) {
          socket.emit('session', session);
        }
      }

      if (deps?.statusMonitor) {
        socket.emit('statuses', deps.statusMonitor.getStatusesObject());
        socket.emit('taskStates', deps.statusMonitor.getAllTaskStates());
      }

    } else {
      // Production mode: single tab enforcement
      if (mainClientId === null) {
        // This is the first client - assign as main
        mainClientId = socket.id;
        console.log(`[UIServer] Main client assigned: ${socket.id}`);

        // Clear any pending disconnect timer (handles reconnection during grace period)
        if (mainClientDisconnectTimer) {
          clearTimeout(mainClientDisconnectTimer);
          mainClientDisconnectTimer = null;
          console.log(`[UIServer] Reconnection during grace period - timer cleared`);
        }

        // Emit main role to client
        socket.emit('clientRole', { role: 'main' });

        // Send current state on connect (only for main client)
        if (deps?.sessionManager) {
          const session = deps.sessionManager.getCurrentSession();
          if (session) {
            socket.emit('session', session);
          }
        }

        if (deps?.statusMonitor) {
          socket.emit('statuses', deps.statusMonitor.getStatusesObject());
          socket.emit('taskStates', deps.statusMonitor.getAllTaskStates());
        }

      } else {
        // Another client is already main - this is a secondary tab
        console.log(`[UIServer] Secondary client connected: ${socket.id} (main is ${mainClientId})`);
        socket.emit('clientRole', { role: 'secondary', message: 'UI is active on another tab' });
        // Don't send other state to secondary clients
      }
    }

    // Handle client events
    socket.on('chat', (message: string) => {
      console.log(`[UIServer] Chat from client: ${message}`);
      // Emit to orchestrator for routing to Planning Agent
      io.emit('userChat', message);
    });

    socket.on('startSession', ({ feature, projects }: { feature: string; projects: string[] }) => {
      console.log(`[UIServer] Start session request: ${feature}`);
      io.emit('startSessionRequest', { feature, projects });
    });

    socket.on('startExecution', () => {
      console.log(`[UIServer] Start execution requested`);
      io.emit('startExecutionRequest');
    });

    // Handle project retry request (forwarded to orchestrator)
    socket.on('retryProject', ({ project }: { project: string }) => {
      console.log(`[UIServer] Retry requested for ${project}`);
      io.emit('retryProject', { project });
    });

    // Handle planning question answer (for interactive Q&A during planning)
    socket.on('answerPlanningQuestion', ({ questionId, answer }: { questionId: string; answer: string }) => {
      console.log(`[UIServer] Planning question answered: ${questionId}`);
      const pending = (io as any).pendingPlanningQuestions?.get(questionId);
      if (pending) {
        // Store the answer
        pending.answers.push(answer);
        pending.currentIndex++;

        if (pending.currentIndex < pending.questions.length) {
          // More questions to ask - emit next question
          console.log(`[UIServer] Moving to next question (${pending.currentIndex + 1}/${pending.questions.length})`);
          io.emit('planningQuestion', {
            questionId,
            questions: pending.questions,
            currentIndex: pending.currentIndex
          });
        } else {
          // All questions answered - resolve with all answers
          console.log(`[UIServer] All ${pending.questions.length} questions answered`);
          const formattedAnswers = pending.answers.map((a: string, i: number) =>
            `Q${i + 1}: ${pending.questions[i].question}\nA${i + 1}: ${a}`
          ).join('\n\n');
          pending.resolve(formattedAnswers);
          (io as any).pendingPlanningQuestions.delete(questionId);

          // Clear question from frontend
          io.emit('planningQuestionClear', { questionId });
        }
      }
    });

    // Handle plan approval via chat (user approves the plan)
    socket.on('approvePlanViaChat', ({ approvalId }: { approvalId: string }) => {
      console.log(`[UIServer] Plan approved via chat: ${approvalId}`);
      const pending = (io as any).pendingPlanApprovals?.get(approvalId);
      if (pending?.resolve) {
        // Emit completed flow for final plan approval
        io.emit('flowStart', {
          id: `plan_approved_${Date.now()}`,
          type: 'planning',
          status: 'completed',
          startedAt: Date.now(),
          completedAt: Date.now(),
          steps: [],
          result: {
            passed: true,
            summary: 'Plan approved - execution starting',
            details: `**${pending.plan?.tasks?.length || 0} tasks** ready for execution`
          }
        });

        // Emit status BEFORE resolving
        io.emit('planningStatus', { phase: 'complete', message: 'Plan approved!' });
        pending.resolve({ status: 'approved' });
        (io as any).pendingPlanApprovals.delete(approvalId);

        // Kill the planning agent to prevent any further MCP calls (e.g., duplicate plan submissions)
        if (deps.onKillPlanningAgent) {
          console.log(`[UIServer] Killing planning agent after approval`);
          deps.onKillPlanningAgent();
        }
      }
    });

    // Handle plan refinement request (user types feedback in chat)
    socket.on('refinePlan', ({ approvalId, feedback }: { approvalId: string; feedback: string }) => {
      console.log(`[UIServer] Plan refinement requested: ${approvalId}`);
      const pending = (io as any).pendingPlanApprovals?.get(approvalId);
      if (pending?.resolve) {
        // Emit status BEFORE resolving - go back to in-progress
        io.emit('planningStatus', { phase: 'refining', message: 'Refining plan based on feedback...' });
        pending.resolve({ status: 'refine', feedback });
        (io as any).pendingPlanApprovals.delete(approvalId);
      }
    });

    // Handle user input response (for request_user_input MCP tool)
    socket.on('userInputResponse', ({ requestId, values }: { requestId: string; values: Record<string, string> }) => {
      console.log(`[UIServer] User input response received: ${requestId}`);
      const pending = (io as any).pendingUserInputs?.get(requestId);
      if (pending?.resolve) {
        pending.resolve({ requestId, values });
        (io as any).pendingUserInputs.delete(requestId);
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // Multi-Stage Planning Socket Handlers
    // ═══════════════════════════════════════════════════════════════

    // Approve a stage
    socket.on('approveStage', ({ stageId, feedback }: { stageId: string; feedback?: string }) => {
      console.log(`[UIServer] Stage approved: ${stageId}`);
      const pending = (io as any).pendingStageApprovals?.get(stageId);
      if (pending?.resolve) {
        pending.resolve({ status: 'approved' });
        (io as any).pendingStageApprovals.delete(stageId);
      }
    });

    // Reject/request changes to a stage
    socket.on('rejectStage', ({ stageId, feedback }: { stageId: string; feedback: string }) => {
      console.log(`[UIServer] Stage rejected: ${stageId}, feedback: ${feedback}`);
      const pending = (io as any).pendingStageApprovals?.get(stageId);
      if (pending?.resolve) {
        pending.resolve({ status: 'refine', feedback });
        (io as any).pendingStageApprovals.delete(stageId);
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // Designer Agent Socket Handlers
    // ═══════════════════════════════════════════════════════════════

    // Start a new design session
    socket.on('design:start_session', async ({ category }: { category?: string }) => {
      console.log(`[UIServer] Starting design session${category ? ` with category: ${category}` : ''}`);

      try {
        // Get the designer agent manager from the attached reference
        const designerAgent = (io as any).designerAgent;
        if (!designerAgent) {
          console.error('[UIServer] Designer agent not available');
          socket.emit('design:error', { message: 'Designer agent not available' });
          return;
        }

        // Start the session with the category (agent will use it in system prompt)
        const session = await designerAgent.startSession(category);
        console.log(`[UIServer] Design session started: ${session.id}`);

        // Initialize session phase to discovery
        const phases = (io as any).designSessionPhases as Map<string, string>;
        if (phases) {
          phases.set(session.id, 'discovery');
        }

        // Emit session started to client
        socket.emit('design:session_started', { sessionId: session.id });
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error('[UIServer] Failed to start design session:', error);
        socket.emit('design:error', { message: error });
      }
    });

    // End the current design session
    socket.on('design:end_session', async () => {
      console.log(`[UIServer] Ending design session`);
      const designerAgent = (io as any).designerAgent;
      if (designerAgent) {
        await designerAgent.endSession();
      }
    });

    // Handle designer user message (response to request_user_input)
    socket.on('design:user_message', ({ content }: { content: string }) => {
      console.log(`[UIServer] Designer user message: ${content.substring(0, 50)}...`);
      // Resolve the most recent pending input
      const pendingInputs = (io as any).pendingDesignerInputs as Map<string, { resolve: (msg: string) => void }>;
      if (pendingInputs && pendingInputs.size > 0) {
        const [key, pending] = Array.from(pendingInputs.entries()).pop()!;
        pending.resolve(content);
        pendingInputs.delete(key);
      }
    });

    // Handle designer category selection
    socket.on('design:category_selected', ({ category }: { category: string }) => {
      console.log(`[UIServer] Designer category selected: ${category}`);
      const pendingCategories = (io as any).pendingDesignerCategories as Map<string, { resolve: (cat: string) => void }>;
      if (pendingCategories && pendingCategories.size > 0) {
        const [key, pending] = Array.from(pendingCategories.entries()).pop()!;
        pending.resolve(category);
        pendingCategories.delete(key);
      }
    });

    // Handle designer option selection (palette, component, or mockup)
    socket.on('design:option_selected', ({ index, pageName }: { index: number; pageName?: string }) => {
      console.log(`[UIServer] Designer option selected: ${index}${pageName ? `, pageName: ${pageName}` : ''}`);

      // First check for pending mockup selection (mockups have their own resolver)
      const designerAgent = (io as any).designerAgent;
      if (designerAgent?.pendingMockupSelection) {
        // For mockups, just pass the index - the page name will be looked up from the option
        console.log(`[UIServer] Resolving mockup selection with index: ${index}`);
        designerAgent.pendingMockupSelection({ selected: index });
        designerAgent.pendingMockupSelection = null;
        return;
      }

      // Otherwise check pending theme/component previews
      const pendingPreviews = (io as any).pendingDesignerPreviews as Map<string, { resolve: (result: { selected?: number; feedback?: string }) => void }>;
      if (pendingPreviews && pendingPreviews.size > 0) {
        const [key, pending] = Array.from(pendingPreviews.entries()).pop()!;
        pending.resolve({ selected: index });
        pendingPreviews.delete(key);
      }
    });

    // Handle designer feedback submission (refinement request)
    socket.on('design:feedback_submitted', ({ feedback }: { feedback: string }) => {
      console.log(`[UIServer] Designer feedback submitted: ${feedback.substring(0, 50)}...`);

      // First check for pending mockup selection (to go back to discovery from mockup)
      const designerAgent = (io as any).designerAgent;
      if (designerAgent?.pendingMockupSelection) {
        console.log(`[UIServer] Resolving mockup with feedback`);
        // Mockup doesn't have a feedback option, treat it as refine for the first option
        designerAgent.pendingMockupSelection({ refine: 0 });
        designerAgent.pendingMockupSelection = null;
        return;
      }

      // Otherwise check pending theme/component previews
      const pendingPreviews = (io as any).pendingDesignerPreviews as Map<string, { resolve: (result: { selected?: number; feedback?: string }) => void }>;
      if (pendingPreviews && pendingPreviews.size > 0) {
        const [key, pending] = Array.from(pendingPreviews.entries()).pop()!;
        pending.resolve({ feedback });
        pendingPreviews.delete(key);
      }
    });

    // Handle entering refine mode (iterate on single option)
    socket.on('design:enter_refine', ({ index }: { index: number }) => {
      console.log(`[UIServer] Designer entering refine mode for option: ${index}`);

      // First check for pending mockup selection
      const designerAgent = (io as any).designerAgent;
      if (designerAgent?.pendingMockupSelection) {
        console.log(`[UIServer] Resolving mockup refine for index: ${index}`);
        designerAgent.pendingMockupSelection({ refine: index });
        designerAgent.pendingMockupSelection = null;
        return;
      }

      // Otherwise check pending theme/component previews
      const pendingPreviews = (io as any).pendingDesignerPreviews as Map<string, { resolve: (result: { selected?: number; feedback?: string; refine?: number }) => void }>;
      if (pendingPreviews && pendingPreviews.size > 0) {
        const [key, pending] = Array.from(pendingPreviews.entries()).pop()!;
        pending.resolve({ refine: index });
        pendingPreviews.delete(key);
      }
    });

    // Handle confirming refine (done with refinement, move to next phase)
    socket.on('design:confirm_refine', () => {
      console.log(`[UIServer] Designer confirming refined option`);
      const pendingInputs = (io as any).pendingDesignerInputs as Map<string, { resolve: (msg: string) => void }>;
      if (pendingInputs && pendingInputs.size > 0) {
        const [key, pending] = Array.from(pendingInputs.entries()).pop()!;
        pending.resolve('[USER CONFIRMED: The refined option looks good, proceed to next phase]');
        pendingInputs.delete(key);
      }
    });

    // Handle requesting new options while in refine mode
    socket.on('design:request_new_options', () => {
      console.log(`[UIServer] Designer requesting new options`);
      const pendingInputs = (io as any).pendingDesignerInputs as Map<string, { resolve: (msg: string) => void }>;
      if (pendingInputs && pendingInputs.size > 0) {
        const [key, pending] = Array.from(pendingInputs.entries()).pop()!;
        pending.resolve('[USER REQUEST: Please generate 3 new options for me to choose from]');
        pendingInputs.delete(key);
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // Mockup-specific Socket Handlers (Select/Refine/Feeling Lucky)
    // ═══════════════════════════════════════════════════════════════

    // Handle mockup selection (Select button - saves page and shows pages panel)
    socket.on('design:mockup_selected', ({ index, pageName }: { index: number; pageName: string }) => {
      console.log(`[UIServer] Mockup selected: index=${index}, name="${pageName}"`);
      const designerAgent = (io as any).designerAgent;
      if (designerAgent) {
        designerAgent.onMockupSelected(index, pageName);
      }
    });

    // Handle mockup refine (Refine button - goes to chat, then shows popup again)
    socket.on('design:mockup_refine', ({ index }: { index: number }) => {
      console.log(`[UIServer] Mockup refine requested: index=${index}`);
      const designerAgent = (io as any).designerAgent;
      if (designerAgent) {
        designerAgent.onMockupRefine(index);
      }
    });

    // Handle "I'm Feeling Lucky" (generates 3 new variants)
    socket.on('design:mockup_feeling_lucky', () => {
      console.log(`[UIServer] Mockup feeling lucky requested`);
      const designerAgent = (io as any).designerAgent;
      if (designerAgent) {
        designerAgent.onMockupFeelingLucky();
      }
    });

    // Handle view page request (user clicks on a page in the pages panel)
    socket.on('design:view_page', async ({ pageId }: { pageId: string }) => {
      console.log(`[UIServer] View page requested: ${pageId}`);
      const designerAgent = (io as any).designerAgent;
      if (designerAgent) {
        const html = designerAgent.getPageHtml(pageId);
        const page = designerAgent.getPage(pageId);
        if (html && page) {
          socket.emit('design:show_page_modal', { page, html });
        }
      }
    });

    // Handle add page request (user wants to add a new page)
    socket.on('design:add_page_request', ({ description }: { description?: string }) => {
      console.log(`[UIServer] Add page requested${description ? `: ${description}` : ''}`);
      const pendingInputs = (io as any).pendingDesignerInputs as Map<string, { resolve: (msg: string) => void }>;
      if (pendingInputs && pendingInputs.size > 0) {
        const [key, pending] = Array.from(pendingInputs.entries()).pop()!;
        const message = description
          ? `[USER REQUEST: Please generate a new page - ${description}]`
          : '[USER REQUEST: Please generate another page for me]';
        pending.resolve(message);
        pendingInputs.delete(key);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[UIServer] Client disconnected: ${socket.id}`);
      connectedClients.delete(socket.id);

      // In dev mode, don't shutdown - allow multiple tabs
      if (isDev) {
        return;
      }

      // Production mode: if main client disconnects, start grace period
      if (socket.id === mainClientId) {
        console.log(`[UIServer] Main client disconnected, starting ${MAIN_CLIENT_GRACE_PERIOD_MS}ms grace period...`);
        mainClientId = null; // Allow reconnection to claim main role

        mainClientDisconnectTimer = setTimeout(() => {
          console.log(`[UIServer] Grace period expired, no reconnection - shutting down orchestrator`);
          process.stdout.write('\n\x1b[33mMain UI tab closed. Goodbye!\x1b[0m\n');
          process.exit(0);
        }, MAIN_CLIENT_GRACE_PERIOD_MS);
      }
    });
  });

  // Helper methods to emit events
  const emitStatus = (project: string, status: AgentStatus, message: string) => {
    io.emit('status', { project, status, message });
  };

  const emitLog = (entry: LogEntry) => {
    io.emit('log', entry);
  };

  const emitChat = (from: 'user' | 'planning', message: string) => {
    console.log(`[UIServer] Emitting chat from ${from}: ${message.substring(0, 80)}...`);
    io.emit('chat', { from, message, timestamp: Date.now() });
  };

  const emitSession = (session: Session) => {
    io.emit('session', session);
  };

  const emitSessionCreated = (session: Session) => {
    io.emit('sessionCreated', session);
  };

  const emitAllComplete = () => {
    io.emit('allComplete');
  };

  // Emit streaming chat events for agentic UI
  const emitChatStream = (event: ChatStreamEvent) => {
    io.emit('chatStream', event);
  };

  // Emit task status events
  const emitTaskStatus = (event: TaskStatusEvent) => {
    io.emit('taskStatus', event);
  };

  // Emit all task states (for full sync)
  const emitTaskStates = (states: TaskState[]) => {
    io.emit('taskStates', states);
  };

  // Emit planning status events for UX feedback
  const emitPlanningStatus = (event: PlanningStatusEvent) => {
    io.emit('planningStatus', event);
  };

  // Emit analysis result events for structured results display
  const emitAnalysisResult = (event: AnalysisResultEvent) => {
    io.emit('analysisResult', event);
  };

  // ═══════════════════════════════════════════════════════════════
  // Flow Events (for two-section chat UX)
  // ═══════════════════════════════════════════════════════════════

  // Helper to get session store for flow persistence
  const getSessionStore = () => deps.sessionManager?.getSessionStore();
  const getCurrentSessionId = () => getSessionStore()?.getCurrentSessionId();

  // Emit flow start event (begins a new tracked flow)
  const emitFlowStart = (flow: RequestFlow) => {
    // Track planning flows for approval coordination
    if (flow.type === 'planning') {
      currentPlanningFlowId = flow.id;
    }
    io.emit('flowStart', flow);
    // Persist flow to session
    const sessionId = getCurrentSessionId();
    if (sessionId) {
      getSessionStore()?.addFlow(sessionId, flow);
    }
  };

  // Emit flow step event (adds or updates a step in a flow)
  const emitFlowStep = (flowId: string, step: FlowStep) => {
    io.emit('flowStep', { flowId, step });
    // Persist flow step to session
    const sessionId = getCurrentSessionId();
    if (sessionId) {
      getSessionStore()?.addFlowStep(sessionId, flowId, step);
    }
  };

  // Emit flow complete event (marks flow as completed or failed)
  const emitFlowComplete = (flowId: string, status: FlowStatus, result?: { passed: boolean; summary?: string; details?: string }) => {
    const timestamp = Date.now();
    io.emit('flowComplete', { flowId, status, result, timestamp });
    // Persist flow completion to session
    const sessionId = getCurrentSessionId();
    if (sessionId) {
      getSessionStore()?.completeFlow(sessionId, flowId, status, result, timestamp);
    }
  };

  // Emit flow update event (updates an existing flow's result/summary and optionally type)
  const emitFlowUpdate = (flowId: string, result: { passed: boolean; summary?: string; details?: string }, type?: string) => {
    io.emit('flowUpdate', { flowId, result, type, timestamp: Date.now() });
    // Persist flow update to session
    const sessionId = getCurrentSessionId();
    if (sessionId) {
      getSessionStore()?.updateFlow(sessionId, flowId, { result, type: type as RequestFlow['type'] });
    }
  };

  // Emit instant flow (already completed - goes straight to history)
  // This is for events like "Plan Approved" that don't need an active state
  const emitInstantFlow = (flow: Omit<RequestFlow, 'status' | 'completedAt'> & { result?: { passed: boolean; summary?: string; details?: string } }) => {
    const completeFlow: RequestFlow = {
      ...flow,
      status: 'completed' as FlowStatus,
      completedAt: Date.now(),
    };
    io.emit('flowStart', completeFlow);  // Emit as flowStart so frontend processes it
    // Persist instant flow to session (already complete)
    const sessionId = getCurrentSessionId();
    if (sessionId) {
      getSessionStore()?.addFlow(sessionId, completeFlow);
    }
  };

  // Track the current planning flow ID for coordinating plan approval
  let currentPlanningFlowId: string | null = null;

  // ═══════════════════════════════════════════════════════════════
  // Designer Agent Endpoints (for design-first workflow)
  // ═══════════════════════════════════════════════════════════════

  // Design session phases (state machine)
  type DesignSessionPhase =
    | 'discovery'           // Initial chat
    | 'generating_theme'  // Generating theme
    | 'theme_preview'     // Showing theme options
    | 'component_discovery' // Chat about component preferences
    | 'generating_component'// Generating components
    | 'component_preview'   // Showing component options
    | 'layout_discovery'    // Chat about layout preferences
    | 'generating_mockup'   // Generating mockups
    | 'mockup_preview'      // Showing mockup options
    | 'complete';           // Design saved

  // Track session phases
  const designSessionPhases = new Map<string, DesignSessionPhase>();

  // Valid phase transitions
  const validTransitions: Record<DesignSessionPhase, DesignSessionPhase[]> = {
    discovery: ['generating_theme'],
    generating_theme: ['theme_preview'],
    theme_preview: ['component_discovery', 'generating_theme'], // can refine
    component_discovery: ['generating_component'],
    generating_component: ['component_preview'],
    component_preview: ['layout_discovery', 'generating_component'], // can refine
    layout_discovery: ['generating_mockup'],
    generating_mockup: ['mockup_preview'],
    mockup_preview: ['complete', 'generating_mockup'], // can refine
    complete: [],
  };

  // Helper to validate and transition phase
  const transitionPhase = (sessionId: string, targetPhase: DesignSessionPhase): boolean => {
    const currentPhase = designSessionPhases.get(sessionId) || 'discovery';
    const allowed = validTransitions[currentPhase];

    if (!allowed.includes(targetPhase)) {
      console.log(`[UIServer] Invalid phase transition: ${currentPhase} -> ${targetPhase} (session ${sessionId})`);
      return false;
    }

    console.log(`[UIServer] Phase transition: ${currentPhase} -> ${targetPhase} (session ${sessionId})`);
    designSessionPhases.set(sessionId, targetPhase);
    return true;
  };

  // Store pending designer requests (key -> resolver)
  const pendingDesignerInputs = new Map<string, {
    resolve: (message: string) => void;
  }>();

  const pendingDesignerCategories = new Map<string, {
    resolve: (category: string) => void;
  }>();

  const pendingDesignerPreviews = new Map<string, {
    resolve: (result: { selected?: number; feedback?: string }) => void;
  }>();

  // Designer: request user input (unlocks chat input)
  app.post('/api/designer/request-input', async (req: Request, res: Response) => {
    const { sessionId, placeholder } = req.body;
    const key = `input_${sessionId}_${Date.now()}`;

    console.log(`[UIServer] Designer input requested for session ${sessionId}`);

    // Emit unlock event to frontend
    io.emit('design:unlock_input', { placeholder });

    // Create promise that will resolve when user responds
    const message = await new Promise<string>((resolve) => {
      pendingDesignerInputs.set(key, { resolve });

      // Timeout after 10 minutes
      setTimeout(() => {
        if (pendingDesignerInputs.has(key)) {
          pendingDesignerInputs.delete(key);
          resolve('');
        }
      }, 600000);
    });

    pendingDesignerInputs.delete(key);

    // Emit lock event
    io.emit('design:lock_input');

    res.send(message);
  });

  // Designer: start generating (shows loading indicator)
  app.post('/api/designer/start-generating', (req: Request, res: Response) => {
    const { sessionId, type } = req.body;
    const messages: Record<string, string> = {
      theme: 'Generating theme options...',
      component: 'Generating component styles...',
      mockup: 'Generating mockups...',
    };

    // Map type to target phase
    const phaseMap: Record<string, DesignSessionPhase> = {
      theme: 'generating_theme',
      component: 'generating_component',
      mockup: 'generating_mockup',
    };
    const targetPhase = phaseMap[type as string];

    // Validate type and phase transition
    if (!targetPhase || !transitionPhase(sessionId, targetPhase)) {
      res.status(400).send(JSON.stringify({
        error: `Cannot start generating ${type} in current phase`
      }));
      return;
    }

    console.log(`[UIServer] Designer start generating: ${type}`);

    // Emit generating event to frontend
    io.emit('design:generating', { type, message: messages[type] || `Generating ${type}...` });

    res.send('ok');
  });

  // Designer: show category selector
  app.post('/api/designer/show-categories', async (req: Request, res: Response) => {
    const { sessionId } = req.body;
    const key = `category_${sessionId}_${Date.now()}`;

    console.log(`[UIServer] Designer category selector for session ${sessionId}`);

    // Emit show categories event
    io.emit('design:show_category_selector', {
      categories: [
        { id: 'blog', name: 'Blog', description: 'Personal blogs, company blogs, newsletters' },
        { id: 'landing_page', name: 'Landing Page', description: 'Product launches, marketing pages' },
        { id: 'ecommerce', name: 'E-commerce', description: 'Online stores, product catalogs' },
        { id: 'dashboard', name: 'Dashboard', description: 'Admin panels, analytics, data management' },
        { id: 'chat_messaging', name: 'Chat / Messaging', description: 'Chat interfaces, support widgets' },
        { id: 'documentation', name: 'Documentation', description: 'Technical docs, API references' },
        { id: 'saas_marketing', name: 'SaaS Marketing', description: 'Pricing pages, feature showcases' },
        { id: 'portfolio', name: 'Portfolio', description: 'Personal portfolios, agency sites' },
      ]
    });

    // Create promise that will resolve when user selects
    const category = await new Promise<string>((resolve) => {
      pendingDesignerCategories.set(key, { resolve });

      // Timeout after 10 minutes
      setTimeout(() => {
        if (pendingDesignerCategories.has(key)) {
          pendingDesignerCategories.delete(key);
          resolve('blog'); // Default
        }
      }, 600000);
    });

    pendingDesignerCategories.delete(key);
    res.send(JSON.stringify({ category }));
  });

  // ═══════════════════════════════════════════════════════════════
  // Zero-HTML Architecture: Generation Start Endpoints
  // These return paths for Claude to use with native Read/Write tools
  // ═══════════════════════════════════════════════════════════════

  // Designer: start theme generation (returns paths for CSS writing)
  app.post('/api/designer/start-theme-generation', (req: Request, res: Response) => {
    const { sessionId } = req.body;

    console.log(`[UIServer] Start theme generation for session ${sessionId}`);

    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).json({ error: 'Designer agent not available' });
      return;
    }

    const paths = designerAgent.getSessionPaths();
    if (!paths) {
      res.status(500).json({ error: 'Session paths not initialized' });
      return;
    }

    // Transition phase
    designSessionPhases.set(sessionId, 'generating_theme');

    // Emit generating event to frontend
    io.emit('design:generating', { type: 'theme', message: 'Generating theme options...' });

    // Return paths for Claude to use with Read/Write tools
    res.json({
      templatePath: paths.themeTemplate,
      outputDir: paths.drafts,
      count: 3,
      instructions: 'Write CSS files: theme-0.css, theme-1.css, theme-2.css to outputDir'
    });
  });

  // Designer: start component generation (returns paths for HTML writing)
  app.post('/api/designer/start-component-generation', (req: Request, res: Response) => {
    const { sessionId } = req.body;

    console.log(`[UIServer] Start component generation for session ${sessionId}`);

    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).json({ error: 'Designer agent not available' });
      return;
    }

    const paths = designerAgent.getSessionPaths();
    if (!paths) {
      res.status(500).json({ error: 'Session paths not initialized' });
      return;
    }

    // Transition phase
    designSessionPhases.set(sessionId, 'generating_component');

    // Emit generating event to frontend
    io.emit('design:generating', { type: 'component', message: 'Generating component styles...' });

    // Return paths - themePath points to saved theme.css for reading CSS vars
    res.json({
      themePath: path.join(paths.root, 'theme.css'),
      outputDir: paths.drafts,
      count: 3,
      instructions: 'Read theme.css for CSS variables, then write HTML files: component-0.html, component-1.html, component-2.html to outputDir'
    });
  });

  // Designer: start mockup generation (returns paths for HTML writing)
  app.post('/api/designer/start-mockup-generation', (req: Request, res: Response) => {
    const { sessionId } = req.body;

    console.log(`[UIServer] Start mockup generation for session ${sessionId}`);

    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).json({ error: 'Designer agent not available' });
      return;
    }

    const paths = designerAgent.getSessionPaths();
    if (!paths) {
      res.status(500).json({ error: 'Session paths not initialized' });
      return;
    }

    // Transition phase
    designSessionPhases.set(sessionId, 'generating_mockup');

    // Emit generating event to frontend
    io.emit('design:generating', { type: 'mockup', message: 'Generating mockups...' });

    // Get existing pages for reference
    const existingPages = designerAgent.getPages() || [];

    // Return paths - themePath and componentsPath for reading, pagesDir for existing pages, outputDir for writing
    res.json({
      themePath: path.join(paths.root, 'theme.css'),
      componentsPath: path.join(paths.root, 'components.html'),
      pagesDir: paths.root, // Existing pages are saved here
      outputDir: paths.drafts,
      existingPages: existingPages.map((p: any) => ({
        name: p.name,
        filename: p.filename,
        path: path.join(paths.root, p.filename)
      })),
      count: 3,
      instructions: 'Read theme.css and components.html for context. IMPORTANT: If existingPages has items, read them using their FULL PATH (existingPages[].path) to match the design. Write HTML files to outputDir.'
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // Zero-HTML Architecture: Preview Show Endpoints (with auto-save)
  // ═══════════════════════════════════════════════════════════════

  // Designer: show theme preview (new Zero-HTML version)
  app.post('/api/designer/show-theme-preview', async (req: Request, res: Response) => {
    const { sessionId, options } = req.body;
    const key = `theme_${sessionId}_${Date.now()}`;

    console.log(`[UIServer] Show theme preview for session ${sessionId}: ${options?.length || 0} options`);

    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).json({ error: 'Designer agent not available' });
      return;
    }

    // Transition to theme_preview
    designSessionPhases.set(sessionId, 'theme_preview');

    // Clear generating state and show preview
    io.emit('design:generation_complete');
    io.emit('design:show_preview', { type: 'theme', options });

    // Wait for user response
    const result = await new Promise<{ selected?: number; feedback?: string; refine?: number }>((resolve) => {
      pendingDesignerPreviews.set(key, { resolve });
      setTimeout(() => {
        if (pendingDesignerPreviews.has(key)) {
          pendingDesignerPreviews.delete(key);
          resolve({ selected: 0 });
        }
      }, 600000);
    });

    pendingDesignerPreviews.delete(key);

    // Auto-save if user selected
    if (result.selected !== undefined) {
      try {
        designerAgent.autoSaveSelectedDraft('theme', result.selected);
        designSessionPhases.set(sessionId, 'component_discovery');
        res.json({ selected: result.selected, autoSaved: true });
      } catch (err) {
        console.error('[UIServer] Failed to auto-save theme:', err);
        res.json({ selected: result.selected, autoSaved: false });
      }
    } else if (result.refine !== undefined) {
      // Include draftsDir so Claude knows where to read the CSS
      const paths = designerAgent.getSessionPaths();
      res.json({
        refine: result.refine,
        draftsDir: paths?.drafts,
        cssPath: paths ? `${paths.drafts}/theme-${result.refine}.css` : undefined
      });
    } else if (result.feedback) {
      designSessionPhases.set(sessionId, 'discovery');
      res.json({ feedback: result.feedback });
    } else {
      res.json(result);
    }
  });

  // Designer: show component preview (new Zero-HTML version)
  app.post('/api/designer/show-component-preview', async (req: Request, res: Response) => {
    const { sessionId, options } = req.body;
    const key = `component_${sessionId}_${Date.now()}`;

    console.log(`[UIServer] Show component preview for session ${sessionId}: ${options?.length || 0} options`);

    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).json({ error: 'Designer agent not available' });
      return;
    }

    // Transition to component_preview
    designSessionPhases.set(sessionId, 'component_preview');

    // Clear generating state and show preview
    io.emit('design:generation_complete');
    io.emit('design:show_preview', { type: 'component', options });

    // Wait for user response
    const result = await new Promise<{ selected?: number; feedback?: string; refine?: number }>((resolve) => {
      pendingDesignerPreviews.set(key, { resolve });
      setTimeout(() => {
        if (pendingDesignerPreviews.has(key)) {
          pendingDesignerPreviews.delete(key);
          resolve({ selected: 0 });
        }
      }, 600000);
    });

    pendingDesignerPreviews.delete(key);

    // Auto-save if user selected
    if (result.selected !== undefined) {
      try {
        designerAgent.autoSaveSelectedDraft('component', result.selected);
        designSessionPhases.set(sessionId, 'layout_discovery');
        res.json({ selected: result.selected, autoSaved: true });
      } catch (err) {
        console.error('[UIServer] Failed to auto-save components:', err);
        res.json({ selected: result.selected, autoSaved: false });
      }
    } else if (result.refine !== undefined) {
      // Include draftsDir so Claude knows where to read the HTML
      const paths = designerAgent.getSessionPaths();
      res.json({
        refine: result.refine,
        draftsDir: paths?.drafts,
        htmlPath: paths ? `${paths.drafts}/component-${result.refine}.html` : undefined
      });
    } else if (result.feedback) {
      designSessionPhases.set(sessionId, 'component_discovery');
      res.json({ feedback: result.feedback });
    } else {
      res.json(result);
    }
  });

  // Designer: show mockup preview (new Zero-HTML version)
  app.post('/api/designer/show-mockup-preview', async (req: Request, res: Response) => {
    const { sessionId, options, pageName } = req.body;
    const key = `mockup_${sessionId}_${Date.now()}`;

    console.log(`[UIServer] Show mockup preview for session ${sessionId}: ${options?.length || 0} options, pageName: "${pageName}"`);

    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).json({ error: 'Designer agent not available' });
      return;
    }

    // Transition to mockup_preview
    designSessionPhases.set(sessionId, 'mockup_preview');

    // Store current options and page name so we can use them when user selects
    designerAgent.currentMockupOptions = options;
    designerAgent.currentMockupPageName = pageName;

    // Clear generating state and show preview
    io.emit('design:generation_complete');
    io.emit('design:show_preview', { type: 'mockup', options });

    // Wait for user response (mockups have additional options: feelingLucky, pageName)
    const result = await new Promise<{ selected?: number; refine?: number; feelingLucky?: boolean; pageName?: string }>((resolve) => {
      // For mockups, we use the pendingMockupSelection on the designerAgent
      designerAgent.pendingMockupSelection = resolve;
      setTimeout(() => {
        if (designerAgent.pendingMockupSelection === resolve) {
          designerAgent.pendingMockupSelection = null;
          resolve({ selected: 0, pageName: 'Page' });
        }
      }, 600000);
    });

    // Auto-save if user selected
    if (result.selected !== undefined) {
      try {
        // Get page name from the stored pageName (set when show_mockup_preview was called)
        const existingPages = designerAgent.getPages();
        const pageName = designerAgent.currentMockupPageName || result.pageName || `Page ${existingPages.length + 1}`;
        console.log(`[UIServer] Mockup selected: index=${result.selected}, pageName="${pageName}"`);

        const { page } = designerAgent.autoSaveSelectedDraft('mockup', result.selected, pageName);
        console.log(`[UIServer] Mockup auto-saved as page: ${page?.name}`);

        const allPages = designerAgent.getPages();
        console.log(`[UIServer] Emitting design:show_pages_panel with ${allPages.length} pages`);
        // Only emit show_pages_panel - it sets the full list
        // Don't also emit page_added as that would duplicate the page
        io.emit('design:show_pages_panel', { pages: allPages });

        res.json({ selected: result.selected, pageName: page?.name || pageName, autoSaved: true });
      } catch (err) {
        console.error('[UIServer] Failed to auto-save mockup:', err);
        res.json({ selected: result.selected, pageName: result.pageName, autoSaved: false });
      }
    } else if (result.refine !== undefined) {
      // Include draftsDir so Claude knows where to read the HTML
      const paths = designerAgent.getSessionPaths();
      res.json({
        refine: result.refine,
        draftsDir: paths?.drafts,
        htmlPath: paths ? `${paths.drafts}/mockup-${result.refine}.html` : undefined
      });
    } else if (result.feelingLucky) {
      // Go back to generating state
      designSessionPhases.set(sessionId, 'generating_mockup');
      res.json({ feelingLucky: true });
    } else {
      res.json(result);
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Legacy Designer Endpoints (kept for backwards compatibility)
  // ═══════════════════════════════════════════════════════════════

  // Designer: show theme preview (legacy)
  app.post('/api/designer/show-theme', async (req: Request, res: Response) => {
    const { sessionId, options } = req.body;
    const key = `theme_${sessionId}_${Date.now()}`;

    // Validate phase - must be in generating_theme
    const currentPhase = designSessionPhases.get(sessionId);
    if (currentPhase !== 'generating_theme') {
      res.status(400).send(JSON.stringify({
        error: `Cannot show theme preview in phase: ${currentPhase}`
      }));
      return;
    }

    // Transition to theme_preview
    designSessionPhases.set(sessionId, 'theme_preview');

    console.log(`[UIServer] Designer theme preview for session ${sessionId}: ${options.length} options`);

    // Clear generating state and show preview
    io.emit('design:generation_complete');
    io.emit('design:show_preview', { type: 'theme', options });

    // Create promise that will resolve when user responds
    const result = await new Promise<{ selected?: number; feedback?: string; refine?: number }>((resolve) => {
      pendingDesignerPreviews.set(key, { resolve });

      // Timeout after 10 minutes
      setTimeout(() => {
        if (pendingDesignerPreviews.has(key)) {
          pendingDesignerPreviews.delete(key);
          resolve({ selected: 0 }); // Default to first option
        }
      }, 600000);
    });

    pendingDesignerPreviews.delete(key);

    // Transition based on result
    if (result.selected !== undefined) {
      // User selected - move to component discovery
      designSessionPhases.set(sessionId, 'component_discovery');
    } else if (result.refine !== undefined) {
      // User wants to refine this option - stay in theme_preview but enter refine mode
      // The agent will handle refinement via chat
      designSessionPhases.set(sessionId, 'theme_preview');
    } else if (result.feedback) {
      // User gave feedback - go back to discovery for more chat
      designSessionPhases.set(sessionId, 'discovery');
    }

    res.send(JSON.stringify(result));
  });

  // Designer: show component preview
  app.post('/api/designer/show-components', async (req: Request, res: Response) => {
    const { sessionId, options } = req.body;
    const key = `components_${sessionId}_${Date.now()}`;

    // Validate phase - must be in generating_component
    const currentPhase = designSessionPhases.get(sessionId);
    if (currentPhase !== 'generating_component') {
      res.status(400).send(JSON.stringify({
        error: `Cannot show component preview in phase: ${currentPhase}`
      }));
      return;
    }

    // Transition to component_preview
    designSessionPhases.set(sessionId, 'component_preview');

    console.log(`[UIServer] Designer component preview for session ${sessionId}: ${options.length} options`);

    // Clear generating state and show preview
    io.emit('design:generation_complete');
    io.emit('design:show_preview', { type: 'component', options });

    // Create promise that will resolve when user responds
    const result = await new Promise<{ selected?: number; feedback?: string }>((resolve) => {
      pendingDesignerPreviews.set(key, { resolve });

      setTimeout(() => {
        if (pendingDesignerPreviews.has(key)) {
          pendingDesignerPreviews.delete(key);
          resolve({ selected: 0 });
        }
      }, 600000);
    });

    pendingDesignerPreviews.delete(key);

    // Transition based on result
    if (result.selected !== undefined) {
      // User selected - move to layout discovery
      designSessionPhases.set(sessionId, 'layout_discovery');
    } else if (result.feedback) {
      // User gave feedback - go back to component discovery for more chat
      designSessionPhases.set(sessionId, 'component_discovery');
    }

    res.send(JSON.stringify(result));
  });

  // Designer: show mockup preview
  app.post('/api/designer/show-mockups', async (req: Request, res: Response) => {
    const { sessionId, options } = req.body;
    const key = `mockups_${sessionId}_${Date.now()}`;

    // Validate phase - must be in generating_mockup
    const currentPhase = designSessionPhases.get(sessionId);
    if (currentPhase !== 'generating_mockup') {
      res.status(400).send(JSON.stringify({
        error: `Cannot show mockup preview in phase: ${currentPhase}`
      }));
      return;
    }

    // Transition to mockup_preview
    designSessionPhases.set(sessionId, 'mockup_preview');

    console.log(`[UIServer] Designer mockup preview for session ${sessionId}: ${options.length} options`);

    // Clear generating state and show preview
    io.emit('design:generation_complete');
    io.emit('design:show_preview', { type: 'mockup', options });

    // Create promise that will resolve when user responds
    const result = await new Promise<{ selected?: number; feedback?: string }>((resolve) => {
      pendingDesignerPreviews.set(key, { resolve });

      setTimeout(() => {
        if (pendingDesignerPreviews.has(key)) {
          pendingDesignerPreviews.delete(key);
          resolve({ selected: 0 });
        }
      }, 600000);
    });

    pendingDesignerPreviews.delete(key);

    // Transition based on result
    if (result.feedback) {
      // User gave feedback - go back to layout discovery for more chat
      designSessionPhases.set(sessionId, 'layout_discovery');
    }
    // If selected, stay in mockup_preview - save_design will transition to complete

    res.send(JSON.stringify(result));
  });

  // Designer: save design
  app.post('/api/designer/save-design', async (req: Request, res: Response) => {
    const { sessionId, name, tokens, guidelines } = req.body;

    console.log(`[UIServer] Designer save design for session ${sessionId}: ${name}`);

    // Emit to frontend (actual save happens in DesignerAgentManager)
    io.emit('design:save_request', { name, tokens, guidelines });

    // The actual save is handled by the DesignerAgentManager
    // We just acknowledge receipt here
    res.send(JSON.stringify({ status: 'save_requested' }));
  });

  // Designer: save selected artifact (theme, components, or mockup)
  // All artifacts are now just HTML - CSS variables in the HTML serve as design tokens
  app.post('/api/designer/save-artifact', async (req: Request, res: Response) => {
    const { sessionId, type, html } = req.body;

    console.log(`[UIServer] Designer save artifact for session ${sessionId}: ${type}`);

    // Get the designer agent manager
    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).send(JSON.stringify({ error: 'Designer agent not available' }));
      return;
    }

    try {
      let result;
      switch (type) {
        case 'theme':
          result = await designerAgent.handleSaveSelectedTheme({ html });
          break;
        case 'components':
          result = await designerAgent.handleSaveSelectedComponents({ html });
          break;
        default:
          res.status(400).send(JSON.stringify({ error: `Unknown artifact type: ${type}` }));
          return;
      }

      res.send(JSON.stringify({ status: 'saved', ...result }));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[UIServer] Failed to save artifact: ${error}`);
      res.status(500).send(JSON.stringify({ error }));
    }
  });

  // Designer: load previous artifacts for chaining context
  app.post('/api/designer/load-artifacts', async (req: Request, res: Response) => {
    const { sessionId, artifacts } = req.body;

    console.log(`[UIServer] Designer load artifacts for session ${sessionId}: ${artifacts.join(', ')}`);

    // Get the designer agent manager
    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).send(JSON.stringify({ error: 'Designer agent not available' }));
      return;
    }

    try {
      const loadedArtifacts = designerAgent.loadPreviousArtifacts(artifacts);
      res.send(JSON.stringify({ artifacts: loadedArtifacts }));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[UIServer] Failed to load artifacts: ${error}`);
      res.status(500).send(JSON.stringify({ error }));
    }
  });

  // Designer: save a named page (replaces mockup saving)
  app.post('/api/designer/save-page', async (req: Request, res: Response) => {
    const { sessionId, html, name } = req.body;

    console.log(`[UIServer] Designer save page for session ${sessionId}: ${name}`);

    // Get the designer agent manager
    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).send(JSON.stringify({ error: 'Designer agent not available' }));
      return;
    }

    try {
      const result = await designerAgent.handleSavePage({ html, name });
      res.send(JSON.stringify({ status: 'saved', page: result.page }));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[UIServer] Failed to save page: ${error}`);
      res.status(500).send(JSON.stringify({ error }));
    }
  });

  // Designer: show pages panel on the right side
  app.post('/api/designer/show-pages-panel', async (req: Request, res: Response) => {
    const { sessionId } = req.body;

    console.log(`[UIServer] Designer show pages panel for session ${sessionId}`);

    // Get the designer agent manager
    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).send(JSON.stringify({ error: 'Designer agent not available' }));
      return;
    }

    const pages = designerAgent.getPages();

    // Emit show pages panel event to frontend
    io.emit('design:show_pages_panel', { pages });

    res.send(JSON.stringify({ status: 'ok', pages }));
  });

  // Designer: get all pages in the session
  app.post('/api/designer/get-pages', async (req: Request, res: Response) => {
    const { sessionId } = req.body;

    console.log(`[UIServer] Designer get pages for session ${sessionId}`);

    // Get the designer agent manager
    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).send(JSON.stringify({ error: 'Designer agent not available' }));
      return;
    }

    const pages = designerAgent.getPages();
    res.send(JSON.stringify({ pages }));
  });

  // Designer: get page HTML content by ID
  app.post('/api/designer/get-page-html', async (req: Request, res: Response) => {
    const { sessionId, pageId } = req.body;

    console.log(`[UIServer] Designer get page HTML for session ${sessionId}: ${pageId}`);

    // Get the designer agent manager
    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).send(JSON.stringify({ error: 'Designer agent not available' }));
      return;
    }

    const html = designerAgent.getPageHtml(pageId);
    if (html === null) {
      res.status(404).send(JSON.stringify({ error: 'Page not found' }));
      return;
    }

    res.send(JSON.stringify({ html }));
  });

  // Designer: save mockup draft (for performance optimization)
  app.post('/api/designer/save-mockup-draft', async (req: Request, res: Response) => {
    const { sessionId, html, index } = req.body;

    console.log(`[UIServer] Designer save mockup draft for session ${sessionId}: index ${index}`);

    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).send(JSON.stringify({ error: 'Designer agent not available' }));
      return;
    }

    try {
      const filename = designerAgent.saveMockupDraft(html, index);
      res.send(JSON.stringify({ status: 'saved', filename, index }));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[UIServer] Failed to save mockup draft: ${error}`);
      res.status(500).send(JSON.stringify({ error }));
    }
  });

  // Designer: get draft HTML by type and index (Zero-HTML Architecture)
  // - theme: CSS is injected into template, returns combined HTML
  // - component/mockup: Returns HTML directly
  app.get('/api/designer/draft/:type/:index', (req: Request, res: Response) => {
    const { type, index } = req.params;
    const indexNum = parseInt(index, 10);

    console.log(`[UIServer] GET /api/designer/draft/${type}/${index}`);

    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).send('Designer agent not available');
      return;
    }

    if (!['theme', 'component', 'mockup'].includes(type)) {
      res.status(400).send('Invalid draft type. Must be theme, component, or mockup.');
      return;
    }

    const html = designerAgent.getDraft(type as 'theme' | 'component' | 'mockup', indexNum);
    if (html) {
      res.type('html').send(html);
    } else {
      res.status(404).send('Draft not found');
    }
  });

  // Legacy endpoint for backwards compatibility
  app.get('/api/designer/draft/:index', (req: Request, res: Response) => {
    const index = parseInt(req.params.index, 10);

    console.log(`[UIServer] GET /api/designer/draft/${index} (legacy)`);

    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).send('Designer agent not available');
      return;
    }

    const html = designerAgent.getMockupDraft(index);
    if (html) {
      res.type('html').send(html);
    } else {
      res.status(404).send('Draft not found');
    }
  });

  // Designer: save design folder (from complete stage)
  app.post('/api/designer/save-design-folder', async (req: Request, res: Response) => {
    const { designName } = req.body;

    console.log(`[UIServer] Save design folder: ${designName}`);

    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).json({ error: 'Designer agent not available' });
      return;
    }

    try {
      const result = await designerAgent.handleSaveDesignFolder(designName);
      res.json({ status: 'saved', path: result.path, folder: result.folder });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[UIServer] Failed to save design folder: ${error}`);
      res.status(500).json({ error });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Design Library REST API
  // ═══════════════════════════════════════════════════════════════

  // GET /api/designs - List all saved design folders
  app.get('/api/designs', (req: Request, res: Response) => {
    console.log(`[UIServer] GET /api/designs - listing design folders`);

    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).json({ error: 'Designer agent not available' });
      return;
    }

    try {
      const folders = designerAgent.getSavedDesignFolders();
      res.json({ designs: folders });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[UIServer] Failed to list designs: ${error}`);
      res.status(500).json({ error });
    }
  });

  // GET /api/designs/:name - Get design folder contents
  app.get('/api/designs/:name', (req: Request, res: Response) => {
    const { name } = req.params;
    console.log(`[UIServer] GET /api/designs/${name} - loading contents`);

    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).json({ error: 'Designer agent not available' });
      return;
    }

    try {
      const contents = designerAgent.loadDesignFolderContents(name);
      if (!contents) {
        res.status(404).json({ error: 'Design not found' });
        return;
      }
      res.json(contents);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[UIServer] Failed to load design: ${error}`);
      res.status(500).json({ error });
    }
  });

  // DELETE /api/designs/:name - Delete design folder
  app.delete('/api/designs/:name', (req: Request, res: Response) => {
    const { name } = req.params;
    console.log(`[UIServer] DELETE /api/designs/${name}`);

    const designerAgent = (io as any).designerAgent;
    if (!designerAgent) {
      res.status(500).json({ error: 'Designer agent not available' });
      return;
    }

    try {
      const deleted = designerAgent.deleteDesignFolder(name);
      if (!deleted) {
        res.status(404).json({ error: 'Design not found' });
        return;
      }
      res.json({ status: 'deleted' });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[UIServer] Failed to delete design: ${error}`);
      res.status(500).json({ error });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // Project Design Attachment API
  // ═══════════════════════════════════════════════════════════════

  // POST /api/projects/:projectName/design - Attach design to project
  app.post('/api/projects/:projectName/design', async (req: Request, res: Response) => {
    const { projectName } = req.params;
    const { designName } = req.body;

    console.log(`[UIServer] POST /api/projects/${projectName}/design - attaching ${designName}`);

    const projectManager = (io as any).projectManager;
    if (!projectManager) {
      res.status(500).json({ error: 'Project manager not available' });
      return;
    }

    if (!designName) {
      res.status(400).json({ error: 'designName is required' });
      return;
    }

    try {
      await projectManager.attachDesignToProject(projectName, designName);
      res.json({ status: 'attached', project: projectName, design: designName });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[UIServer] Failed to attach design: ${error}`);
      res.status(500).json({ error });
    }
  });

  // DELETE /api/projects/:projectName/design - Detach design from project
  app.delete('/api/projects/:projectName/design', (req: Request, res: Response) => {
    const { projectName } = req.params;

    console.log(`[UIServer] DELETE /api/projects/${projectName}/design - detaching`);

    const projectManager = (io as any).projectManager;
    if (!projectManager) {
      res.status(500).json({ error: 'Project manager not available' });
      return;
    }

    try {
      projectManager.detachDesignFromProject(projectName);
      res.json({ status: 'detached', project: projectName });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[UIServer] Failed to detach design: ${error}`);
      res.status(500).json({ error });
    }
  });

  // Expose pending designer maps for socket handlers
  (io as any).pendingDesignerInputs = pendingDesignerInputs;
  (io as any).pendingDesignerCategories = pendingDesignerCategories;
  (io as any).pendingDesignerPreviews = pendingDesignerPreviews;
  (io as any).designSessionPhases = designSessionPhases;
  (io as any).transitionPhase = transitionPhase;

  // Finalize function - registers the SPA catch-all route
  // Must be called AFTER all API routes are registered in index.ts
  const finalize = () => {
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(webDistPath, 'index.html'));
    });
    console.log('[UIServer] SPA catch-all route registered');
  };

  // Attach emit helpers to io for external use
  (io as any).emitStatus = emitStatus;
  (io as any).emitLog = emitLog;
  (io as any).emitChat = emitChat;
  (io as any).emitChatStream = emitChatStream;
  (io as any).emitSession = emitSession;
  (io as any).emitSessionCreated = emitSessionCreated;
  (io as any).emitAllComplete = emitAllComplete;
  (io as any).emitTaskStatus = emitTaskStatus;
  (io as any).emitTaskStates = emitTaskStates;
  (io as any).emitPlanningStatus = emitPlanningStatus;
  (io as any).emitAnalysisResult = emitAnalysisResult;
  (io as any).emitFlowStart = emitFlowStart;
  (io as any).emitFlowStep = emitFlowStep;
  (io as any).emitFlowComplete = emitFlowComplete;
  (io as any).emitFlowUpdate = emitFlowUpdate;
  (io as any).emitInstantFlow = emitInstantFlow;
  (io as any).getCurrentPlanningFlowId = () => currentPlanningFlowId;

  return {
    app,
    server,
    io,
    start: () => {
      server.listen(port, () => {
        console.log(`[UIServer] Running at http://localhost:${port}`);
      });
    },
    stop: () => {
      server.close();
      io.close();
    },
    setTaskCompleteHandler: (handler: (request: TaskCompleteRequest) => Promise<TaskCompleteResponse>) => {
      deps.onTaskComplete = handler;
    },
    setPlanApprovalHandler: (handler: (plan: Plan) => Promise<{ status: 'approved' } | { status: 'refine'; feedback: string }>) => {
      deps.onPlanApproval = handler;
    },
    setKillPlanningAgentHandler: (handler: () => void) => {
      deps.onKillPlanningAgent = handler;
    },
    setGetNextPromptHandler: (handler: GetNextPromptHandler) => {
      getNextPromptHandler = handler;
    },
    setGitHubSecretHandler: (handler: (repo: string, name: string, value: string) => Promise<{ success: boolean; error?: string }>) => {
      deps.onSetGitHubSecret = handler;
    },
    finalize,
  };
}
