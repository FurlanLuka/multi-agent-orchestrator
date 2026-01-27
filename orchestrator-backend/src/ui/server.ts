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
import { Session, Plan, LogEntry, ApprovalRequest, AgentStatus, ChatStreamEvent, TaskStatusEvent, TaskState, PlanningStatusEvent, AnalysisResultEvent, VerificationStartEvent, E2EStartEvent, E2EAnalyzingEvent, FixSentEvent, WaitingForProjectEvent, PlanApprovedCardEvent, ChatResponseEvent, UserActionRequiredEvent, UserActionResponseEvent, RequestFlow, FlowStep, FlowStatus } from '@aio/types';
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
}

export interface UIServer {
  app: Express;
  server: HttpServer;
  io: SocketServer;
  start: () => void;
  stop: () => void;
}

export function createUIServer(port: number = 3456, deps?: Partial<UIServerDependencies>): UIServer {
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

    socket.on('approvePlan', (plan: Plan) => {
      console.log(`[UIServer] Plan approved`);
      io.emit('planApproved', plan);
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

  // Emit verification start event (task verification beginning)
  const emitVerificationStart = (event: VerificationStartEvent) => {
    io.emit('verificationStart', event);
  };

  // Emit E2E start event (E2E tests beginning)
  const emitE2EStart = (event: E2EStartEvent) => {
    io.emit('e2eStart', event);
  };

  // Emit E2E analyzing event (analyzing E2E results)
  const emitE2EAnalyzing = (event: E2EAnalyzingEvent) => {
    io.emit('e2eAnalyzing', event);
  };

  // Emit fix sent event (fix sent to another project)
  const emitFixSent = (event: FixSentEvent) => {
    io.emit('fixSent', event);
  };

  // Emit waiting for project event (waiting for dependencies)
  const emitWaitingForProject = (event: WaitingForProjectEvent) => {
    io.emit('waitingForProject', event);
  };

  // Emit plan approved card event
  const emitPlanApprovedCard = (event: PlanApprovedCardEvent) => {
    io.emit('planApprovedCard', event);
  };

  // Emit chat response event (structured response from Planning Agent)
  const emitChatResponse = (event: ChatResponseEvent) => {
    io.emit('chatResponse', event);
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
  (io as any).emitVerificationStart = emitVerificationStart;
  (io as any).emitE2EStart = emitE2EStart;
  (io as any).emitE2EAnalyzing = emitE2EAnalyzing;
  (io as any).emitFixSent = emitFixSent;
  (io as any).emitWaitingForProject = emitWaitingForProject;
  (io as any).emitPlanApprovedCard = emitPlanApprovedCard;
  (io as any).emitChatResponse = emitChatResponse;
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
    }
  };
}
