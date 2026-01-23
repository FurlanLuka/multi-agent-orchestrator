import express, { Express, Request, Response } from 'express';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { StatusMonitor } from '../core/status-monitor';
import { ApprovalQueue } from '../core/approval-queue';
import { LogAggregator } from '../core/log-aggregator';
import { SessionManager } from '../core/session-manager';
import { Session, Plan, LogEntry, ApprovalRequest, AgentStatus, ChatStreamEvent, TaskStatusEvent, TaskState } from '../types';

export interface UIServerDependencies {
  statusMonitor: StatusMonitor;
  approvalQueue: ApprovalQueue;
  logAggregator: LogAggregator;
  sessionManager: SessionManager;
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
  const webDistPath = path.join(__dirname, '../../web/dist');
  app.use(express.static(webDistPath));

  // REST API endpoints
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: Date.now() });
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
