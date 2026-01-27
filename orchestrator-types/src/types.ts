// Project permission configuration
export interface ProjectPermissions {
  dangerouslyAllowAll?: boolean;  // If true, uses --dangerously-skip-permissions (not recommended)
  allow: string[];                 // List of allowed permissions (from AVAILABLE_PERMISSIONS)
}

// Project configuration
export interface ProjectConfig {
  path: string;
  devServer: {
    command: string;
    readyPattern: string;
    env: Record<string, string>;
    port?: number;  // Dev server port (used to construct URL as http://localhost:{port})
    url?: string;   // Full dev server URL (e.g., "http://localhost:3000"). If set, takes precedence over port
  };
  buildCommand?: string;  // Command to build the project (e.g., "npm run build")
  setupCommand?: string;  // Command to run on project setup (e.g., "claude mcp add playwright -- npx @playwright/mcp@latest")
  hasE2E: boolean;
  e2eInstructions?: string;  // Custom E2E testing instructions (markdown). If set, overrides default E2E behavior
  dependsOn?: string[];  // Projects that must complete E2E before this one starts (e.g., frontend depends on backend)
  gitEnabled?: boolean;  // Enable git features (feature branches, auto-commits)
  mainBranch?: string;   // Main branch name (default: 'main')
  permissions?: ProjectPermissions;  // Claude Code agent permissions for this project
}

export interface Config {
  projects: Record<string, ProjectConfig>;
  defaults: {
    approvalTimeout: number;
    maxRestarts: number;
    debugEscalationTime: number;
  };
}

// Agent status states
export type AgentStatus =
  | 'PENDING'       // Initialized but execution not started
  | 'IDLE'          // Execution complete, no active work
  | 'WORKING'
  | 'DEBUGGING'
  | 'FATAL_DEBUGGING'
  | 'READY'
  | 'E2E'
  | 'E2E_FIXING'    // Fixing issues found in E2E tests
  | 'FAILED'        // Task failed, requires user intervention to continue
  | 'BLOCKED';

// Outbox event types (agent → orchestrator)
export interface StatusUpdate {
  type: 'status_update';
  project: string;
  status: AgentStatus;
  message: string;
  timestamp: number;
}

export interface Message {
  type: 'message';
  from: string;
  to: string;
  message: string;
  timestamp: number;
}

export interface ApprovalRequest {
  type: 'approval_request';
  id: string;
  project: string;
  prompt: string;
  approval_type: string;
  timestamp: number;
}

export interface ErrorReport {
  type: 'error_report';
  project: string;
  error: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
}

export interface TaskComplete {
  type: 'task_complete';
  project: string;
  summary: string;
  timestamp: number;
}

export interface RestartRequest {
  type: 'restart_request';
  project: string;
  reason: string;
  timestamp: number;
}

export interface CrossProjectBlocked {
  type: 'cross_project_blocked';
  tool: string;
  target_path: string;
  project_root: string;
  message: string;
  timestamp: number;
}

export type OutboxEvent =
  | StatusUpdate
  | Message
  | ApprovalRequest
  | ErrorReport
  | TaskComplete
  | RestartRequest
  | CrossProjectBlocked;

// Session and plan
export interface Session {
  id: string;
  startedAt: number;
  feature: string;
  projects: string[];
  plan?: Plan;
  gitBranches?: Record<string, string>;  // project -> branchName mapping for git-enabled projects
}

// User action input field for secrets/configuration collection
export interface UserActionInput {
  name: string;           // e.g., "GOOGLE_CLIENT_ID" (env var name)
  label: string;          // e.g., "Google OAuth Client ID"
  description: string;    // Help text for the user
  sensitive: boolean;     // true = password field, don't log
  required: boolean;
  placeholder?: string;
  helpUrl?: string;       // e.g., "https://console.cloud.google.com/apis/credentials"
}

// User action definition for tasks that require user input
export interface UserActionDefinition {
  prompt: string;                  // Explanation for user
  inputs: UserActionInput[];       // Fields to collect
}

export interface TaskDefinition {
  project: string;
  name: string;        // Short task name for display (e.g., "Add login form")
  task: string;        // Full task description (markdown supported)
  type?: 'implementation' | 'user_action' | 'e2e_fix';  // Task type, default: 'implementation'
  userAction?: UserActionDefinition;        // Only for type: 'user_action'
}

export interface Plan {
  feature: string;
  description: string;
  overview?: string;           // High-level summary of the implementation approach
  architecture?: string;       // ASCII diagram showing component relationships
  tasks: TaskDefinition[];
  testPlan: Record<string, string[]>;
  e2eDependencies?: Record<string, string[]>;  // E2E test execution order (project -> depends on projects)
}

// Planning status phases for UX feedback
export type PlanningPhase =
  | 'exploring'      // "Exploring codebase..."
  | 'analyzing'      // "Analyzing requirements..."
  | 'generating'     // "Generating plan..."
  | 'complete'       // Done
  | 'error';         // Planning failed

export interface PlanningStatusEvent {
  phase: PlanningPhase;
  message: string;    // Human-readable status
  project?: string;   // If analyzing specific project
  errorDetails?: string;  // Full error for error phase
}

// Analysis result types (for task verification and E2E)
export type AnalysisType = 'task' | 'e2e';

export interface AnalysisResultEvent {
  type: AnalysisType;
  project: string;
  taskName?: string;           // For task analysis
  passed: boolean;
  summary: string;             // Brief result
  details?: string;            // Full analysis (shown on expand)
  fixPrompt?: string;          // If failed, what fix was requested
}

// Project state tracking
export interface ProjectState {
  status: AgentStatus;
  message: string;
  updatedAt: number;
  devServerPid?: number;
  agentPid?: number;
}

// Process info
export interface ProcessInfo {
  pid: number;
  project: string;
  type: 'devServer' | 'agent';
  startedAt: number;
  ready: boolean;
}

// Log entry
export interface LogEntry {
  project: string;
  type: 'devServer' | 'agent';
  stream: 'stdout' | 'stderr';
  text: string;
  timestamp: number;
}

// Approval response
export interface ApprovalResponse {
  approved: boolean;
  timestamp: number;
}

// WebSocket event payloads
export interface StatusEvent {
  project: string;
  status: AgentStatus;
  message: string;
}

export interface LogEvent {
  project: string;
  type: 'devServer' | 'agent';
  stream: 'stdout' | 'stderr';
  text: string;
  timestamp: number;
}

export interface ChatEvent {
  from: 'user' | 'planning';
  message: string;
  timestamp?: number;
}

// Streaming content blocks (for agentic UI)
export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContentBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface ThinkingContentBlock {
  type: 'thinking';
  thinking: string;
}

export type ContentBlock =
  | TextContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock
  | ThinkingContentBlock;

// Chat stream event for real-time streaming
export interface ChatStreamEvent {
  type: 'message_start' | 'content_block' | 'message_complete' | 'error';
  messageId: string;
  block?: ContentBlock;
  content?: ContentBlock[];  // All content blocks (for message_complete)
  error?: string;
  isPlanningRequest?: boolean;  // True if this is a plan generation request (uses planningStatus for UX)
}

export interface ApprovalEvent {
  id: string;
  project: string;
  prompt: string;
  approval_type: string;
}

// Planning Agent types
export interface PlanProposal {
  plan: Plan;
  summary: string;
}

export interface E2EPromptRequest {
  project: string;
  taskSummary: string;
  testScenarios: string[];
  devServerUrl?: string;
  devServerLogs?: string;  // Recent dev server logs for debugging
  passedCount?: number;    // Number of tests already passed (skipped on retry)
}

// Orchestrator state machine
export type OrchestratorState = 'IDLE' | 'RUNNING' | 'PAUSING' | 'PAUSED';

// Extended agent status for new hooks
export type ExtendedAgentStatus = AgentStatus | 'NEEDS_INPUT' | 'ERROR';

// New hook-based events (from .claude/hooks/)
export interface HookStatusEvent {
  type: 'status';
  status: ExtendedAgentStatus;
  timestamp: number;
}

export interface HookNotificationEvent {
  type: 'notification';
  status: ExtendedAgentStatus;
  message: string;
  notification_type: string;
  timestamp: number;
}

export interface HookToolCompleteEvent {
  type: 'tool_complete';
  tool: string;
  success: boolean;
  timestamp: number;
}

export interface HookToolStartEvent {
  type: 'tool_start';
  tool: string;
  timestamp: number;
}

export interface HookSubagentStopEvent {
  type: 'subagent_stop';
  timestamp: number;
}

// Union of all hook events
export type HookEvent =
  | HookStatusEvent
  | HookNotificationEvent
  | HookToolCompleteEvent
  | HookToolStartEvent
  | HookSubagentStopEvent;

// Event queue types
export interface QueuedEvent {
  id: string;
  type: string;
  project?: string;
  data: OrchestratorEvent;
  queuedAt: number;
}

export interface UserChatEvent {
  type: 'user_chat';
  message: string;
  target?: string; // 'planning' or specific project name
}

// E2E-related events (queued for Planning Agent)
export interface E2ECompleteEvent {
  type: 'e2e_complete';
  project: string;
  result: string;
  testScenarios: string[];
  devServerLogs: string;
  allProjects: string[];
}

export interface E2EPromptRequestEvent {
  type: 'e2e_prompt_request';
  project: string;
  taskSummary: string;
  testScenarios: string[];
  devServerUrl?: string;
  passedCount?: number;    // Number of tests already passed (skipped on retry)
}

export interface FailureAnalysisEvent {
  type: 'failure_analysis';
  project: string;
  error: string;
  context: string[];
}

// Orchestrator event union (what gets queued)
export type OrchestratorEvent =
  | (HookEvent & { project: string })
  | UserChatEvent
  | E2ECompleteEvent
  | E2EPromptRequestEvent
  | FailureAnalysisEvent
  | OutboxEvent;

// Planning Agent actions (what Planning Agent returns)
export interface ChatResponseAction {
  type: 'chat_response';
  message: string;
}

export interface SendToAgentAction {
  type: 'send_to_agent';
  project: string;
  prompt: string;
}

export interface SendE2EAction {
  type: 'send_e2e';
  project: string;
  prompt: string;
}

export interface RestartServerAction {
  type: 'restart_server';
  project: string;
}

export interface CompleteAction {
  type: 'complete';
  summary: string;
}

export interface NoopAction {
  type: 'noop';
}

export interface SkipE2EAction {
  type: 'skip_e2e';
  project: string;
  reason?: string;
}

export interface RetryE2EAction {
  type: 'retry_e2e';
  project: string;
}

export type PlanningAction =
  | ChatResponseAction
  | SendToAgentAction
  | SendE2EAction
  | RestartServerAction
  | CompleteAction
  | NoopAction
  | SkipE2EAction
  | RetryE2EAction;

// Hook configuration for .claude/settings.json
export interface HookConfig {
  hooks: {
    Stop?: Array<{ hooks: Array<{ type: string; command: string }> }>;
    Notification?: Array<{ hooks: Array<{ type: string; command: string }> }>;
    PostToolUse?: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;
    PreToolUse?: Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;
    SubagentStop?: Array<{ hooks: Array<{ type: string; command: string }> }>;
  };
}

// Queue status for UI visibility
export interface QueuedEventPreview {
  id: string;
  type: string;
  project?: string;
  queuedAt: number;
  preview?: string;  // Truncated message for user_chat events
}

export interface QueueStatus {
  size: number;
  events: QueuedEventPreview[];
  processing?: {
    id: string;
    type: string;
    project?: string;
  };
}

// Test status tracking for E2E tests
export type TestScenarioStatus = 'pending' | 'running' | 'passed' | 'failed';

export interface TestStatusEvent {
  project: string;
  scenario: string;
  status: TestScenarioStatus;
  error?: string;
  timestamp: number;
}

// Task status tracking for dependency-aware execution
export type TaskStatus =
  | 'pending'         // Not started yet
  | 'awaiting_input'  // Waiting for user to provide required input (user_action tasks)
  | 'waiting'         // Waiting on dependency tasks
  | 'working'         // Agent is implementing
  | 'verifying'       // Running deps install, build, restart, health check
  | 'fixing'          // Agent fixing verification errors
  | 'completed'       // Implementation done (no E2E or E2E passed)
  | 'e2e'             // Running E2E tests after implementation
  | 'e2e_failed'      // E2E tests failed (may retry or redistribute)
  | 'failed';         // Implementation failed

export interface TaskState {
  taskIndex: number;     // Index in the tasks array
  project: string;
  name: string;          // Short task name for display
  description: string;   // Full task description (markdown)
  status: TaskStatus;
  message?: string;
  startedAt?: number;
  completedAt?: number;
  type?: 'implementation' | 'user_action' | 'e2e_fix';  // Task type
  userAction?: UserActionDefinition;        // Only for type: 'user_action'
}

export interface TaskStatusEvent {
  taskIndex: number;
  project: string;
  status: TaskStatus;
  message?: string;
  timestamp: number;
}

// Verification result for post-task health checks
export type VerificationStep = 'deps' | 'build' | 'restart' | 'health';

export interface VerificationResult {
  success: boolean;
  step: VerificationStep;
  error?: string;
  logs?: string;
}

// Context collected after task execution for Planning Agent analysis
export interface TaskVerificationContext {
  project: string;
  taskName: string;
  taskDescription: string;
  agentResponse?: string;        // What the agent did
  buildOutput?: {
    stdout: string;
    stderr: string;
    exitCode: number;
  };
  devServerLogs?: string;        // Recent dev server output
  healthCheck?: {
    healthy: boolean;
    error?: string;
  };
}

// Planning Agent's analysis result
export interface TaskAnalysisResult {
  passed: boolean;
  analysis: string;              // Explanation of what happened
  fixPrompt?: string;            // If failed, intelligent fix instructions
  suggestedAction?: 'retry' | 'escalate' | 'skip';
}

// Work redistribution types
export interface StuckState {
  completedTasks: number[];
  failedTasks: number[];
  pendingTasks: number[];
  errors: Array<{ taskIndex: number; error: string }>;
}

export interface RedistributionContext {
  feature: string;
  originalPlan: Plan;
  completedWork: Array<{ index: number; task: TaskDefinition; status: string }>;
  failedWork: Array<{ index: number; task: TaskDefinition; error?: string }>;
  pendingWork: Array<{ index: number; task: TaskDefinition; blockedBy?: number[] }>;
}

// Project templates
export type ProjectTemplate = 'vite-frontend' | 'nestjs-backend';

export interface ProjectTemplateConfig {
  name: ProjectTemplate;
  displayName: string;
  description: string;
  devServer: {
    command: string;
    readyPattern: string;
  };
  buildCommand?: string;
  setupCommand?: string;  // Command to run on project setup (e.g., "claude mcp add playwright -- npx @playwright/mcp@latest")
  defaultPort: number;
  dependencyInstall?: boolean;  // Whether to install dependencies when creating from template
}

// Streaming message for assistant-ui (persisted in chat history)
export interface StreamingMessage {
  id: string;
  role: 'user' | 'assistant';
  content: ContentBlock[];
  status: 'pending' | 'streaming' | 'complete' | 'error' | 'queued';
  createdAt: number;
}

// ═══════════════════════════════════════════════════════════════
// Unified Chat Event Types (for Planning Agent chat UX)
// ═══════════════════════════════════════════════════════════════

export type ChatEventType =
  | 'status'          // In-progress with spinner (verifying, analyzing, running E2E)
  | 'result'          // Pass/fail result (task verified, E2E passed/failed)
  | 'info';           // Informational (plan approved, fix sent, waiting)

export interface ChatCardEvent {
  id: string;
  type: ChatEventType;
  category: 'task' | 'e2e' | 'plan' | 'fix' | 'failure';
  project?: string;
  taskName?: string;
  timestamp: number;

  // For 'status' type
  message?: string;

  // For 'result' type
  passed?: boolean;
  summary?: string;
  details?: string;      // Markdown supported
  fixPrompt?: string;
  retryCount?: number;
  maxRetries?: number;

  // For chat response cards (overrides passed for color)
  responseStatus?: 'info' | 'success' | 'warning' | 'error';
}

// Specific events emitted by backend
export interface VerificationStartEvent {
  project: string;
  taskName: string;
  taskIndex: number;
}

export interface E2EStartEvent {
  project: string;
  testScenarios: string[];
}

export interface E2EAnalyzingEvent {
  project: string;
}

export interface FixSentEvent {
  fromProject: string;
  toProject: string;
  reason: string;
}

export interface WaitingForProjectEvent {
  project: string;
  waitingFor: string[];
}

export interface PlanApprovedCardEvent {
  feature: string;
  taskCount: number;
  projectCount: number;
}

export interface ChatResponseEvent {
  message: string;
  status: 'info' | 'success' | 'warning' | 'error';
  details?: string;
}

// User action required event (backend → frontend)
export interface UserActionRequiredEvent {
  taskIndex: number;
  project: string;
  taskName: string;
  userAction: UserActionDefinition;
}

// User action response (frontend → backend)
export interface UserActionResponseEvent {
  taskIndex: number;
  values: Record<string, string>;
}

// Session persistence types
export interface PersistedSession {
  id: string;
  feature: string;
  projects: string[];
  startedAt: number;
  plan?: Plan;
  pendingPlan?: PlanProposal;  // Plan waiting for user approval
  statuses: Record<string, ProjectState>;
  testStates: Record<string, PersistedTestState>;
  taskStates?: TaskState[];  // Task execution states
  gitBranches?: Record<string, string>;  // project -> branchName mapping for git-enabled projects
  status: 'planning' | 'running' | 'completed' | 'interrupted';
  updatedAt: number;
  completedAt?: number;
}

export interface PersistedTestState {
  scenarios: Array<{
    name: string;
    status: TestScenarioStatus;
    error?: string;
  }>;
  updatedAt: number;
}

export interface SessionSummary {
  id: string;
  feature: string;
  projects: string[];
  startedAt: number;
  updatedAt: number;
  status: 'planning' | 'running' | 'completed' | 'interrupted';
  completedAt?: number;
}

export interface FullSessionData {
  session: PersistedSession;
  logs: LogEntry[];
  chatMessages: StreamingMessage[];
}

// ═══════════════════════════════════════════════════════════════
// Request Flow Types (for two-section chat UX)
// ═══════════════════════════════════════════════════════════════

export type FlowType = 'e2e' | 'task' | 'planning' | 'fix' | 'waiting' | 'info' | 'success';

export type FlowStepStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped';

export interface FlowStep {
  id: string;
  status: FlowStepStatus;
  message: string;
  timestamp: number;
}

export type FlowStatus = 'in_progress' | 'completed' | 'failed';

export interface RequestFlow {
  id: string;
  type: FlowType;
  project?: string;
  taskName?: string;
  status: FlowStatus;
  startedAt: number;
  completedAt?: number;
  steps: FlowStep[];
  // Final result for completed flows
  result?: {
    passed: boolean;
    summary?: string;
    details?: string;
  };
}

// Permission prompt from MCP server
export interface PermissionPromptRequest {
  project: string;
  taskIndex: number;
  toolName: string;
  toolInput: Record<string, unknown>;
}

// Permission response from frontend
export interface PermissionPromptResponse {
  project: string;
  taskIndex: number;
  approved: boolean;
  toolName: string;
}

// Alias for PermissionPromptRequest (used in web)
export type PermissionPrompt = PermissionPromptRequest;

// Dependency check types (for startup validation)
export interface DependencyStatus {
  available: boolean;
  version: string | null;
  error: string | null;
}

export interface DependencyCheckResult {
  claude: DependencyStatus;
  git: DependencyStatus;
}

// Chat message (legacy - simple text)
export interface ChatMessage {
  from: 'user' | 'planning' | 'system';
  message: string;
  timestamp: number;
}

// Session status type
export type SessionStatus = 'planning' | 'running' | 'completed' | 'interrupted';

// Test state for project
export interface TestScenarioState {
  name: string;
  status: TestScenarioStatus;
  error?: string;
}

export interface ProjectTestState {
  scenarios: TestScenarioState[];
  updatedAt: number;
}
