// Project permission configuration
export interface ProjectPermissions {
  dangerouslyAllowAll?: boolean;  // If true, uses --dangerously-skip-permissions (not recommended)
  allow: string[];                 // List of allowed permissions (from AVAILABLE_PERMISSIONS)
}

// Project configuration
export interface ProjectConfig {
  path: string;

  // Dev server (optional)
  devServerEnabled?: boolean;  // Whether dev server is enabled (defaults to true for backwards compat)
  devServer?: {
    command: string;
    readyPattern: string;
    env: Record<string, string>;
    url?: string;   // Dev server URL for health checks (e.g., "http://localhost:3000")
  };

  // Build (optional)
  buildEnabled?: boolean;  // Whether build is enabled (defaults to true if buildCommand exists)
  buildCommand?: string;  // Command to build the project (e.g., "npm run build")

  // Install packages (optional)
  installEnabled?: boolean;  // Whether install command is enabled
  installCommand?: string;  // e.g., "npm install", "yarn", "pip install -r requirements.txt"

  setupCommand?: string;  // Command to run on project setup (e.g., "claude mcp add playwright -- npx @playwright/mcp@latest")
  hasE2E: boolean;
  e2eInstructions?: string;  // Custom E2E testing instructions (markdown). If set, overrides default E2E behavior
  dependsOn?: string[];  // Projects that must complete E2E before this one starts (e.g., frontend depends on backend)
  gitEnabled?: boolean;  // Enable git features (feature branches, auto-commits)
  mainBranch?: string;   // Main branch name (default: 'main')
  permissions?: ProjectPermissions;  // Claude Code agent permissions for this project
  attachedDesign?: string;  // Name of design from library (singular - one per project)
}

export interface Config {
  projects: Record<string, ProjectConfig>;
  defaults: {
    approvalTimeout: number;
    maxRestarts: number;
    debugEscalationTime: number;
  };
}

// Project selection for session planning
export interface SessionProjectConfig {
  name: string;
  included: boolean;          // Include in session
  readOnly?: boolean;         // Explore but don't plan work
}

// Project config with name for inline storage in workspaces
export interface WorkspaceProjectConfig extends ProjectConfig {
  name: string;
}

// Workspace configuration (stored in workspaces.json)
export interface WorkspaceConfig {
  id: string;              // slug, e.g. "blog"
  name: string;            // "Blog"
  projects: WorkspaceProjectConfig[];  // inline project configs
  context?: string;        // planning context/rules (markdown)
  createdAt: number;
  updatedAt: number;
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

// Session and plan
export interface Session {
  id: string;
  startedAt: number;
  feature: string;
  projects: string[];
  plan?: Plan;
  gitBranches?: Record<string, string>;  // project -> branchName mapping for git-enabled projects
  workspaceId?: string;  // which workspace started this session
}

// User input request (MCP tool: request_user_input)
export interface UserInputField {
  type?: 'input' | 'confirmation';  // Type: "input" (default) for text fields, "confirmation" for yes/no dialogs
  name?: string;          // Variable name (e.g., GOOGLE_CLIENT_ID) - required for type: "input"
  label: string;          // Display label (input field label OR confirmation dialog title)
  description?: string;   // Help text (input) OR detailed message (confirmation, supports markdown)
  sensitive?: boolean;    // If true, mask input (only for type: "input")
  required?: boolean;     // If true, must provide value (only for type: "input")
}

export interface UserInputRequest {
  requestId: string;
  project: string;
  inputs: UserInputField[];
}

export interface UserInputResponse {
  requestId: string;
  values: Record<string, string>;
}

export interface TaskDefinition {
  project: string;
  name: string;        // Short task name for display (e.g., "Add login form")
  task: string;        // Full task description (markdown supported)
  type?: 'implementation' | 'e2e_fix';  // Task type, default: 'implementation'
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
  | 'exploring'          // "Exploring codebase..."
  | 'analyzing'          // "Analyzing requirements..."
  | 'generating'         // "Generating plan..."
  | 'awaiting_approval'  // Plan submitted, waiting for user (chat unlocked)
  | 'refining'           // User requested changes, agent is revising (chat locked)
  | 'complete'           // Done
  | 'error';             // Planning failed

export interface PlanningStatusEvent {
  phase: PlanningPhase;
  message: string;    // Human-readable status
  project?: string;   // If analyzing specific project
  errorDetails?: string;  // Full error for error phase
}

// Plan approval event (sent to frontend when agent submits plan for approval)
export interface PlanApprovalEvent {
  approvalId: string;
  plan: Plan;
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
  | UserChatEvent
  | E2ECompleteEvent
  | E2EPromptRequestEvent
  | FailureAnalysisEvent;

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
  type?: 'implementation' | 'e2e_fix';  // Task type
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
  // Full project config (minus path, which is user-provided)
  config: Omit<ProjectConfig, 'path'>;
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
// Planning Phase Types (for 2-phase planning with interactive Q&A)
// ═══════════════════════════════════════════════════════════════

/** Project exploration data gathered during Phase 1 */
export interface ProjectExploration {
  guidelines?: string;           // CLAUDE.md / .claude/development.md content summary
  technology: {
    framework?: string;
    language?: string;
    packageManager?: string;
  };
  patterns: {
    apiStyle?: string;           // REST, GraphQL, etc.
    stateManagement?: string;
    componentStructure?: string;
  };
  keyFiles: string[];            // Important entry points and modules
  relatedFeatures: string[];     // Similar existing implementations found
}

/** Combined output from Phase 1: Exploration + Analysis */
export interface ExplorationAnalysisResult {
  // Exploration data
  projects: Record<string, ProjectExploration>;

  // Analysis data
  featureRequirements: string;
  apiContracts: Array<{
    endpoint: string;
    method: string;
    requestBody?: string;
    responseBody?: string;
    providedBy: string;
    consumedBy: string[];
  }>;
  executionOrder: Array<{
    project: string;
    reason: string;
    dependsOn: string[];
  }>;
  recommendations: Record<string, string>;
  considerations: string[];

  // Q&A history (for context)
  questionsAsked: Array<{
    question: string;
    answer: string;
  }>;

  timestamp: number;
}

/** Question type for planning Q&A */
export type PlanningQuestionType = 'text' | 'select_one' | 'select_many';

/** Single question item for planning Q&A */
export interface PlanningQuestionItem {
  question: string;
  context?: string;
  type?: PlanningQuestionType;  // Default: 'text'
  options?: string[];           // For select_one/select_many - predefined options (custom always available)
}

/** Planning questions from MCP server - supports multiple questions shown one at a time */
export interface PlanningQuestion {
  questionId: string;
  questions: PlanningQuestionItem[];  // Array of questions to ask
  currentIndex: number;               // Which question is currently being shown (0-based)
}

// Session persistence types
export interface PersistedSession {
  id: string;
  feature: string;
  projects: string[];
  startedAt: number;
  explorationResult?: ExplorationAnalysisResult;  // Result from Phase 1 exploration/analysis
  plan?: Plan;
  statuses: Record<string, ProjectState>;
  testStates: Record<string, PersistedTestState>;
  taskStates?: TaskState[];  // Task execution states
  flows?: RequestFlow[];  // Request flows for chat timeline (task executions, E2E tests, etc.)
  gitBranches?: Record<string, string>;  // project -> branchName mapping for git-enabled projects
  workspaceId?: string;  // Workspace that started this session
  status: 'planning' | 'running' | 'completed' | 'interrupted';
  updatedAt: number;
  completedAt?: number;
  planningState?: PlanningSessionState;  // Multi-stage planning workflow state
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
  workspaceId?: string;  // For filtering sessions by workspace
}

// Completion reason for session history display
export type SessionCompletionReason =
  | 'all_completed'   // All tasks and tests passed
  | 'task_errors'     // Ended with failed tasks
  | 'test_errors'     // Ended with failed E2E tests
  | 'interrupted';    // User stopped or crashed

// Extended summary for session history list
export interface SessionHistoryEntry extends SessionSummary {
  completionReason?: SessionCompletionReason;
  taskSummary?: {
    total: number;
    completed: number;
    failed: number;
  };
  testSummary?: {
    total: number;
    passed: number;
    failed: number;
  };
}

export interface FullSessionData {
  session: PersistedSession;
  logs: LogEntry[];
  chatMessages: StreamingMessage[];
  flows: RequestFlow[];  // Request flows for chat timeline
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
  toolName: string;
  toolInput: Record<string, unknown>;
}

// Permission response from frontend
export interface PermissionPromptResponse {
  project: string;
  approved: boolean;
  toolName: string;
  allowAll?: boolean;
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
  gh: DependencyStatus;  // GitHub CLI (optional - for PR creation)
}

// Chat message (legacy - simple text)
export interface ChatMessage {
  from: 'user' | 'planning' | 'system';
  message: string;
  timestamp: number;
}

// Session status type
export type SessionStatus = 'planning' | 'running' | 'completed' | 'interrupted';

// ═══════════════════════════════════════════════════════════════
// Dev Server Management Types (standalone dev server controls)
// ═══════════════════════════════════════════════════════════════

/** State of a single dev server */
export interface DevServerState {
  project: string;
  status: 'stopped' | 'starting' | 'running' | 'error' | 'stopping';
  port: number | null;
  url: string | null;
  startedAt: number | null;
  error?: string;
}

/** Port conflict information */
export interface PortConflict {
  project: string;
  port: number;
  url: string;
  inUse: boolean;
  processName?: string;
  processPid?: number;
}

/** Log entry for dev server logs modal */
export interface DevServerLogEntry {
  project: string;
  stream: 'stdout' | 'stderr';
  text: string;
  timestamp: number;
}

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

// ═══════════════════════════════════════════════════════════════
// Persistent Agent Types (for task_complete MCP tool)
// ═══════════════════════════════════════════════════════════════

/** Request sent when agent calls task_complete MCP tool */
export interface TaskCompleteRequest {
  project: string;
  taskIndex: number;
  summary: string;
}

/** Response returned to agent after task verification */
export interface TaskCompleteResponse {
  status: 'next_task' | 'fix_required' | 'all_complete' | 'escalate';
  nextTask?: {
    index: number;
    name: string;
    description: string;
    project: string;
  };
  fixPrompt?: string;
  verificationError?: string;
  attemptNumber?: number;
  maxAttempts?: number;
  escalationReason?: string;
}

// ═══════════════════════════════════════════════════════════════
// Multi-Stage Planning Types (3-stage workflow)
// ═══════════════════════════════════════════════════════════════

/** Planning stages in order */
export type PlanningStage =
  | 'feature_refinement'      // Stage 1: Socratic Q&A to understand requirements
  | 'exploration_planning'    // Stage 2: Explore codebase + define technical approach
  | 'task_generation';        // Stage 3: Create implementation tasks & E2E tests

/** Stage display names for UI */
export const PLANNING_STAGE_NAMES: Record<PlanningStage, string> = {
  feature_refinement: 'Feature Refinement',
  exploration_planning: 'Exploration & Planning',
  task_generation: 'Task Generation',
};

/** Stage progress tracking */
export interface StageProgress {
  stage: PlanningStage;
  status: 'pending' | 'active' | 'awaiting_approval' | 'completed';
  startedAt?: number;
  completedAt?: number;
}

/** API contract structure for Stage 2 (Exploration & Planning) */
export interface ApiContract {
  endpoint: string;
  method: string;
  request?: Record<string, string>;
  response?: Record<string, string>;
  providedBy: string;
  consumedBy: string[];
}

/** Technical spec from Stage 2 (Exploration & Planning) */
export interface TechnicalSpec {
  apiContracts: ApiContract[];
  architectureDecisions: string[];
  executionOrder: Array<{ project: string; dependsOn: string[] }>;
}

/** Full planning session state */
export interface PlanningSessionState {
  currentStage: PlanningStage;
  stages: StageProgress[];
  refinedFeature?: {
    description: string;
    requirements: string[];
  };
  technicalSpec?: TechnicalSpec;
}

/** Stage approval request sent to frontend */
export interface StageApprovalRequest {
  stageId: string;
  stage: PlanningStage;
  data: RefinedFeatureData | TechnicalSpecData;
}

/** Data for Stage 1 approval */
export interface RefinedFeatureData {
  type: 'refined_feature';
  refinedDescription: string;
  keyRequirements: string[];
}

/** Data for Stage 2 approval (Exploration & Planning) */
export interface TechnicalSpecData {
  type: 'technical_spec';
  apiContracts: ApiContract[];
  architectureDecisions: string[];
  executionOrder: Array<{ project: string; dependsOn: string[] }>;
}

/** Socket events for planning session state updates */
export interface PlanningSessionStateEvent {
  sessionState: PlanningSessionState;
}

/** Socket event for stage approval response */
export interface StageApprovalResponse {
  stageId: string;
  approved: boolean;
  feedback?: string;
}
