import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { io, type Socket } from 'socket.io-client';
import { onBackendError, onBackendReady, isTauri } from '../lib/tauri';
import type {
  Session,
  Plan,
  ProjectState,
  LogEntry,
  AgentStatus,
  ProjectTemplateConfig,
  ProjectConfig,
  ProjectTemplate,
  ChatStreamEvent,
  StreamingMessage,
  ContentBlock,
  ProjectTestState,
  TestStatusEvent,
  FullSessionData,
  TaskState,
  TaskStatusEvent,
  PlanningStatusEvent,
  PlanApprovalEvent,
  UserInputRequest,
  DependencyCheckResult,
  RequestFlow,
  FlowStep,
  FlowStatus,
  FlowType,
  PermissionPrompt,
  PlanningQuestion,
  WorkspaceConfig,
  WorkspaceProjectConfig,
  // Multi-stage planning types
  PlanningSessionState,
  StageApprovalRequest,
  // Design session types
  DesignPhase,
  DesignCategory,
  ThemeOption,
  ComponentStyleOption,
  MockupOption,
  // Dev server types
  DevServerState,
  PortConflict,
  DevServerLogEntry,
} from '@orchy/types';

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
  const [clientRole, setClientRole] = useState<'main' | 'secondary' | null>(null);
  const [secondaryMessage, setSecondaryMessage] = useState<string | null>(null);
  const [checkingDependencies, setCheckingDependencies] = useState(true);
  const [dependencyCheck, setDependencyCheck] = useState<DependencyCheckResult | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ProjectState>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [allComplete, setAllComplete] = useState(false);
  const [templates, setTemplates] = useState<ProjectTemplateConfig[]>([]);
  const [creatingProject, setCreatingProject] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [quickStartError, setQuickStartError] = useState<string | null>(null);
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState<string | null>(null);

  // Workspaces
  const [workspaces, setWorkspaces] = useState<Record<string, WorkspaceConfig>>({});

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
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

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

  // Branch check state (for checking if projects are on default branch before session start)
  const [branchCheckResult, setBranchCheckResult] = useState<Array<{
    project: string;
    gitEnabled: boolean;
    currentBranch: string | null;
    mainBranch: string;
    isOnMainBranch: boolean;
    hasUncommittedChanges: boolean;
    uncommittedDetails?: { staged: number; unstaged: number; untracked: number };
  }> | null>(null);
  const [checkingBranches, setCheckingBranches] = useState(false);
  const [checkoutingBranches, setCheckoutingBranches] = useState(false);

  // Permission prompt queue (for live permission approval via MCP)
  // Uses a queue to handle multiple simultaneous permission requests
  const [permissionQueue, setPermissionQueue] = useState<PermissionPrompt[]>([]);

  // User input request queue (for request_user_input MCP tool)
  const [userInputQueue, setUserInputQueue] = useState<UserInputRequest[]>([]);

  // Planning question state (for interactive Q&A during planning via MCP)
  const [planningQuestion, setPlanningQuestion] = useState<PlanningQuestion | null>(null);

  // Plan approval state (for interactive plan approval via MCP)
  const [pendingPlanApproval, setPendingPlanApproval] = useState<{
    approvalId: string;
    plan: Plan;
  } | null>(null);

  // Multi-stage planning state
  const [planningSessionState, setPlanningSessionState] = useState<PlanningSessionState | null>(null);
  const [pendingStageApproval, setPendingStageApproval] = useState<StageApprovalRequest | null>(null);

  // ═══════════════════════════════════════════════════════════════
  // Design Session State
  // ═══════════════════════════════════════════════════════════════
  const [designSessionId, setDesignSessionId] = useState<string | null>(null);
  const [designPhase, setDesignPhase] = useState<DesignPhase>('discovery');
  const [designInputLocked, setDesignInputLocked] = useState(false);
  const [designInputPlaceholder, setDesignInputPlaceholder] = useState('Describe your project...');
  const [designMessages, setDesignMessages] = useState<Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>>([]);
  const [designPreview, setDesignPreview] = useState<{
    type: 'theme' | 'component' | 'mockup';
    options: ThemeOption[] | ComponentStyleOption[] | MockupOption[];
  } | null>(null);
  // Refine mode - iterate on a single selected option
  const [designRefine, setDesignRefine] = useState<{
    type: 'theme' | 'component' | 'mockup';
    option: ThemeOption | ComponentStyleOption | MockupOption;
    index: number;
  } | null>(null);
  const [designComplete, setDesignComplete] = useState<{
    designPath: string;
    designName: string;
  } | null>(null);
  const [designError, setDesignError] = useState<string | null>(null);
  // Generating state - loading indicator while agent generates
  const [designGenerating, setDesignGenerating] = useState<{
    type: 'theme' | 'component' | 'mockup';
    message?: string;
  } | null>(null);
  // Pages in current design session
  const [designPages, setDesignPages] = useState<Array<{
    id: string;
    name: string;
    filename: string;
  }>>([]);

  // ═══════════════════════════════════════════════════════════════
  // Dev Server Management State (standalone dev server controls)
  // ═══════════════════════════════════════════════════════════════
  const [devServers, setDevServers] = useState<DevServerState[]>([]);
  const [devServerLogs, setDevServerLogs] = useState<Record<string, DevServerLogEntry[]>>({});
  const [portConflicts, setPortConflicts] = useState<PortConflict[]>([]);
  const [showPortConflictModal, setShowPortConflictModal] = useState(false);
  const [startingDevServers, setStartingDevServers] = useState(false);
  const [devServerWorkspaceId, setDevServerWorkspaceId] = useState<string | null>(null);

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

    // Also poll for injected port (Tauri injects via window.eval)
    const pollInterval = setInterval(() => {
      if (window.__ORCHESTRATOR_PORT__) {
        const injectedPort = window.__ORCHESTRATOR_PORT__;
        console.log(`[useSocket] Found injected port: ${injectedPort}`);
        setPort(injectedPort);
        setSocketUrl(`http://localhost:${injectedPort}`);
        clearInterval(pollInterval);
      }
    }, 100);

    return () => {
      clearInterval(pollInterval);
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

    // Client role event (single tab enforcement)
    socket.on('clientRole', (event: { role: 'main' | 'secondary'; message?: string }) => {
      console.log(`[useSocket] Client role: ${event.role}`);
      setClientRole(event.role);
      if (event.role === 'secondary' && event.message) {
        setSecondaryMessage(event.message);
      }
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

    // User input required event (for request_user_input MCP tool)
    socket.on('userInputRequired', (request: UserInputRequest) => {
      console.log('[useSocket] User input required: ' + request.requestId);
      setUserInputQueue(prev => [...prev, request]);
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

    // Flow update: Update an existing flow's result and optionally type
    // Used to mutate completed flows (e.g., "Plan ready for review" → "Plan approved")
    socket.on('flowUpdate', ({ flowId, result, type }: {
      flowId: string;
      result: { passed: boolean; summary?: string; details?: string };
      type?: FlowType;
    }) => {
      setFlows(prev => prev.map(f => {
        if (f.id !== flowId) return f;
        return { ...f, result, ...(type ? { type } : {}) };
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

    // Workspace events
    socket.on('workspaces', (w: Record<string, WorkspaceConfig>) => {
      setWorkspaces(w);
      setAddingProject(false); // Reset loading state when workspaces are updated
    });

    // Template events
    socket.on('templates', (t: ProjectTemplateConfig[]) => {
      setTemplates(t);
    });

    socket.on('createFromTemplateSuccess', () => {
      setCreatingProject(false);
      setCreateProjectError(null);
    });

    socket.on('createFromTemplateError', ({ error }: { error: string }) => {
      setCreatingProject(false);
      setCreateProjectError(error);
      console.error('Failed to create project:', error);
    });

    socket.on('quickStartError', ({ error }: { error: string }) => {
      setCreatingProject(false);
      setStartingSession(false);
      setQuickStartError(error);
      console.error('Quick start failed:', error);
    });

    socket.on('workspaceFromTemplateCreated', ({ workspaceId }: { workspaceId: string }) => {
      setCreatingProject(false);
      setCreatedWorkspaceId(workspaceId);
    });

    // Session auto-reconnect: restore active session when browser reconnects
    socket.on('sessionLoaded', (data: FullSessionData & { isActive?: boolean }) => {
      // Only handle active session reconnect
      if (!data.isActive) return;

      // Restore session
      const restoredSession: Session = {
        id: data.session.id,
        startedAt: data.session.startedAt,
        feature: data.session.feature,
        projects: data.session.projects,
        plan: data.session.plan,
        gitBranches: data.session.gitBranches,
      };
      setSession(restoredSession);
      setStatuses(data.session.statuses);
      setLogs(data.logs);

      // Use cached messages if returning to same session, otherwise use loaded
      const isReturningToActiveSession = data.session.id === activeSessionIdRef.current;
      if (isReturningToActiveSession && activeSessionMessagesRef.current.length > 0) {
        setStreamingMessages(activeSessionMessagesRef.current);
      } else {
        setStreamingMessages(data.chatMessages);
        activeSessionMessagesRef.current = data.chatMessages;
      }

      // Restore flows from session (or clear if empty/undefined)
      setFlows(data.flows || []);

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

      if (data.session.taskStates) {
        setTaskStates(data.session.taskStates);
      }

      setActiveSessionId(data.session.id);
      activeSessionIdRef.current = data.session.id;
      setAllComplete(data.session.status === 'completed');
      setStartingSession(false);  // Clear loading state after session restored

      console.log(`Session ${data.session.id} auto-reconnected`);
    });

    // New session ready event
    socket.on('newSessionReady', () => {
      console.log('New session ready');
    });

    // Dev servers stopped event
    socket.on('devServersStopped', () => {
      console.log('Dev servers stopped');
      setDevServers([]);
      setStartingDevServers(false);
    });

    // ═══════════════════════════════════════════════════════════════
    // Dev Server Management Events (standalone dev server controls)
    // ═══════════════════════════════════════════════════════════════

    // Dev server status updates
    socket.on('devServerStatus', ({ servers }: { servers: DevServerState[] }) => {
      console.log('[useSocket] Dev server status update:', servers.length, 'servers');
      setDevServers(servers);
      // Clear starting flag when we get a status update with running servers
      if (servers.some(s => s.status === 'running')) {
        setStartingDevServers(false);
      }
      // Clear starting flag when all servers are stopped
      if (servers.length === 0) {
        setStartingDevServers(false);
      }
    });

    // Dev server error
    socket.on('devServerError', ({ project, error }: { project?: string; error: string }) => {
      console.error('[useSocket] Dev server error:', project || 'general', error);
      setStartingDevServers(false);
    });

    // Port conflict detected
    socket.on('portConflict', ({ conflicts }: { conflicts: PortConflict[] }) => {
      console.log('[useSocket] Port conflicts detected:', conflicts.length);
      setPortConflicts(conflicts);
      setShowPortConflictModal(true);
      setStartingDevServers(false);
    });

    // Port check result (no conflicts)
    socket.on('portCheckResult', ({ hasConflicts }: { hasConflicts: boolean }) => {
      if (!hasConflicts) {
        setPortConflicts([]);
      }
    });

    // Port kill result
    socket.on('portKillResult', ({ port, success, processName }: { port: number; success: boolean; processName?: string; error?: string }) => {
      console.log(`[useSocket] Port ${port} kill result: ${success ? 'success' : 'failed'}`, processName);
      if (success) {
        // Remove the conflict from the list
        setPortConflicts(prev => prev.filter(c => c.port !== port));
      }
    });

    // Dev server logs
    socket.on('devServerLogs', ({ project, logs }: { project: string; logs: DevServerLogEntry[] }) => {
      console.log(`[useSocket] Received ${logs.length} logs for ${project}`);
      setDevServerLogs(prev => ({ ...prev, [project]: logs }));
    });

    // Dev server log stream (real-time)
    socket.on('devServerLog', ({ project, text, stream, timestamp }: { project: string; text: string; stream: 'stdout' | 'stderr'; timestamp: number }) => {
      setDevServerLogs(prev => {
        const existing = prev[project] || [];
        const newEntry: DevServerLogEntry = { project, text, stream, timestamp };
        // Keep last 500 lines
        const updated = [...existing, newEntry].slice(-500);
        return { ...prev, [project]: updated };
      });
    });

    // Resume session error
    socket.on('resumeError', ({ error }: { error: string }) => {
      console.error('[useSocket] Resume session error:', error);
      setStartingSession(false);
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

    // Branch check events (for checking current branch before session start)
    socket.on('branchStatus', ({ results }: {
      results: Array<{
        project: string;
        gitEnabled: boolean;
        currentBranch: string | null;
        mainBranch: string;
        isOnMainBranch: boolean;
        hasUncommittedChanges: boolean;
        uncommittedDetails?: { staged: number; unstaged: number; untracked: number };
      }>;
    }) => {
      console.log('[useSocket] Branch status:', results);
      setBranchCheckResult(results);
      setCheckingBranches(false);
    });

    socket.on('checkoutMainBranchResult', ({ results }: {
      results: Array<{
        project: string;
        success: boolean;
        message: string;
      }>;
    }) => {
      console.log('[useSocket] Checkout main branch result:', results);
      setCheckoutingBranches(false);
      // After checkout, clear the branch check result
      setBranchCheckResult(null);
    });

    // Permission prompt events (for live permission approval via MCP)
    // Queue prompts to handle multiple simultaneous requests
    socket.on('permissionPrompt', (event: PermissionPrompt) => {
      console.log(`Permission prompt for ${event.project}: ${event.toolName}`);
      setPermissionQueue(prev => [...prev, event]);
    });

    // Planning question events (for interactive Q&A during planning via MCP)
    socket.on('planningQuestion', (event: PlanningQuestion) => {
      const currentQ = event.questions[event.currentIndex];
      console.log(`Planning question (${event.currentIndex + 1}/${event.questions.length}): ${currentQ?.question}`);
      setPlanningQuestion(event);
    });

    // Clear planning question when all questions answered
    socket.on('planningQuestionClear', () => {
      setPlanningQuestion(null);
    });

    // Plan approval events (for interactive plan approval via MCP)
    socket.on('planApproval', (event: PlanApprovalEvent) => {
      console.log(`Plan submitted for approval: ${event.approvalId}`);
      setPendingPlanApproval({
        approvalId: event.approvalId,
        plan: event.plan
      });
    });

    // Multi-stage planning events
    socket.on('planningSessionState', (event: { sessionState: PlanningSessionState }) => {
      console.log(`[Planning] Session state update: stage=${event.sessionState.currentStage}`);
      setPlanningSessionState(event.sessionState);
    });

    socket.on('stageApproval', (event: StageApprovalRequest) => {
      console.log(`[Planning] Stage approval requested: ${event.stage} (${event.stageId})`);
      setPendingStageApproval(event);
    });

    // ═══════════════════════════════════════════════════════════════
    // Design Session Events
    // ═══════════════════════════════════════════════════════════════

    // Design session started
    socket.on('design:session_started', ({ sessionId }: { sessionId: string }) => {
      console.log('[Design] Session started:', sessionId);
      setDesignSessionId(sessionId);
      setDesignError(null);
    });

    // Design session ended
    socket.on('design:session_ended', () => {
      console.log('[Design] Session ended');
      setDesignSessionId(null);
      setDesignPhase('discovery');
      setDesignMessages([]);
      setDesignPreview(null);
      setDesignComplete(null);
      setDesignInputLocked(false);
      setDesignPages([]);
    });

    // Agent message (chat message from designer agent)
    socket.on('design:agent_message', ({ content }: { content: string }) => {
      console.log('[Design] Agent message:', content.substring(0, 50) + '...');
      const newMessage = {
        id: `msg_${Date.now()}`,
        role: 'assistant' as const,
        content,
        timestamp: Date.now(),
      };
      setDesignMessages(prev => [...prev, newMessage]);
    });

    // Unlock input (agent called request_user_input)
    socket.on('design:unlock_input', ({ placeholder }: { placeholder?: string }) => {
      console.log('[Design] Input unlocked:', placeholder);
      setDesignInputLocked(false);
      setDesignInputPlaceholder(placeholder || 'Type your response...');
    });

    // Lock input (waiting for agent)
    socket.on('design:lock_input', () => {
      console.log('[Design] Input locked');
      setDesignInputLocked(true);
      setDesignInputPlaceholder('Waiting for assistant...');
    });

    // Phase update
    socket.on('design:phase_update', ({ phase }: { phase: DesignPhase }) => {
      console.log('[Design] Phase update:', phase);
      setDesignPhase(phase);
    });

    // Generating state - show loading while agent generates
    socket.on('design:generating', ({ type, message }: { type: 'theme' | 'component' | 'mockup'; message?: string }) => {
      console.log('[Design] Generating:', type);
      setDesignGenerating({ type, message });
    });

    // Generation complete - clear generating state (preview will show next)
    socket.on('design:generation_complete', () => {
      console.log('[Design] Generation complete');
      setDesignGenerating(null);
    });

    // Show preview (theme, component, or mockup)
    socket.on('design:show_preview', ({ type, options }: {
      type: 'theme' | 'component' | 'mockup';
      options: ThemeOption[] | ComponentStyleOption[] | MockupOption[];
    }) => {
      console.log('[Design] Show preview:', type, options.length, 'options');
      // If we're in refine mode and get a new preview, exit refine mode
      setDesignRefine(null);
      setDesignPreview({ type, options });
    });

    // Update refine preview (single option updated)
    socket.on('design:update_refine', ({ option }: {
      option: ThemeOption | ComponentStyleOption | MockupOption;
    }) => {
      console.log('[Design] Update refine preview');
      setDesignRefine(prev => prev ? { ...prev, option } : null);
      setDesignGenerating(null);
    });

    // Design complete
    socket.on('design:complete', ({ designPath, designName }: { designPath: string; designName: string }) => {
      console.log('[Design] Complete:', designPath);
      setDesignComplete({ designPath, designName });
      setDesignPhase('complete');
    });

    // Page added to session (also sets phase to 'pages')
    socket.on('design:page_added', ({ page }: { page: { id: string; name: string; filename: string } }) => {
      console.log('[Design] Page added:', page.name);
      setDesignPages(prev => [...prev, page]);
      setDesignPhase('pages');
    });

    // Show pages panel (update full pages list and set phase to 'pages')
    socket.on('design:show_pages_panel', ({ pages }: { pages: Array<{ id: string; name: string; filename: string }> }) => {
      console.log('[Design] Show pages panel:', pages.length, 'pages');
      setDesignPages(pages);
      setDesignPhase('pages');
    });

    // Design error
    socket.on('design:error', ({ message }: { message: string }) => {
      console.error('[Design] Error:', message);
      setDesignError(message);
      setDesignInputLocked(false);
    });

    // Request initial data
    socket.emit('getTemplates');
    socket.emit('getWorkspaces');

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

  const startSession = useCallback((feature: string, projects: string[], branchName?: string, workspaceId?: string) => {
    if (socketRef.current) {
      setStartingSession(true);
      socketRef.current.emit('startSession', { feature, projects, branchName, workspaceId });
      // Clear cached messages for new session
      activeSessionMessagesRef.current = [];
    }
  }, []);


  const startExecution = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('startExecution');
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
    // Optional permissions override (otherwise uses template default)
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

  // Create project from template and add to existing workspace
  const createProjectFromTemplateForWorkspace = useCallback((
    workspaceId: string,
    options: CreateProjectOptions
  ) => {
    console.log('[useSocket] createProjectFromTemplateForWorkspace called:', { workspaceId, options });
    if (socketRef.current) {
      setCreatingProject(true);
      setCreateProjectError(null); // Clear any previous error
      console.log('[useSocket] Emitting createProjectFromTemplateForWorkspace');
      socketRef.current.emit('createProjectFromTemplateForWorkspace', {
        workspaceId,
        name: options.name,
        targetPath: options.targetPath,
        template: options.template,
        permissions: options.permissions,
      });
    } else {
      console.error('[useSocket] Socket not connected!');
    }
  }, []);

  const clearCreateProjectError = useCallback(() => {
    setCreateProjectError(null);
  }, []);

  // Quick start with session: create projects from templates, workspace, and start session
  const quickStartSession = useCallback((appName: string, feature: string, templateNames: string[], designName?: string) => {
    if (socketRef.current) {
      setCreatingProject(true);
      setStartingSession(true);
      setQuickStartError(null); // Clear any previous error
      socketRef.current.emit('quickStartSession', { appName, feature, templateNames, designName });
    }
  }, []);

  const clearQuickStartError = useCallback(() => {
    setQuickStartError(null);
  }, []);

  // Create workspace from templates (without starting a session)
  const createWorkspaceFromTemplate = useCallback((appName: string, templateNames: string[], context?: string, designName?: string) => {
    if (socketRef.current) {
      setCreatingProject(true);
      setQuickStartError(null);
      setCreatedWorkspaceId(null);
      socketRef.current.emit('createWorkspaceFromTemplate', { appName, templateNames, context, designName });
    }
  }, []);

  // Clear created workspace ID (for navigation handling)
  const clearCreatedWorkspaceId = useCallback(() => {
    setCreatedWorkspaceId(null);
  }, []);

  const createWorkspace = useCallback((name: string, projects: WorkspaceProjectConfig[], context?: string) => {
    if (socketRef.current) {
      socketRef.current.emit('createWorkspace', { name, projects, context });
    }
  }, []);

  const updateWorkspace = useCallback((id: string, updates: { name?: string; projects?: WorkspaceProjectConfig[]; context?: string }) => {
    if (socketRef.current) {
      socketRef.current.emit('updateWorkspace', { id, updates });
    }
  }, []);

  const deleteWorkspace = useCallback((id: string) => {
    if (socketRef.current) {
      socketRef.current.emit('deleteWorkspace', { id });
    }
  }, []);

  // Workspace project CRUD operations
  const addProjectToWorkspace = useCallback((workspaceId: string, project: WorkspaceProjectConfig) => {
    if (socketRef.current) {
      setAddingProject(true);
      socketRef.current.emit('addProjectToWorkspace', { workspaceId, project });
    }
  }, []);

  const updateWorkspaceProject = useCallback((workspaceId: string, projectName: string, updates: Partial<ProjectConfig>) => {
    if (socketRef.current) {
      socketRef.current.emit('updateWorkspaceProject', { workspaceId, projectName, updates });
    }
  }, []);

  const removeProjectFromWorkspace = useCallback((workspaceId: string, projectName: string) => {
    if (socketRef.current) {
      socketRef.current.emit('removeProjectFromWorkspace', { workspaceId, projectName });
    }
  }, []);

  const stopSession = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('stopDevServers');
    }
  }, []);

  const startNewSession = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('startNewSession');
    }
    // Clear all local state
    setSession(null);
    setStatuses({});
    setLogs([]);
    setStreamingMessages([]);
    setTestStates({});
    setTaskStates([]);
    setAllComplete(false);
    setActiveSessionId(null);
    setFlows([]);
    setPlanningStatus(null);
    setPendingPlanApproval(null);
    setPlanningSessionState(null);
    setPendingStageApproval(null);
    // Clear refs
    activeSessionMessagesRef.current = [];
    activeSessionIdRef.current = null;
  }, []);

  // Resume an interrupted or failed session
  const resumeSession = useCallback((sessionId: string) => {
    if (socketRef.current) {
      setStartingSession(true);
      // Don't clear messages - they will be restored from the session via sessionLoaded
      socketRef.current.emit('resumeSession', { sessionId });
    }
  }, []);

  // Submit user input response (for request_user_input MCP tool)
  const submitUserInput = useCallback((requestId: string, values: Record<string, string>) => {
    if (socketRef.current) {
      console.log('[useSocket] Submitting user input: ' + requestId);
      socketRef.current.emit('userInputResponse', { requestId, values });
      // Remove from queue
      setUserInputQueue(prev => prev.filter(r => r.requestId !== requestId));
    }
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
    setStatuses({});
    setLogs([]);
    setStreamingMessages([]);
    setTestStates({});
    setAllComplete(false);
    setActiveSessionId(null);
    setFlows([]);
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

  // Check branch status for projects (before session start)
  const checkBranchStatus = useCallback((projects: string[]) => {
    if (socketRef.current) {
      setCheckingBranches(true);
      setBranchCheckResult(null);
      socketRef.current.emit('checkBranchStatus', { projects });
    }
  }, []);

  // Checkout main branch for projects
  // If stashFirst is true, stash uncommitted changes before checkout
  const checkoutMainBranch = useCallback((projects: string[], stashFirst?: boolean) => {
    if (socketRef.current) {
      setCheckoutingBranches(true);
      socketRef.current.emit('checkoutMainBranch', { projects, stashFirst });
    }
  }, []);

  // Clear branch check result (dismiss the modal)
  const clearBranchCheckResult = useCallback(() => {
    setBranchCheckResult(null);
  }, []);

  // Current permission prompt (first in queue) for backward compatibility
  const permissionPrompt = permissionQueue.length > 0 ? permissionQueue[0] : null;

  // Respond to permission prompt (for live permission approval via MCP)
  // Removes the first item from the queue after responding
  const respondToPermission = useCallback((approved: boolean, allowAll?: boolean) => {
    if (socketRef.current && permissionQueue.length > 0) {
      const currentPrompt = permissionQueue[0];
      socketRef.current.emit('permissionResponse', {
        project: currentPrompt.project,
        approved,
        toolName: currentPrompt.toolName,
        allowAll: allowAll || false,
      });
      // Remove the first item from the queue
      setPermissionQueue(prev => prev.slice(1));
    }
  }, [permissionQueue]);

  // Answer planning question (for interactive Q&A during planning via MCP)
  const answerPlanningQuestion = useCallback((questionId: string, answer: string) => {
    if (socketRef.current) {
      socketRef.current.emit('answerPlanningQuestion', { questionId, answer });
      setPlanningQuestion(null);
    }
  }, []);

  // Approve plan via chat (for interactive plan approval via MCP)
  const approvePlanViaChat = useCallback(() => {
    if (socketRef.current && pendingPlanApproval) {
      // Signal approval to MCP (resolves the blocking call)
      socketRef.current.emit('approvePlanViaChat', { approvalId: pendingPlanApproval.approvalId });
      // Store the plan in the session (same as old approvePlan)
      socketRef.current.emit('approvePlan', pendingPlanApproval.plan);
      // Start execution (same as old approvePlan)
      socketRef.current.emit('startExecution');
      setPendingPlanApproval(null);
    }
  }, [pendingPlanApproval]);

  // Request plan refinement (user types feedback in chat)
  const refinePlan = useCallback((feedback: string) => {
    if (socketRef.current && pendingPlanApproval) {
      socketRef.current.emit('refinePlan', {
        approvalId: pendingPlanApproval.approvalId,
        feedback
      });
      // Add user message to streaming messages
      const userMessage: StreamingMessage = {
        id: `user_${Date.now()}`,
        role: 'user',
        content: [{ type: 'text', text: feedback }],
        status: 'complete',
        createdAt: Date.now(),
      };
      activeSessionMessagesRef.current = [...activeSessionMessagesRef.current, userMessage];
      setStreamingMessages(prev => [...prev, userMessage]);
      setPendingPlanApproval(null);
    }
  }, [pendingPlanApproval]);

  // Respond to stage approval (for multi-stage planning)
  const respondToStageApproval = useCallback((stageId: string, approved: boolean, feedback?: string) => {
    if (socketRef.current) {
      console.log(`[Planning] Responding to stage approval: ${stageId}, approved=${approved}`);
      if (approved) {
        socketRef.current.emit('approveStage', { stageId });
      } else {
        socketRef.current.emit('rejectStage', { stageId, feedback: feedback || '' });
      }
      setPendingStageApproval(null);
    }
  }, []);


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

  // ═══════════════════════════════════════════════════════════════
  // Design Session Actions
  // ═══════════════════════════════════════════════════════════════

  // Start a design session
  const startDesignSession = useCallback((category?: DesignCategory) => {
    if (socketRef.current) {
      console.log('[Design] Starting session with category:', category);
      setDesignMessages([]);
      setDesignPreview(null);
      setDesignComplete(null);
      setDesignError(null);
      setDesignInputLocked(true);
      setDesignInputPlaceholder('Starting design session...');
      socketRef.current.emit('design:start_session', { category });
    }
  }, []);

  // End the design session
  const endDesignSession = useCallback(() => {
    if (socketRef.current) {
      console.log('[Design] Ending session');
      socketRef.current.emit('design:end_session');
    }
  }, []);

  // Send a message in the design chat
  const sendDesignMessage = useCallback((content: string) => {
    if (socketRef.current && !designInputLocked) {
      console.log('[Design] Sending message:', content.substring(0, 50) + '...');
      // Add user message to local state immediately
      const userMessage = {
        id: `msg_${Date.now()}`,
        role: 'user' as const,
        content,
        timestamp: Date.now(),
      };
      setDesignMessages(prev => [...prev, userMessage]);
      // Lock input while waiting for response
      setDesignInputLocked(true);
      setDesignInputPlaceholder('Waiting for assistant...');
      // Emit to server
      socketRef.current.emit('design:user_message', { content });
    }
  }, [designInputLocked]);

  // Send category selection
  const selectDesignCategory = useCallback((category: DesignCategory) => {
    if (socketRef.current) {
      console.log('[Design] Selecting category:', category);
      socketRef.current.emit('design:category_selected', { category });
    }
  }, []);

  // Select an option from preview (palette, component, or mockup) - confirms and moves to next phase
  const selectDesignOption = useCallback((index: number) => {
    if (socketRef.current) {
      console.log('[Design] Selecting option:', index);
      setDesignPreview(null);
      setDesignRefine(null);
      socketRef.current.emit('design:option_selected', { index });
    }
  }, []);

  // Enter refine mode - iterate on a single selected option
  const enterDesignRefine = useCallback((index: number) => {
    if (socketRef.current && designPreview) {
      console.log('[Design] Entering refine mode for option:', index);
      const option = designPreview.options[index];
      setDesignRefine({
        type: designPreview.type,
        option,
        index,
      });
      setDesignPreview(null);
      // Tell backend we're entering refine mode
      socketRef.current.emit('design:enter_refine', { index });
    }
  }, [designPreview]);

  // Exit refine mode - confirm selection and move to next phase
  const confirmDesignRefine = useCallback(() => {
    if (socketRef.current && designRefine) {
      console.log('[Design] Confirming refined option');
      setDesignRefine(null);
      socketRef.current.emit('design:confirm_refine', {});
    }
  }, [designRefine]);

  // Request new options while in refine mode
  const requestNewDesignOptions = useCallback(() => {
    if (socketRef.current) {
      console.log('[Design] Requesting new options');
      setDesignRefine(null);
      socketRef.current.emit('design:request_new_options', {});
    }
  }, []);

  // Submit feedback for preview refinement
  const submitDesignFeedback = useCallback((feedback: string) => {
    if (socketRef.current) {
      console.log('[Design] Submitting feedback:', feedback.substring(0, 50) + '...');
      setDesignPreview(null);
      socketRef.current.emit('design:feedback_submitted', { feedback });
    }
  }, []);

  // Clear design preview
  const clearDesignPreview = useCallback(() => {
    setDesignPreview(null);
  }, []);

  // Clear design refine
  const clearDesignRefine = useCallback(() => {
    setDesignRefine(null);
  }, []);

  // Finish adding pages (transition to save screen)
  const finishAddingPages = useCallback(() => {
    console.log('[Design] Finishing page addition, showing save screen');
    setDesignPhase('complete');
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // Dev Server Management Actions (standalone dev server controls)
  // ═══════════════════════════════════════════════════════════════

  // Start dev servers for a workspace (checks ports first)
  const startDevServers = useCallback((workspaceId: string, projects?: string[]) => {
    if (socketRef.current) {
      console.log('[useSocket] Starting dev servers for workspace:', workspaceId);
      setStartingDevServers(true);
      setDevServerWorkspaceId(workspaceId);
      // First check port availability
      socketRef.current.emit('checkPortAvailability', { workspaceId, projects });
      // If no conflicts, backend will emit portCheckResult and we can start
      // If conflicts, backend will emit portConflict and we show modal
      // Once ports are clear, start servers
      socketRef.current.emit('startDevServers', { workspaceId, projects });
    }
  }, []);

  // Force start dev servers (skip port check, useful after resolving conflicts)
  const forceStartDevServers = useCallback((workspaceId: string, projects?: string[]) => {
    if (socketRef.current) {
      console.log('[useSocket] Force starting dev servers for workspace:', workspaceId);
      setStartingDevServers(true);
      setShowPortConflictModal(false);
      setPortConflicts([]);
      socketRef.current.emit('startDevServers', { workspaceId, projects });
    }
  }, []);

  // Stop a single dev server
  const stopDevServer = useCallback((project: string) => {
    if (socketRef.current) {
      console.log('[useSocket] Stopping dev server:', project);
      socketRef.current.emit('stopDevServer', { project });
    }
  }, []);

  // Stop all dev servers
  const stopAllDevServers = useCallback(() => {
    if (socketRef.current) {
      console.log('[useSocket] Stopping all dev servers');
      socketRef.current.emit('stopDevServers');
    }
  }, []);

  // Restart a single dev server
  const restartDevServer = useCallback((project: string) => {
    if (socketRef.current) {
      console.log('[useSocket] Restarting dev server:', project);
      socketRef.current.emit('restartDevServer', { project });
    }
  }, []);

  // Check port availability for a workspace
  const checkPorts = useCallback((workspaceId: string, projects?: string[]) => {
    if (socketRef.current) {
      console.log('[useSocket] Checking ports for workspace:', workspaceId);
      socketRef.current.emit('checkPortAvailability', { workspaceId, projects });
    }
  }, []);

  // Kill process on a specific port
  const killPortProcess = useCallback((port: number) => {
    if (socketRef.current) {
      console.log('[useSocket] Killing process on port:', port);
      socketRef.current.emit('killPortProcess', { port });
    }
  }, []);

  // Get logs for a specific dev server
  const getDevServerLogs = useCallback((project: string) => {
    if (socketRef.current) {
      console.log('[useSocket] Getting logs for:', project);
      socketRef.current.emit('getDevServerLogs', { project });
    }
  }, []);

  // Get status of all dev servers
  const refreshDevServerStatus = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('getDevServerStatus');
    }
  }, []);

  // Close port conflict modal
  const closePortConflictModal = useCallback(() => {
    setShowPortConflictModal(false);
    setPortConflicts([]);
    setStartingDevServers(false);
  }, []);

  // Derived state: separate active flows from completed flows
  const { activeFlows, completedFlows } = useMemo(() => ({
    activeFlows: flows.filter(f => f.status === 'in_progress'),
    completedFlows: flows.filter(f => f.status !== 'in_progress')
  }), [flows]);

  return {
    port,
    connected,
    clientRole,
    secondaryMessage,
    checkingDependencies,
    dependencyCheck,
    backendError,
    session,
    statuses,
    logs,
    streamingMessages,
    testStates,
    taskStates,
    planningStatus,
    flows,
    activeFlows,
    completedFlows,
    allComplete,
    templates,
    workspaces,
    creatingProject,
    addingProject,
    startingSession,
    quickStartError,
    activeSessionId,
    pushingBranch,
    pushResults,
    mergingBranch,
    mergeResults,
    creatingPR,
    prResults,
    gitHubInfo,
    availableBranches,
    loadingBranches,
    branchCheckResult,
    checkingBranches,
    checkoutingBranches,
    permissionPrompt,
    userInputRequest: userInputQueue.length > 0 ? userInputQueue[0] : null,
    planningQuestion,
    pendingPlanApproval,
    planningSessionState,
    pendingStageApproval,
    sendChat,
    startSession,
    startExecution,
    clearLogs,
    clearStreamingMessages,
    clearFlows,
    createProjectFromTemplate,
    createProjectFromTemplateForWorkspace,
    quickStartSession,
    createWorkspaceFromTemplate,
    createdWorkspaceId,
    clearCreatedWorkspaceId,
    clearQuickStartError,
    createProjectError,
    clearCreateProjectError,
    clearSession,
    stopSession,
    startNewSession,
    resumeSession,
    submitUserInput,
    pushBranch,
    clearPushResult,
    mergeBranch,
    getGitHubInfo,
    createPR,
    getBranches,
    checkBranchStatus,
    checkoutMainBranch,
    clearBranchCheckResult,
    recheckDependencies,
    respondToPermission,
    answerPlanningQuestion,
    approvePlanViaChat,
    refinePlan,
    retryProject,
    retryPlan,
    respondToStageApproval,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    addProjectToWorkspace,
    updateWorkspaceProject,
    removeProjectFromWorkspace,
    // Design session state
    designSessionId,
    designPhase,
    designInputLocked,
    designInputPlaceholder,
    designMessages,
    designPreview,
    designRefine,
    designComplete,
    designError,
    designGenerating,
    designPages,
    // Design session actions
    startDesignSession,
    endDesignSession,
    sendDesignMessage,
    selectDesignCategory,
    selectDesignOption,
    enterDesignRefine,
    confirmDesignRefine,
    requestNewDesignOptions,
    submitDesignFeedback,
    clearDesignPreview,
    clearDesignRefine,
    finishAddingPages,
    // Dev server state
    devServers,
    devServerLogs,
    portConflicts,
    showPortConflictModal,
    startingDevServers,
    devServerWorkspaceId,
    // Dev server actions
    startDevServers,
    forceStartDevServers,
    stopDevServer,
    stopAllDevServers,
    restartDevServer,
    checkPorts,
    killPortProcess,
    getDevServerLogs,
    refreshDevServerStatus,
    closePortConflictModal,
  };
}
