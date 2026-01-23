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
  QueueStatus,
  ProjectTestState,
  TestStatusEvent,
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

  // Queue status for Planning Agent visibility
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);

  // Test states for E2E test tracking per project
  const [testStates, setTestStates] = useState<Record<string, ProjectTestState>>({});

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

      // Initialize test scenarios when project enters E2E state
      if (status === 'E2E') {
        setSession(currentSession => {
          if (currentSession?.plan?.testPlan?.[project]) {
            const scenarios = currentSession.plan.testPlan[project];
            setTestStates(prev => ({
              ...prev,
              [project]: {
                scenarios: scenarios.map(name => ({ name, status: 'pending' as const })),
                updatedAt: Date.now()
              }
            }));
          }
          return currentSession;
        });
      }
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

    // Plan cleared (user continued conversation)
    socket.on('planCleared', () => {
      setPendingPlan(null);
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
            // Also mark the most recent queued user message as complete
            // (since we're now processing a response for it)
            const updatedPrev = prev.map((msg, idx) => {
              // Find the last queued user message before this new assistant message
              if (msg.role === 'user' && msg.status === 'queued') {
                // Check if there's no assistant message after it yet
                const hasAssistantAfter = prev.slice(idx + 1).some(m => m.role === 'assistant');
                if (!hasAssistantAfter) {
                  return { ...msg, status: 'complete' as const };
                }
              }
              return msg;
            });
            return [...updatedPrev, newMessage];
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

    // Queue status events (for Planning Agent visibility)
    socket.on('queueUpdate', (status: { size: number; events: QueueStatus['events'] }) => {
      setQueueStatus(prev => ({
        ...prev,
        size: status.size,
        events: status.events,
        processing: prev?.processing,
      }));
    });

    socket.on('queueProcessing', (processing: QueueStatus['processing'] | null) => {
      setQueueStatus(prev => prev ? { ...prev, processing: processing || undefined } : { size: 0, events: [], processing: processing || undefined });

      // When a user_chat starts processing, mark queued user messages as complete
      if (processing?.type === 'user_chat') {
        setStreamingMessages(prev => prev.map(msg =>
          msg.role === 'user' && msg.status === 'queued'
            ? { ...msg, status: 'complete' as const }
            : msg
        ));
      }
    });

    // Test status events for real-time E2E test tracking
    socket.on('testStatus', (event: TestStatusEvent) => {
      setTestStates(prev => {
        const projectState = prev[event.project];
        if (!projectState) {
          // Create a new state with just this scenario
          return {
            ...prev,
            [event.project]: {
              scenarios: [{ name: event.scenario, status: event.status, error: event.error }],
              updatedAt: Date.now()
            }
          };
        }

        // Update existing scenario or add new one
        const scenarioExists = projectState.scenarios.some(s => s.name === event.scenario);
        const updatedScenarios = scenarioExists
          ? projectState.scenarios.map(s =>
              s.name === event.scenario
                ? { ...s, status: event.status, error: event.error }
                : s
            )
          : [...projectState.scenarios, { name: event.scenario, status: event.status, error: event.error }];

        return {
          ...prev,
          [event.project]: {
            ...projectState,
            scenarios: updatedScenarios,
            updatedAt: Date.now()
          }
        };
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
      socketRef.current.emit('chat', { message });
      setChatHistory(prev => [...prev, { from: 'user', message, timestamp: Date.now() }]);

      // Clear pending plan when user sends a message (they're continuing the conversation)
      setPendingPlan(null);

      // Check if there's an active streaming message (Planning Agent is busy)
      // If so, mark this message as "queued"
      setStreamingMessages(prev => {
        const hasStreamingMessage = prev.some(m => m.role === 'assistant' && m.status === 'streaming');
        const userMessage: StreamingMessage = {
          id: `user_${Date.now()}`,
          role: 'user',
          content: [{ type: 'text', text: message }],
          status: hasStreamingMessage ? 'queued' : 'complete',
          createdAt: Date.now(),
        };
        return [...prev, userMessage];
      });
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
    queueStatus,
    testStates,
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
