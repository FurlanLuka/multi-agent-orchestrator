import express, { Express, Request, Response } from 'express';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { StatusMonitor } from '../core/status-monitor';
import { ApprovalQueue } from '../core/approval-queue';
import { LogAggregator } from '../core/log-aggregator';
import { SessionManager } from '../core/session-manager';
import { Session, Plan, LogEntry, ApprovalRequest, AgentStatus, ChatStreamEvent, TaskStatusEvent, TaskState, PlanningStatusEvent, PlanApprovalEvent, AnalysisResultEvent, UserActionRequiredEvent, UserActionResponseEvent, RequestFlow, FlowStep, FlowStatus, TaskCompleteRequest, TaskCompleteResponse } from '@aio/types';
import { AVAILABLE_PERMISSIONS, PERMISSION_GROUPS, TEMPLATE_PERMISSIONS, ALWAYS_DENIED, getEnabledGroups } from '@aio/types';
import { getWebDistPath } from '../config/paths';

export interface UIServerDependencies {
  statusMonitor: StatusMonitor;
  approvalQueue: ApprovalQueue;
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
  // Callback for exploration completion (set after PlanningAgent is created)
  onExplorationComplete?: (summary: string) => Promise<string>;
  // Callback for plan approval (set after PlanningAgent is created)
  onPlanApproval?: (plan: Plan) => Promise<{ status: 'approved' } | { status: 'refine'; feedback: string }>;
}

export interface UIServer {
  app: Express;
  server: HttpServer;
  io: SocketServer;
  start: () => void;
  stop: () => void;
  setTaskCompleteHandler: (handler: (request: TaskCompleteRequest) => Promise<TaskCompleteResponse>) => void;
  setExplorationCompleteHandler: (handler: (summary: string) => Promise<string>) => void;
  setPlanApprovalHandler: (handler: (plan: Plan) => Promise<{ status: 'approved' } | { status: 'refine'; feedback: string }>) => void;
}

export function createUIServer(port: number = 3456, initialDeps?: Partial<UIServerDependencies>): UIServer {
  // Use mutable deps object so handlers can be set later
  const deps: Partial<UIServerDependencies> = { ...initialDeps };

  const app = express();
  const server = createServer(app);
  const io = new SocketServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

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

  app.get('/api/approvals', (req: Request, res: Response) => {
    if (deps?.approvalQueue) {
      res.json({
        current: deps.approvalQueue.getCurrentRequest(),
        queue: deps.approvalQueue.getQueue()
      });
    } else {
      res.json({ current: null, queue: [] });
    }
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
    taskIndex: number;
    toolName: string;
    toolInput: Record<string, unknown>;
  }>();

  // ═══════════════════════════════════════════════════════════════
  // Task Complete Handling (for persistent agent task verification)
  // ═══════════════════════════════════════════════════════════════

  // HTTP endpoint for MCP server to call when agent signals task completion
  app.post('/api/task-complete', async (req: Request, res: Response) => {
    const { project, taskIndex, summary } = req.body as TaskCompleteRequest;

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
  // Exploration Complete Handling (for persistent planning agent)
  // ═══════════════════════════════════════════════════════════════

  // HTTP endpoint for MCP server to call when planning agent signals exploration complete
  app.post('/api/exploration-complete', async (req: Request, res: Response) => {
    const { summary } = req.body;

    console.log(`[UIServer] Exploration complete: ${(summary || '').substring(0, 100)}...`);

    // Check if callback is registered
    if (!deps.onExplorationComplete) {
      console.error(`[UIServer] No exploration complete handler registered`);
      res.send('Error: No exploration handler registered. Please generate a plan based on your exploration.');
      return;
    }

    try {
      // Call the handler to generate Phase 2 prompt (blocks until ready)
      const phase2Prompt = await deps.onExplorationComplete(summary || '');
      console.log(`[UIServer] Phase 2 prompt generated (${phase2Prompt.length} chars)`);
      res.send(phase2Prompt);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[UIServer] Exploration complete error:`, err);
      res.send(`Error generating Phase 2 prompt: ${errorMsg}. Please generate a plan based on your exploration.`);
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
    const { project, taskIndex, questions } = req.body;
    const key = `planning_${project}_${taskIndex}_${Date.now()}`;

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
    const { project, taskIndex, toolName, toolInput } = req.body;

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

    if (projectConfig?.permissions?.allow) {
      const allowList = projectConfig.permissions.allow as string[];
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
    io.emit('permissionPrompt', { project, taskIndex, toolName, toolInput });

    // Store resolver - response comes via socket
    const key = `${project}_${taskIndex}`;
    pendingPermissions.set(key, {
      resolve: (result: string) => {
        res.send(result);  // "allow" or "deny"
      },
      project,
      taskIndex,
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

  // Fallback to index.html for SPA routing
  app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(webDistPath, 'index.html'));
  });

  // Socket.io connection handling
  io.on('connection', (socket: Socket) => {
    console.log(`[UIServer] Client connected: ${socket.id}`);

    // Send current state on connect
    if (deps?.sessionManager) {
      const session = deps.sessionManager.getCurrentSession();
      if (session) {
        socket.emit('session', session);
      }
    }

    if (deps?.statusMonitor) {
      socket.emit('statuses', deps.statusMonitor.getStatusesObject());
      // Send initial task states
      socket.emit('taskStates', deps.statusMonitor.getAllTaskStates());
    }

    if (deps?.approvalQueue) {
      const current = deps.approvalQueue.getCurrentRequest();
      if (current) {
        socket.emit('approval', current);
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

    socket.on('approve', ({ id, approved }: { id: string; approved: boolean }) => {
      console.log(`[UIServer] Approval response: ${id} = ${approved}`);
      if (deps?.approvalQueue) {
        deps.approvalQueue.respond(id, approved);
      }
    });

    // Handle user action response (user submitted credentials/config values)
    socket.on('userActionResponse', (response: UserActionResponseEvent) => {
      console.log(`[UIServer] User action response for task #${response.taskIndex}`);
      io.emit('userActionResponse', response);  // Forward to orchestrator
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
        // Emit status BEFORE resolving
        io.emit('planningStatus', { phase: 'complete', message: 'Plan approved!' });
        pending.resolve({ status: 'approved' });
        (io as any).pendingPlanApprovals.delete(approvalId);
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

    socket.on('disconnect', () => {
      console.log(`[UIServer] Client disconnected: ${socket.id}`);
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

  const emitApproval = (request: ApprovalRequest) => {
    io.emit('approval', request);
  };

  const emitSession = (session: Session) => {
    io.emit('session', session);
  };

  const emitSessionCreated = (session: Session) => {
    io.emit('sessionCreated', session);
  };

  const emitPlanProposal = (plan: Plan, summary: string) => {
    io.emit('planProposal', { plan, summary });
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

  // Emit user action required event (task needs user input)
  const emitUserActionRequired = (event: UserActionRequiredEvent) => {
    io.emit('userActionRequired', event);
  };

  // ═══════════════════════════════════════════════════════════════
  // Flow Events (for two-section chat UX)
  // ═══════════════════════════════════════════════════════════════

  // Emit flow start event (begins a new tracked flow)
  const emitFlowStart = (flow: RequestFlow) => {
    io.emit('flowStart', flow);
  };

  // Emit flow step event (adds or updates a step in a flow)
  const emitFlowStep = (flowId: string, step: FlowStep) => {
    io.emit('flowStep', { flowId, step });
  };

  // Emit flow complete event (marks flow as completed or failed)
  const emitFlowComplete = (flowId: string, status: FlowStatus, result?: { passed: boolean; summary?: string; details?: string }) => {
    io.emit('flowComplete', { flowId, status, result, timestamp: Date.now() });
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
  };

  // Attach emit helpers to io for external use
  (io as any).emitStatus = emitStatus;
  (io as any).emitLog = emitLog;
  (io as any).emitChat = emitChat;
  (io as any).emitChatStream = emitChatStream;
  (io as any).emitApproval = emitApproval;
  (io as any).emitSession = emitSession;
  (io as any).emitSessionCreated = emitSessionCreated;
  (io as any).emitPlanProposal = emitPlanProposal;
  (io as any).emitAllComplete = emitAllComplete;
  (io as any).emitTaskStatus = emitTaskStatus;
  (io as any).emitTaskStates = emitTaskStates;
  (io as any).emitPlanningStatus = emitPlanningStatus;
  (io as any).emitAnalysisResult = emitAnalysisResult;
  (io as any).emitUserActionRequired = emitUserActionRequired;
  (io as any).emitFlowStart = emitFlowStart;
  (io as any).emitFlowStep = emitFlowStep;
  (io as any).emitFlowComplete = emitFlowComplete;
  (io as any).emitInstantFlow = emitInstantFlow;

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
    setExplorationCompleteHandler: (handler: (summary: string) => Promise<string>) => {
      deps.onExplorationComplete = handler;
    },
    setPlanApprovalHandler: (handler: (plan: Plan) => Promise<{ status: 'approved' } | { status: 'refine'; feedback: string }>) => {
      deps.onPlanApproval = handler;
    }
  };
}
