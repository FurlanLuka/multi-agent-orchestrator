import { useEffect, useState, useCallback, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  Session,
  Plan,
  ProjectState,
  LogEntry,
  ChatMessage,
  ApprovalRequest,
  PlanProposal,
  AgentStatus,
  ProjectTemplateConfig,
  ProjectConfig,
  ProjectTemplate,
  ChatStreamEvent,
  StreamingMessage,
  ContentBlock,
} from '../types';

const SOCKET_URL = 'http://localhost:3456';

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ProjectState>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [currentApproval, setCurrentApproval] = useState<ApprovalRequest | null>(null);
  const [pendingPlan, setPendingPlan] = useState<PlanProposal | null>(null);
  const [allComplete, setAllComplete] = useState(false);
  const [projects, setProjects] = useState<Record<string, ProjectConfig>>({});
  const [templates, setTemplates] = useState<ProjectTemplateConfig[]>([]);
  const [creatingProject, setCreatingProject] = useState(false);

  // Streaming messages for agentic UI
  const [streamingMessages, setStreamingMessages] = useState<StreamingMessage[]>([]);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to orchestrator');
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from orchestrator');
      setConnected(false);
    });

    // Session events
    socket.on('session', (s: Session) => {
      setSession(s);
    });

    socket.on('sessionCreated', (s: Session) => {
      setSession(s);
      setAllComplete(false);
    });

    // Status events
    socket.on('statuses', (s: Record<string, ProjectState>) => {
      setStatuses(s);
    });

    socket.on('status', ({ project, status, message }: { project: string; status: AgentStatus; message: string }) => {
      setStatuses(prev => ({
        ...prev,
        [project]: { status, message, updatedAt: Date.now() }
      }));
    });

    // Log events
    socket.on('log', (entry: LogEntry) => {
      setLogs(prev => [...prev.slice(-500), entry]); // Keep last 500 logs
    });

    // Chat events
    socket.on('chat', (msg: ChatMessage) => {
      setChatHistory(prev => [...prev, { ...msg, timestamp: msg.timestamp || Date.now() }]);
    });

    // Approval events
    socket.on('approval', (request: ApprovalRequest) => {
      setCurrentApproval(request);
    });

    // Plan proposal
    socket.on('planProposal', (proposal: PlanProposal) => {
      setPendingPlan(proposal);
    });

    // All complete
    socket.on('allComplete', () => {
      setAllComplete(true);
    });

    // Streaming chat events for agentic UI
    socket.on('chatStream', (event: ChatStreamEvent) => {
      setStreamingMessages(prev => {
        switch (event.type) {
          case 'message_start': {
            // Create new streaming message
            const newMessage: StreamingMessage = {
              id: event.messageId,
              role: 'assistant',
              content: [],
              status: 'streaming',
              createdAt: Date.now(),
            };
            return [...prev, newMessage];
          }

          case 'content_block': {
            // Add content block to existing message
            if (!event.block) return prev;
            return prev.map(msg =>
              msg.id === event.messageId
                ? { ...msg, content: [...msg.content, event.block as ContentBlock] }
                : msg
            );
          }

          case 'message_complete': {
            // Mark message as complete
            return prev.map(msg =>
              msg.id === event.messageId
                ? { ...msg, status: 'complete' as const }
                : msg
            );
          }

          case 'error': {
            // Mark message as error
            return prev.map(msg =>
              msg.id === event.messageId
                ? { ...msg, status: 'error' as const }
                : msg
            );
          }

          default:
            return prev;
        }
      });
    });

    // Project management events
    socket.on('projects', (p: Record<string, ProjectConfig>) => {
      setProjects(p);
    });

    socket.on('templates', (t: ProjectTemplateConfig[]) => {
      setTemplates(t);
    });

    socket.on('createFromTemplateSuccess', () => {
      setCreatingProject(false);
    });

    socket.on('createFromTemplateError', ({ error }: { error: string }) => {
      setCreatingProject(false);
      console.error('Failed to create project:', error);
    });

    // Request initial data
    socket.emit('getProjects');
    socket.emit('getTemplates');

    return () => {
      socket.disconnect();
    };
  }, []);

  // Actions
  const sendChat = useCallback((message: string) => {
    if (socketRef.current) {
      socketRef.current.emit('chat', message);
      setChatHistory(prev => [...prev, { from: 'user', message, timestamp: Date.now() }]);

      // Also add user message to streaming messages for agentic UI
      const userMessage: StreamingMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: [{ type: 'text', text: message }],
        status: 'complete',
        createdAt: Date.now(),
      };
      setStreamingMessages(prev => [...prev, userMessage]);
    }
  }, []);

  const startSession = useCallback((feature: string, projects: string[]) => {
    if (socketRef.current) {
      socketRef.current.emit('startSession', { feature, projects });
    }
  }, []);

  const approvePlan = useCallback((plan: Plan) => {
    if (socketRef.current) {
      socketRef.current.emit('approvePlan', plan);
      // Auto-start execution after approving the plan
      socketRef.current.emit('startExecution');
      setPendingPlan(null);
    }
  }, []);

  const startExecution = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('startExecution');
    }
  }, []);

  const respondToApproval = useCallback((id: string, approved: boolean) => {
    if (socketRef.current) {
      socketRef.current.emit('approve', { id, approved });
      setCurrentApproval(null);
    }
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const clearStreamingMessages = useCallback(() => {
    setStreamingMessages([]);
  }, []);

  const createProjectFromTemplate = useCallback((name: string, targetPath: string, template: ProjectTemplate, runNpmInstall: boolean = true) => {
    if (socketRef.current) {
      setCreatingProject(true);
      socketRef.current.emit('createFromTemplate', { name, targetPath, template, runNpmInstall });
    }
  }, []);

  const refreshProjects = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('getProjects');
    }
  }, []);

  return {
    connected,
    session,
    statuses,
    logs,
    chatHistory,
    streamingMessages,
    currentApproval,
    pendingPlan,
    allComplete,
    projects,
    templates,
    creatingProject,
    sendChat,
    startSession,
    approvePlan,
    startExecution,
    respondToApproval,
    clearLogs,
    clearStreamingMessages,
    createProjectFromTemplate,
    refreshProjects,
  };
}
