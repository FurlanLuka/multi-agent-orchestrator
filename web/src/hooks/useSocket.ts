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
  SessionSummary,
  FullSessionData,
  TaskState,
  TaskStatusEvent,
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
  const [addingProject, setAddingProject] = useState(false);

  // Streaming messages for agentic UI
  const [streamingMessages, setStreamingMessages] = useState<StreamingMessage[]>([]);

  // Queue status for Planning Agent visibility
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);

  // Test states for E2E test tracking per project
  const [testStates, setTestStates] = useState<Record<string, ProjectTestState>>({});

  // Task states for dependency-aware execution tracking
  const [taskStates, setTaskStates] = useState<TaskState[]>([]);

  // Session persistence state
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);

  // Cache for active session's streaming messages (preserved when viewing other sessions)
  const activeSessionMessagesRef = useRef<StreamingMessage[]>([]);
  // Track active session ID in a ref for event handlers
  const activeSessionIdRef = useRef<string | null>(null);

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
      // New sessions are automatically active
      setActiveSessionId(s.id);
      setViewingSessionId(s.id);
      activeSessionIdRef.current = s.id;
      // Clear the cached messages for the new session
      activeSessionMessagesRef.current = [];
      setStreamingMessages([]);
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
    // These events always come from the active session
    socket.on('chatStream', (event: ChatStreamEvent) => {
      // Helper function to apply event to message array
      const applyEvent = (messages: StreamingMessage[]): StreamingMessage[] => {
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
            const updatedPrev = messages.map((msg, idx) => {
              if (msg.role === 'user' && msg.status === 'queued') {
                const hasAssistantAfter = messages.slice(idx + 1).some(m => m.role === 'assistant');
                if (!hasAssistantAfter) {
                  return { ...msg, status: 'complete' as const };
                }
              }
              return msg;
            });
            return [...updatedPrev, newMessage];
          }

          case 'content_block': {
            if (!event.block) return messages;
            return messages.map(msg =>
              msg.id === event.messageId
                ? { ...msg, content: [...msg.content, event.block as ContentBlock] }
                : msg
            );
          }

          case 'message_complete': {
            return messages.map(msg =>
              msg.id === event.messageId
                ? { ...msg, status: 'complete' as const }
                : msg
            );
          }

          case 'error': {
            return messages.map(msg =>
              msg.id === event.messageId
                ? { ...msg, status: 'error' as const }
                : msg
            );
          }

          default:
            return messages;
        }
      };

      // Always update the active session's cached messages
      activeSessionMessagesRef.current = applyEvent(activeSessionMessagesRef.current);

      // Update displayed messages
      setStreamingMessages(prev => applyEvent(prev));
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

    // Task state events for dependency-aware execution tracking
    socket.on('taskStates', (states: TaskState[]) => {
      setTaskStates(states);
    });

    socket.on('taskStatus', (event: TaskStatusEvent) => {
      setTaskStates(prev => prev.map(task =>
        task.taskIndex === event.taskIndex
          ? {
              ...task,
              status: event.status,
              waitingOn: event.waitingOn ?? task.waitingOn,
              message: event.message
            }
          : task
      ));
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
      // Auto-refresh projects list
      socket.emit('getProjects');
    });

    socket.on('createFromTemplateError', ({ error }: { error: string }) => {
      setCreatingProject(false);
      console.error('Failed to create project:', error);
    });

    socket.on('addProjectSuccess', () => {
      setAddingProject(false);
      // Auto-refresh projects list
      socket.emit('getProjects');
    });

    socket.on('addProjectError', ({ error }: { error: string }) => {
      setAddingProject(false);
      console.error('Failed to add project:', error);
    });

    socket.on('removeProjectSuccess', () => {
      // Auto-refresh projects list
      socket.emit('getProjects');
    });

    socket.on('removeProjectError', ({ error }: { error: string }) => {
      console.error('Failed to remove project:', error);
    });

    socket.on('updateProjectSuccess', () => {
      // Auto-refresh projects list
      socket.emit('getProjects');
    });

    socket.on('updateProjectError', ({ error }: { error: string }) => {
      console.error('Failed to update project:', error);
    });

    // Session persistence events
    socket.on('sessionList', (sessionList: SessionSummary[]) => {
      setSessions(sessionList);
    });

    socket.on('sessionLoaded', (data: FullSessionData & { isActive?: boolean; pendingPlan?: PlanProposal }) => {
      setLoadingSession(false);

      // Restore session
      const restoredSession: Session = {
        id: data.session.id,
        startedAt: data.session.startedAt,
        feature: data.session.feature,
        projects: data.session.projects,
        plan: data.session.plan,
      };
      setSession(restoredSession);

      // Restore statuses
      setStatuses(data.session.statuses);

      // Restore logs
      setLogs(data.logs);

      // Check if this is the currently active session - if so, use cached messages
      // which may include an in-progress streaming message
      const isReturningToActiveSession = data.session.id === activeSessionIdRef.current;
      if (isReturningToActiveSession && activeSessionMessagesRef.current.length > 0) {
        // Use cached messages which may have streaming content
        setStreamingMessages(activeSessionMessagesRef.current);
      } else {
        // Use loaded messages from persistence
        setStreamingMessages(data.chatMessages);
        // If this becomes the active session, initialize the cache
        if (data.isActive) {
          activeSessionMessagesRef.current = data.chatMessages;
        }
      }

      // Restore pending plan if it exists
      if (data.pendingPlan) {
        setPendingPlan(data.pendingPlan);
      } else {
        setPendingPlan(null);
      }

      // Restore test states
      const restoredTestStates: Record<string, ProjectTestState> = {};
      for (const [project, testState] of Object.entries(data.session.testStates)) {
        restoredTestStates[project] = {
          scenarios: testState.scenarios.map(s => ({
            name: s.name,
            status: s.status,
            error: s.error,
          })),
          updatedAt: testState.updatedAt,
        };
      }
      setTestStates(restoredTestStates);

      // Track which session we're viewing (sidebar still visible)
      setViewingSessionId(data.session.id);

      // If this was loaded as active session (e.g., auto-reconnect), track it
      if (data.isActive) {
        setActiveSessionId(data.session.id);
        activeSessionIdRef.current = data.session.id;
      }

      // Set completion state based on session status
      setAllComplete(data.session.status === 'completed');

      console.log(`Session ${data.session.id} loaded (active: ${data.isActive ?? false})`);
    });

    socket.on('loadSessionError', ({ error }: { error: string }) => {
      setLoadingSession(false);
      console.error('Failed to load session:', error);
    });

    socket.on('deleteSessionSuccess', ({ sessionId }: { sessionId: string }) => {
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    });

    socket.on('deleteSessionError', ({ sessionId, error }: { sessionId: string; error: string }) => {
      console.error(`Failed to delete session ${sessionId}:`, error);
    });


    // Session stopped event
    socket.on('sessionStopped', ({ sessionId }: { sessionId: string }) => {
      setActiveSessionId(null);
      activeSessionIdRef.current = null;
      // Clear the cached messages since session is no longer active
      activeSessionMessagesRef.current = [];
      console.log(`Session ${sessionId} stopped`);
    });

    // Request initial data
    socket.emit('getProjects');
    socket.emit('getTemplates');
    socket.emit('getSessions');

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
      const hasStreamingMessage = activeSessionMessagesRef.current.some(
        m => m.role === 'assistant' && m.status === 'streaming'
      );
      const userMessage: StreamingMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: [{ type: 'text', text: message }],
        status: hasStreamingMessage ? 'queued' : 'complete',
        createdAt: Date.now(),
      };

      // Update both the ref cache and the displayed state
      activeSessionMessagesRef.current = [...activeSessionMessagesRef.current, userMessage];
      setStreamingMessages(prev => [...prev, userMessage]);
    }
  }, []);

  const startSession = useCallback((feature: string, projects: string[]) => {
    if (socketRef.current) {
      socketRef.current.emit('startSession', { feature, projects });
      // Clear cached messages for new session
      activeSessionMessagesRef.current = [];
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

  const createProjectFromTemplate = useCallback((name: string, targetPath: string, template: ProjectTemplate, dependencyInstall: boolean = true) => {
    if (socketRef.current) {
      setCreatingProject(true);
      socketRef.current.emit('createFromTemplate', { name, targetPath, template, dependencyInstall });
    }
  }, []);

  const refreshProjects = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('getProjects');
    }
  }, []);

  interface AddProjectOptions {
    name: string;
    path: string;
    devServer?: {
      command: string;
      readyPattern: string;
      env?: Record<string, string>;
      port?: number;
    };
    buildCommand?: string;
    hasE2E?: boolean;
    e2eInstructions?: string;
    dependencyInstall?: boolean;
  }

  const addProject = useCallback((options: AddProjectOptions) => {
    if (socketRef.current) {
      setAddingProject(true);
      socketRef.current.emit('addProject', options);
    }
  }, []);

  const removeProject = useCallback((name: string) => {
    if (socketRef.current) {
      socketRef.current.emit('removeProject', { name });
    }
  }, []);

  const updateProject = useCallback((name: string, updates: Partial<ProjectConfig>) => {
    if (socketRef.current) {
      socketRef.current.emit('updateProject', { name, updates });
    }
  }, []);

  const getSessions = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('getSessions');
    }
  }, []);

  const loadSession = useCallback((sessionId: string) => {
    if (socketRef.current) {
      setLoadingSession(true);
      socketRef.current.emit('loadSession', { sessionId });
    }
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('deleteSession', { sessionId });

      // If we're viewing the deleted session, clear the view
      if (viewingSessionId === sessionId) {
        setViewingSessionId(null);
        setSession(null);
        setStatuses({});
        setLogs([]);
        setStreamingMessages([]);
        setTestStates({});
        setPendingPlan(null);
      }
    }
  }, [viewingSessionId]);


  const viewSession = useCallback((sessionId: string) => {
    // If it's the currently active session, just switch to viewing it
    if (sessionId === activeSessionId) {
      setViewingSessionId(sessionId);
      // Refresh the session data
      if (socketRef.current) {
        setLoadingSession(true);
        socketRef.current.emit('loadSession', { sessionId });
      }
    } else {
      // Load session in read-only mode (no dev servers started)
      setViewingSessionId(sessionId);
      if (socketRef.current) {
        setLoadingSession(true);
        socketRef.current.emit('loadSession', { sessionId });
      }
    }
  }, [activeSessionId]);

  const stopSession = useCallback(() => {
    if (socketRef.current && activeSessionId) {
      socketRef.current.emit('stopSession', { sessionId: activeSessionId });
    }
  }, [activeSessionId]);

  const clearSession = useCallback(() => {
    setSession(null);
    setStatuses({});
    setLogs([]);
    setChatHistory([]);
    setStreamingMessages([]);
    setTestStates({});
    setPendingPlan(null);
    setAllComplete(false);
    setActiveSessionId(null);
    setViewingSessionId(null);
    // Request fresh session list
    if (socketRef.current) {
      socketRef.current.emit('getSessions');
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
    taskStates,
    currentApproval,
    pendingPlan,
    allComplete,
    projects,
    templates,
    creatingProject,
    addingProject,
    sessions,
    loadingSession,
    activeSessionId,
    viewingSessionId,
    sendChat,
    startSession,
    approvePlan,
    startExecution,
    respondToApproval,
    clearLogs,
    clearStreamingMessages,
    createProjectFromTemplate,
    addProject,
    removeProject,
    updateProject,
    refreshProjects,
    getSessions,
    loadSession,
    deleteSession,
    clearSession,
    viewSession,
    stopSession,
  };
}
