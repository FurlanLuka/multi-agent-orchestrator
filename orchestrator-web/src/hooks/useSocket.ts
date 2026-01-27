import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { io, type Socket } from 'socket.io-client';
import { onBackendError, onBackendReady, isTauri } from '../lib/tauri';
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
  ProjectTestState,
  TestStatusEvent,
  SessionSummary,
  FullSessionData,
  TaskState,
  TaskStatusEvent,
  PlanningStatusEvent,
  UserActionRequiredEvent,
  DependencyCheckResult,
  RequestFlow,
  FlowStep,
  FlowStatus,
  PermissionPrompt,
} from '@aio/types';

// Default port for standalone mode (fallback only)
const DEFAULT_PORT = 3456;

/**
 * Get the initial socket URL, supporting dynamic port detection
 * Note: This is only used for initial value. The actual port may be updated
 * dynamically when running in Tauri via the backend-ready event.
 *
 * Port priority:
 * 1. window.__ORCHESTRATOR_PORT__ (set by Tauri at runtime)
 * 2. Import meta env variable (Vite build-time)
 * 3. Current window location port (for standalone mode - use same port as the web UI)
 * 4. Default port (3456) - fallback
 */
function getInitialPort(): number | null {
  // Check for Tauri-injected port
  if (typeof window !== 'undefined' && window.__ORCHESTRATOR_PORT__) {
    return window.__ORCHESTRATOR_PORT__;
  }

  // Check for Vite environment variable
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ORCHESTRATOR_PORT) {
    return parseInt(import.meta.env.VITE_ORCHESTRATOR_PORT, 10);
  }

  // In Tauri mode, return null to wait for backend-ready event
  if (typeof window !== 'undefined' && isTauri()) {
    return null;
  }

  // Use current window location port (standalone mode - web UI served from same port as backend)
  if (typeof window !== 'undefined' && window.location.port) {
    return parseInt(window.location.port, 10);
  }

  // Default fallback
  return DEFAULT_PORT;
}

export function useSocket() {
  // Dynamic port state - null means waiting for Tauri to provide port
  const [port, setPort] = useState<number | null>(getInitialPort);
  const [socketUrl, setSocketUrl] = useState<string | null>(() => {
    const initialPort = getInitialPort();
    return initialPort ? `http://localhost:${initialPort}` : null;
  });

  const [connected, setConnected] = useState(false);
  const [checkingDependencies, setCheckingDependencies] = useState(true);
  const [dependencyCheck, setDependencyCheck] = useState<DependencyCheckResult | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
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
  const [startingSession, setStartingSession] = useState(false);

  // Streaming messages for agentic UI
  const [streamingMessages, setStreamingMessages] = useState<StreamingMessage[]>([]);

  // Test states for E2E test tracking per project
  const [testStates, setTestStates] = useState<Record<string, ProjectTestState>>({});

  // Task states for dependency-aware execution tracking
  const [taskStates, setTaskStates] = useState<TaskState[]>([]);

  // Planning status for UX feedback
  const [planningStatus, setPlanningStatus] = useState<PlanningStatusEvent | null>(null);

  // Request flows for two-section layout (active operations vs history)
  const [flows, setFlows] = useState<RequestFlow[]>([]);

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
  // GitHub PR state tracking
  const [creatingPR, setCreatingPR] = useState<Record<string, boolean>>({});
  const [prResults, setPRResults] = useState<Record<string, { success: boolean; message: string; prUrl?: string }>>({});
  const [gitHubInfo, setGitHubInfo] = useState<Record<string, { isGitHub: boolean; repoUrl?: string }>>({});
  // Branch list for PR base branch selection
  const [availableBranches, setAvailableBranches] = useState<Record<string, string[]>>({});
  const [loadingBranches, setLoadingBranches] = useState<Record<string, boolean>>({});

  // Permission prompt state (for live permission approval via MCP)
  const [permissionPrompt, setPermissionPrompt] = useState<PermissionPrompt | null>(null);

  const socketRef = useRef<Socket | null>(null);

  // Batching for content_block events to reduce re-renders
  const pendingEventsRef = useRef<ChatStreamEvent[]>([]);
  const rafIdRef = useRef<number | null>(null);

  // Listen for Tauri backend-ready event to get dynamic port
  useEffect(() => {
    // If already have port, nothing to do
    if (port !== null) return;

    // Only listen in Tauri mode
    if (!isTauri()) {
      // Non-Tauri mode should have port set from getInitialPort
      setPort(DEFAULT_PORT);
      setSocketUrl(`http://localhost:${DEFAULT_PORT}`);
      return;
    }

    // Check if port is already available on window (might have been set before React mounted)
    if (window.__ORCHESTRATOR_PORT__) {
      const existingPort = window.__ORCHESTRATOR_PORT__;
      console.log(`[useSocket] Using existing port from window: ${existingPort}`);
      setPort(existingPort);
      setSocketUrl(`http://localhost:${existingPort}`);
      return;
    }

    // Listen for backend-ready event from Tauri
    let cleanup: (() => void) | undefined;

    onBackendReady((newPort: number) => {
      console.log(`[useSocket] Backend ready on port ${newPort}`);
      setPort(newPort);
      setSocketUrl(`http://localhost:${newPort}`);
      // Store for other components that might need it
      window.__ORCHESTRATOR_PORT__ = newPort;
    }).then((unsubscribe) => {
      cleanup = unsubscribe;
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, [port]);

  // Main socket connection effect - only runs when socketUrl is available
  useEffect(() => {
    // Don't connect until we have a valid URL
    if (!socketUrl) {
      console.log('[useSocket] Waiting for backend port...');
      return;
    }

    console.log(`[useSocket] Connecting to ${socketUrl}`);
    const socket = io(socketUrl, {
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
      setStartingSession(false);
      // New sessions are automatically active
      setActiveSessionId(s.id);
      setViewingSessionId(s.id);
      activeSessionIdRef.current = s.id;
      // Clear the cached messages for the new session
      activeSessionMessagesRef.current = [];
      setStreamingMessages([]);
      // Clear flows for new session
      setFlows([]);
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
      // IMPORTANT: Preserve existing test statuses (passed tests stay passed during retries)
      if (status === 'E2E') {
        setSession(currentSession => {
          if (currentSession?.plan?.testPlan?.[project]) {
            const scenarios = currentSession.plan.testPlan[project];
            setTestStates(prev => {
              const existingState = prev[project];

              // If no existing state, initialize all as pending
              if (!existingState) {
                return {
                  ...prev,
                  [project]: {
                    scenarios: scenarios.map(name => ({ name, status: 'pending' as const })),
                    updatedAt: Date.now()
                  }
                };
              }

              // Preserve existing statuses, only add new scenarios as pending
              const existingScenarioMap = new Map(
                existingState.scenarios.map(s => [s.name.toLowerCase().trim(), s])
              );

              const mergedScenarios = scenarios.map(name => {
                const normalizedName = name.toLowerCase().trim();
                const existing = existingScenarioMap.get(normalizedName);
                if (existing) {
                  // Keep existing status (especially 'passed' tests)
                  return existing;
                }
                // New scenario, initialize as pending
                return { name, status: 'pending' as const };
              });

              return {
                ...prev,
                [project]: {
                  scenarios: mergedScenarios,
                  updatedAt: Date.now()
                }
              };
            });
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

    // ═══════════════════════════════════════════════════════════════
    // Request Flow Events (for two-section chat layout)
    // ═══════════════════════════════════════════════════════════════

    // Flow start: Add new flow to state
    socket.on('flowStart', (flow: RequestFlow) => {
      setFlows(prev => [...prev, flow]);
    });

    // Flow step: Update steps in existing flow
    socket.on('flowStep', ({ flowId, step }: { flowId: string; step: FlowStep }) => {
      setFlows(prev => prev.map(f => {
        if (f.id !== flowId) return f;
        // Mark previous active steps as completed, add new step
        const updatedSteps = f.steps.map(s =>
          s.status === 'active' ? { ...s, status: 'completed' as const } : s
        );
        return { ...f, steps: [...updatedSteps, step] };
      }));
    });

    // Flow complete: Mark flow as done with result
    socket.on('flowComplete', ({ flowId, status, result, timestamp }: {
      flowId: string;
      status: FlowStatus;
      result?: { passed: boolean; summary?: string; details?: string };
      timestamp: number;
    }) => {
      setFlows(prev => prev.map(f => {
        if (f.id !== flowId) return f;
        // Mark all active steps based on status
        const finalStepStatus = status === 'completed' ? 'completed' as const : 'failed' as const;
        const updatedSteps = f.steps.map(s => ({
          ...s,
          status: s.status === 'active' ? finalStepStatus : s.status
        }));
        return { ...f, status, completedAt: timestamp, result, steps: updatedSteps };
      }));
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

    // GitHub PR events
    socket.on('gitHubInfo', ({ project, isGitHub, repoUrl }: { project: string; isGitHub: boolean; repoUrl?: string }) => {
      setGitHubInfo(prev => ({ ...prev, [project]: { isGitHub, repoUrl } }));
      console.log(`GitHub info for ${project}: isGitHub=${isGitHub}`);
    });

    socket.on('createPRSuccess', ({ project, message, prUrl }: { project: string; message: string; prUrl?: string }) => {
      setCreatingPR(prev => ({ ...prev, [project]: false }));
      setPRResults(prev => ({ ...prev, [project]: { success: true, message, prUrl } }));
      console.log(`PR created for ${project}: ${prUrl}`);
    });

    socket.on('createPRError', ({ project, error }: { project: string; error: string }) => {
      setCreatingPR(prev => ({ ...prev, [project]: false }));
      setPRResults(prev => ({ ...prev, [project]: { success: false, message: error } }));
      console.error(`Create PR error for ${project}: ${error}`);
    });

    // Branch list events (for PR base branch selection)
    socket.on('branches', ({ project, branches }: { project: string; branches: string[] }) => {
      setLoadingBranches(prev => ({ ...prev, [project]: false }));
      setAvailableBranches(prev => ({ ...prev, [project]: branches }));
      console.log(`Branches for ${project}:`, branches);
    });

    // Permission prompt events (for live permission approval via MCP)
    socket.on('permissionPrompt', (event: PermissionPrompt) => {
      console.log(`Permission prompt for ${event.project}: ${event.toolName}`);
      setPermissionPrompt(event);
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
  }, [socketUrl]);

  // Listen for Tauri backend errors (port unavailable, etc.)
  useEffect(() => {
    if (!isTauri()) return;

    let cleanup: (() => void) | undefined;

    onBackendError((error: string) => {
      console.error('Backend error from Tauri:', error);
      setBackendError(error);
      setCheckingDependencies(false);
    }).then((unsubscribe) => {
      cleanup = unsubscribe;
    });

    return () => {
      if (cleanup) cleanup();
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
      setStartingSession(true);
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

  interface CreateProjectOptions {
    name: string;
    targetPath: string;
    template: ProjectTemplate;
    dependencyInstall: boolean;
    hasE2E: boolean;
    gitEnabled: boolean;
    mainBranch: string;
    permissions?: {
      dangerouslyAllowAll?: boolean;
      allow: string[];
    };
  }

  const createProjectFromTemplate = useCallback((options: CreateProjectOptions) => {
    if (socketRef.current) {
      setCreatingProject(true);
      socketRef.current.emit('createFromTemplate', options);
    }
  }, []);

  // Quick start: create frontend + backend app with git and e2e enabled
  const quickStartApp = useCallback((appName: string) => {
    if (socketRef.current) {
      setCreatingProject(true);
      socketRef.current.emit('quickStartApp', { appName });
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
    permissions?: {
      dangerouslyAllowAll?: boolean;
      allow: string[];
    };
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
    setFlows([]);
    // Request fresh session list
    if (socketRef.current) {
      socketRef.current.emit('getSessions');
    }
  }, []);

  // Clear flows when starting new session
  const clearFlows = useCallback(() => {
    setFlows([]);
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

  // Get GitHub info for a project
  const getGitHubInfo = useCallback((project: string) => {
    if (socketRef.current) {
      socketRef.current.emit('getGitHubInfo', { project });
    }
  }, []);

  // Create a pull request
  const createPR = useCallback((project: string, branchName: string, baseBranch?: string, title?: string, body?: string) => {
    if (socketRef.current) {
      setCreatingPR(prev => ({ ...prev, [project]: true }));
      setPRResults(prev => {
        const updated = { ...prev };
        delete updated[project];
        return updated;
      });
      socketRef.current.emit('createPR', { project, branchName, baseBranch, title, body });
    }
  }, []);

  // Get available branches for a project (for PR base branch selection)
  const getBranches = useCallback((project: string) => {
    if (socketRef.current) {
      setLoadingBranches(prev => ({ ...prev, [project]: true }));
      socketRef.current.emit('getBranches', { project });
    }
  }, []);

  // Respond to permission prompt (for live permission approval via MCP)
  const respondToPermission = useCallback((approved: boolean, allowAll?: boolean) => {
    if (socketRef.current && permissionPrompt) {
      socketRef.current.emit('permissionResponse', {
        project: permissionPrompt.project,
        taskIndex: permissionPrompt.taskIndex,
        approved,
        toolName: permissionPrompt.toolName,
        allowAll: allowAll || false,
      });
      setPermissionPrompt(null);
    }
  }, [permissionPrompt]);

  // Retry a failed project task (FATAL_DEBUGGING or FAILED status)
  const retryProject = useCallback((project: string) => {
    if (socketRef.current) {
      socketRef.current.emit('retryProject', { project });
    }
  }, []);

  // Retry plan generation after failure
  const retryPlan = useCallback((feature: string) => {
    // Clear the error status first
    setPlanningStatus(null);
    // Re-send the chat message to trigger plan generation
    if (socketRef.current) {
      socketRef.current.emit('chat', { message: feature });
    }
  }, []);

  // Derived state: separate active flows from completed flows
  const { activeFlows, completedFlows } = useMemo(() => ({
    activeFlows: flows.filter(f => f.status === 'in_progress'),
    completedFlows: flows.filter(f => f.status !== 'in_progress')
  }), [flows]);

  return {
    port,
    connected,
    checkingDependencies,
    dependencyCheck,
    backendError,
    session,
    statuses,
    logs,
    chatHistory,
    streamingMessages,
    testStates,
    taskStates,
    planningStatus,
    flows,
    activeFlows,
    completedFlows,
    currentApproval,
    pendingPlan,
    allComplete,
    projects,
    templates,
    creatingProject,
    addingProject,
    startingSession,
    sessions,
    loadingSession,
    activeSessionId,
    viewingSessionId,
    pushingBranch,
    pushResults,
    mergingBranch,
    mergeResults,
    creatingPR,
    prResults,
    gitHubInfo,
    availableBranches,
    loadingBranches,
    permissionPrompt,
    sendChat,
    startSession,
    approvePlan,
    startExecution,
    respondToApproval,
    clearLogs,
    clearStreamingMessages,
    clearFlows,
    createProjectFromTemplate,
    quickStartApp,
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
    getGitHubInfo,
    createPR,
    getBranches,
    recheckDependencies,
    respondToPermission,
    retryProject,
    retryPlan,
  };
}
