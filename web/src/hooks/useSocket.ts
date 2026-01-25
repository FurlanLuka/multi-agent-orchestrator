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
  PlanningStatusEvent,
  AnalysisResultEvent,
  ChatCardEvent,
  VerificationStartEvent,
  E2EStartEvent,
  E2EAnalyzingEvent,
  FixSentEvent,
  WaitingForProjectEvent,
  PlanApprovedCardEvent,
  ChatResponseEvent,
  UserActionRequiredEvent,
  DependencyCheckResult,
} from '../types';

const SOCKET_URL = 'http://localhost:3456';

// Helper function for findLastIndex (not available in all ES targets)
function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}

export function useSocket() {
  const [connected, setConnected] = useState(false);
  const [checkingDependencies, setCheckingDependencies] = useState(true);
  const [dependencyCheck, setDependencyCheck] = useState<DependencyCheckResult | null>(null);
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

  // Planning status for UX feedback
  const [planningStatus, setPlanningStatus] = useState<PlanningStatusEvent | null>(null);

  // Analysis results for structured display
  const [analysisResults, setAnalysisResults] = useState<AnalysisResultEvent[]>([]);

  // Unified chat events for timeline cards
  const [chatEvents, setChatEvents] = useState<ChatCardEvent[]>([]);

  // Session persistence state
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);

  // Cache for active session's streaming messages (preserved when viewing other sessions)
  const activeSessionMessagesRef = useRef<StreamingMessage[]>([]);
  // Track active session ID in a ref for event handlers
  const activeSessionIdRef = useRef<string | null>(null);

  // Git push state tracking
  const [pushingBranch, setPushingBranch] = useState<Record<string, boolean>>({});
  const [pushResults, setPushResults] = useState<Record<string, { success: boolean; message: string }>>({});
  // Git merge state tracking
  const [mergingBranch, setMergingBranch] = useState<Record<string, boolean>>({});
  const [mergeResults, setMergeResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const socketRef = useRef<Socket | null>(null);

  // Batching for content_block events to reduce re-renders
  const pendingEventsRef = useRef<ChatStreamEvent[]>([]);
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected to orchestrator');
      setConnected(true);
      // Check dependencies on connect
      setCheckingDependencies(true);
      socket.emit('checkDependencies');
    });

    // Dependency check result
    socket.on('dependencyCheck', (result: DependencyCheckResult) => {
      setDependencyCheck(result);
      setCheckingDependencies(false);
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
      // Clear chat events for new session
      setChatEvents([]);
      setAnalysisResults([]);
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
    // We still track messages for internal state, but UI shows only structured cards
    socket.on('chatStream', (event: ChatStreamEvent) => {
      // Helper function to apply events to message array
      const applyEvents = (messages: StreamingMessage[], events: ChatStreamEvent[]): StreamingMessage[] => {
        let result = messages;
        for (const evt of events) {
          switch (evt.type) {
            case 'message_start': {
              // Create new streaming message
              const newMessage: StreamingMessage = {
                id: evt.messageId,
                role: 'assistant',
                content: [],
                status: 'streaming',
                createdAt: Date.now(),
              };
              // Also mark the most recent queued user message as complete
              const updatedPrev = result.map((msg, idx) => {
                if (msg.role === 'user' && msg.status === 'queued') {
                  const hasAssistantAfter = result.slice(idx + 1).some(m => m.role === 'assistant');
                  if (!hasAssistantAfter) {
                    return { ...msg, status: 'complete' as const };
                  }
                }
                return msg;
              });
              result = [...updatedPrev, newMessage];
              break;
            }

            case 'content_block': {
              if (!evt.block) break;
              result = result.map(msg =>
                msg.id === evt.messageId
                  ? { ...msg, content: [...msg.content, evt.block as ContentBlock] }
                  : msg
              );
              break;
            }

            case 'message_complete': {
              result = result.map(msg =>
                msg.id === evt.messageId
                  ? { ...msg, status: 'complete' as const }
                  : msg
              );
              break;
            }

            case 'error': {
              result = result.map(msg =>
                msg.id === evt.messageId
                  ? { ...msg, status: 'error' as const }
                  : msg
              );
              break;
            }
          }
        }
        return result;
      };

      // For content_block events, batch them and process on next animation frame
      // This reduces re-renders during fast streaming
      if (event.type === 'content_block') {
        pendingEventsRef.current.push(event);

        // Schedule batch update if not already scheduled
        if (rafIdRef.current === null) {
          rafIdRef.current = requestAnimationFrame(() => {
            const events = pendingEventsRef.current;
            pendingEventsRef.current = [];
            rafIdRef.current = null;

            // Apply all batched events at once
            activeSessionMessagesRef.current = applyEvents(activeSessionMessagesRef.current, events);
            setStreamingMessages(prev => applyEvents(prev, events));
          });
        }
      } else {
        // For non-content_block events (message_start, message_complete, error),
        // apply immediately to ensure proper state transitions
        activeSessionMessagesRef.current = applyEvents(activeSessionMessagesRef.current, [event]);
        setStreamingMessages(prev => applyEvents(prev, [event]));
      }
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
              message: event.message
            }
          : task
      ));
    });

    // User action required event - update task state with userAction info
    socket.on('userActionRequired', (event: UserActionRequiredEvent) => {
      console.log('[useSocket] User action required for task #' + event.taskIndex);
      setTaskStates(prev => prev.map(task =>
        task.taskIndex === event.taskIndex
          ? {
              ...task,
              status: 'awaiting_input' as const,
              type: 'user_action' as const,
              userAction: event.userAction,
              message: 'Waiting for user input...'
            }
          : task
      ));
    });

    // Planning status events for UX feedback
    socket.on('planningStatus', (event: PlanningStatusEvent) => {
      // Clear status when phase is 'complete', otherwise update
      setPlanningStatus(event.phase === 'complete' ? null : event);
    });

    // Analysis result events for structured display
    socket.on('analysisResult', (event: AnalysisResultEvent) => {
      setAnalysisResults(prev => [...prev, event]);

      // Only mutate STATUS cards (loading state) into result cards
      // Never mutate existing result cards (especially failed ones)
      setChatEvents(prev => {
        const category = event.type === 'task' ? 'task' : 'e2e';

        // Find the most recent STATUS card (type === 'status') for this project/category
        const statusIndex = findLastIndex(prev, (e: ChatCardEvent) =>
          e.type === 'status' &&  // Only status cards can be mutated
          e.category === category &&
          e.project === event.project
        );

        if (statusIndex !== -1) {
          // Mutate the status card into a result card
          const updated = [...prev];
          updated[statusIndex] = {
            ...updated[statusIndex],
            type: 'result',
            passed: event.passed,
            summary: event.summary,
            details: event.details,
            fixPrompt: event.fixPrompt,
            taskName: event.taskName,
            message: undefined, // Clear the status message
          };
          return updated;
        }

        // No status card found - add a new result card
        // (This happens if result comes without a preceding status event)
        return [...prev, {
          id: `${event.type}_${event.project}_${Date.now()}`,
          type: 'result',
          category,
          project: event.project,
          taskName: event.taskName,
          timestamp: Date.now(),
          passed: event.passed,
          summary: event.summary,
          details: event.details,
          fixPrompt: event.fixPrompt,
        }];
      });
    });

    // Verification start events (task verification beginning)
    socket.on('verificationStart', (event: VerificationStartEvent) => {
      const chatEvent: ChatCardEvent = {
        id: `verify_${event.project}_${event.taskIndex}_${Date.now()}`,
        type: 'status',
        category: 'task',
        project: event.project,
        taskName: event.taskName,
        timestamp: Date.now(),
        message: `Verifying "${event.taskName}"...`,
      };
      setChatEvents(prev => [...prev, chatEvent]);
    });

    // E2E start events (E2E tests beginning)
    socket.on('e2eStart', (event: E2EStartEvent) => {
      // Check if there's already an E2E status card for this project, update it
      setChatEvents(prev => {
        const existingIndex = findLastIndex(prev, (e: ChatCardEvent) =>
          e.type === 'status' &&
          e.category === 'e2e' &&
          e.project === event.project
        );

        if (existingIndex !== -1) {
          // Update existing card
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            message: `Running E2E tests...`,
            timestamp: Date.now(),
          };
          return updated;
        }

        // Add new card
        return [...prev, {
          id: `e2e_start_${event.project}_${Date.now()}`,
          type: 'status',
          category: 'e2e',
          project: event.project,
          timestamp: Date.now(),
          message: `Running E2E tests...`,
        }];
      });
    });

    // E2E analyzing events (analyzing E2E results)
    socket.on('e2eAnalyzing', (event: E2EAnalyzingEvent) => {
      // Update the existing E2E status card instead of adding a new one
      setChatEvents(prev => {
        const existingIndex = findLastIndex(prev, (e: ChatCardEvent) =>
          e.type === 'status' &&
          e.category === 'e2e' &&
          e.project === event.project
        );

        if (existingIndex !== -1) {
          // Update existing card to show analyzing
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            message: `Analyzing E2E results...`,
          };
          return updated;
        }

        // Add new card if none exists
        return [...prev, {
          id: `e2e_analyzing_${event.project}_${Date.now()}`,
          type: 'status',
          category: 'e2e',
          project: event.project,
          timestamp: Date.now(),
          message: `Analyzing E2E results...`,
        }];
      });
    });

    // Fix sent events (fix sent to another project)
    socket.on('fixSent', (event: FixSentEvent) => {
      const chatEvent: ChatCardEvent = {
        id: `fix_sent_${event.toProject}_${Date.now()}`,
        type: 'info',
        category: 'fix',
        project: event.toProject,
        timestamp: Date.now(),
        message: `Fix sent to ${event.toProject}`,
        summary: `From ${event.fromProject}: ${event.reason}`,
      };
      setChatEvents(prev => [...prev, chatEvent]);
    });

    // Waiting for project events (waiting for dependencies)
    socket.on('waitingForProject', (event: WaitingForProjectEvent) => {
      const chatEvent: ChatCardEvent = {
        id: `waiting_${event.project}_${Date.now()}`,
        type: 'info',
        category: 'fix',
        project: event.project,
        timestamp: Date.now(),
        message: `Waiting for ${event.waitingFor.join(', ')} to complete`,
      };
      setChatEvents(prev => [...prev, chatEvent]);
    });

    // Plan approved card events
    socket.on('planApprovedCard', (event: PlanApprovedCardEvent) => {
      const chatEvent: ChatCardEvent = {
        id: `plan_approved_${Date.now()}`,
        type: 'info',
        category: 'plan',
        timestamp: Date.now(),
        message: 'Plan Approved',
        summary: `${event.feature} - ${event.taskCount} tasks across ${event.projectCount} project(s)`,
      };
      setChatEvents(prev => [...prev, chatEvent]);
    });

    // Chat response events (structured responses from Planning Agent)
    socket.on('chatResponse', (event: ChatResponseEvent) => {
      const chatEvent: ChatCardEvent = {
        id: `response_${Date.now()}`,
        type: 'result',
        category: 'plan',  // General agent response category
        timestamp: Date.now(),
        passed: event.status === 'success',
        summary: event.message,
        details: event.details,
        responseStatus: event.status,  // Use for color override
      };
      setChatEvents(prev => [...prev, chatEvent]);
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

      // Restore task states if available
      if (data.session.taskStates) {
        setTaskStates(data.session.taskStates);
      }

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

    // Git push events
    socket.on('pushBranchSuccess', ({ project, message }: { project: string; message: string }) => {
      setPushingBranch(prev => ({ ...prev, [project]: false }));
      setPushResults(prev => ({ ...prev, [project]: { success: true, message } }));
      console.log(`Git push success for ${project}: ${message}`);
    });

    socket.on('pushBranchError', ({ project, error }: { project: string; error: string }) => {
      setPushingBranch(prev => ({ ...prev, [project]: false }));
      setPushResults(prev => ({ ...prev, [project]: { success: false, message: error } }));
      console.error(`Git push error for ${project}: ${error}`);
    });

    // Git merge events
    socket.on('mergeBranchSuccess', ({ project, message }: { project: string; message: string }) => {
      setMergingBranch(prev => ({ ...prev, [project]: false }));
      setMergeResults(prev => ({ ...prev, [project]: { success: true, message } }));
      console.log(`Git merge success for ${project}: ${message}`);
    });

    socket.on('mergeBranchError', ({ project, error }: { project: string; error: string }) => {
      setMergingBranch(prev => ({ ...prev, [project]: false }));
      setMergeResults(prev => ({ ...prev, [project]: { success: false, message: error } }));
      console.error(`Git merge error for ${project}: ${error}`);
    });

    // Request initial data
    socket.emit('getProjects');
    socket.emit('getTemplates');
    socket.emit('getSessions');

    return () => {
      // Cancel any pending animation frame
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
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

  const startSession = useCallback((feature: string, projects: string[], branchName?: string) => {
    if (socketRef.current) {
      socketRef.current.emit('startSession', { feature, projects, branchName });
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

  const createProjectFromTemplate = useCallback((name: string, targetPath: string, template: ProjectTemplate, dependencyInstall: boolean = true, hasE2E: boolean = true, gitEnabled: boolean = false, mainBranch: string = 'main') => {
    if (socketRef.current) {
      setCreatingProject(true);
      socketRef.current.emit('createFromTemplate', { name, targetPath, template, dependencyInstall, hasE2E, gitEnabled, mainBranch });
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
    gitEnabled?: boolean;
    mainBranch?: string;
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

  // Submit user action response (for user_action tasks)
  const submitUserAction = useCallback((taskIndex: number, values: Record<string, string>) => {
    if (socketRef.current) {
      console.log('[useSocket] Submitting user action for task #' + taskIndex);
      socketRef.current.emit('userActionResponse', { taskIndex, values });
    }
  }, []);

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

  // Clear analysis results and chat events when starting new session
  const clearAnalysisResults = useCallback(() => {
    setAnalysisResults([]);
    setChatEvents([]);
  }, []);

  const pushBranch = useCallback((project: string, branchName: string) => {
    if (socketRef.current) {
      setPushingBranch(prev => ({ ...prev, [project]: true }));
      setPushResults(prev => {
        const updated = { ...prev };
        delete updated[project];
        return updated;
      });
      socketRef.current.emit('pushBranch', { project, branchName });
    }
  }, []);

  const clearPushResult = useCallback((project: string) => {
    setPushResults(prev => {
      const updated = { ...prev };
      delete updated[project];
      return updated;
    });
  }, []);

  const recheckDependencies = useCallback(() => {
    if (socketRef.current) {
      setCheckingDependencies(true);
      setDependencyCheck(null);
      socketRef.current.emit('checkDependencies');
    }
  }, []);

  const mergeBranch = useCallback((project: string, branchName: string) => {
    if (socketRef.current) {
      setMergingBranch(prev => ({ ...prev, [project]: true }));
      setMergeResults(prev => {
        const updated = { ...prev };
        delete updated[project];
        return updated;
      });
      socketRef.current.emit('mergeBranch', { project, branchName });
    }
  }, []);

  return {
    connected,
    checkingDependencies,
    dependencyCheck,
    session,
    statuses,
    logs,
    chatHistory,
    streamingMessages,
    queueStatus,
    testStates,
    taskStates,
    planningStatus,
    analysisResults,
    chatEvents,
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
    pushingBranch,
    pushResults,
    mergingBranch,
    mergeResults,
    sendChat,
    startSession,
    approvePlan,
    startExecution,
    respondToApproval,
    clearLogs,
    clearStreamingMessages,
    clearAnalysisResults,
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
    submitUserAction,
    pushBranch,
    clearPushResult,
    mergeBranch,
    recheckDependencies,
  };
}
