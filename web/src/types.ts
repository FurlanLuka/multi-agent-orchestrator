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
  | 'BLOCKED';

// Session
export interface Session {
  id: string;
  startedAt: number;
  feature: string;
  projects: string[];
  plan?: Plan;
}

// Plan
export interface TaskDefinition {
  project: string;
  name: string;        // Short task name for display (e.g., "Add login form")
  task: string;        // Full task description (markdown supported)
}

export interface Plan {
  feature: string;
  description: string;
  overview?: string;           // High-level summary of the implementation approach
  architecture?: string;       // ASCII diagram showing component relationships
  tasks: TaskDefinition[];
  testPlan: Record<string, string[]>;
}

// Planning status phases for UX feedback
export type PlanningPhase =
  | 'exploring'      // "Exploring codebase..."
  | 'analyzing'      // "Analyzing requirements..."
  | 'generating'     // "Generating plan..."
  | 'complete';      // Done

export interface PlanningStatusEvent {
  phase: PlanningPhase;
  message: string;    // Human-readable status
  project?: string;   // If analyzing specific project
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

// Project state
export interface ProjectState {
  status: AgentStatus;
  message: string;
  updatedAt: number;
}

// Log entry
export interface LogEntry {
  project: string;
  type: 'devServer' | 'agent';
  stream: 'stdout' | 'stderr';
  text: string;
  timestamp: number;
}

// Chat message (legacy - simple text)
export interface ChatMessage {
  from: 'user' | 'planning' | 'system';
  message: string;
  timestamp: number;
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

// Streaming message for assistant-ui
export interface StreamingMessage {
  id: string;
  role: 'user' | 'assistant';
  content: ContentBlock[];
  status: 'pending' | 'streaming' | 'complete' | 'error' | 'queued';
  createdAt: number;
}

// Chat stream event from server
export interface ChatStreamEvent {
  type: 'message_start' | 'content_block' | 'message_complete' | 'error';
  messageId: string;
  block?: ContentBlock;
  content?: ContentBlock[];  // All content blocks (for message_complete)
  error?: string;
}

// Approval request
export interface ApprovalRequest {
  id: string;
  project: string;
  prompt: string;
  approval_type: string;
  timestamp: number;
}

// Plan proposal
export interface PlanProposal {
  plan: Plan;
  summary: string;
}

// App phase
export type AppPhase = 'planning' | 'execution' | 'complete';

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
  defaultPort: number;
  dependencyInstall?: boolean;  // Whether to install dependencies when creating from template
}

// Project config (from projects.config.json)
export interface ProjectConfig {
  path: string;
  devServer: {
    command: string;
    readyPattern: string;
    env: Record<string, string>;
    port?: number;
    url?: string;  // Full dev server URL (e.g., "http://localhost:3000"). If set, takes precedence over port
  };
  buildCommand?: string;
  hasE2E: boolean;
  e2eInstructions?: string;  // Custom E2E testing instructions (markdown)
}

// Queue status for Planning Agent visibility
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

// Task status tracking for dependency-aware execution
export type TaskStatus =
  | 'pending'      // Not started yet
  | 'waiting'      // Waiting on dependency tasks
  | 'working'      // Agent is implementing
  | 'verifying'    // Running deps install, build, restart, health check
  | 'fixing'       // Agent fixing verification errors
  | 'completed'    // Implementation done (no E2E or E2E passed)
  | 'e2e'          // Running E2E tests after implementation
  | 'e2e_failed'   // E2E tests failed (may retry or redistribute)
  | 'failed';      // Implementation failed

export interface TaskState {
  taskIndex: number;     // Index in the tasks array
  project: string;
  name: string;          // Short task name for display
  description: string;   // Full task description (markdown)
  status: TaskStatus;
  message?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface TaskStatusEvent {
  taskIndex: number;
  project: string;
  status: TaskStatus;
  message?: string;
  timestamp: number;
}

// Test status tracking for E2E tests
export type TestScenarioStatus = 'pending' | 'running' | 'passed' | 'failed';

export interface TestScenarioState {
  name: string;
  status: TestScenarioStatus;
  error?: string;
}

export interface ProjectTestState {
  scenarios: TestScenarioState[];
  updatedAt: number;
}

export interface TestStatusEvent {
  project: string;
  scenario: string;
  status: TestScenarioStatus;
  error?: string;
  timestamp: number;
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

// Session persistence types
export type SessionStatus = 'planning' | 'running' | 'completed' | 'interrupted';

export interface SessionSummary {
  id: string;
  feature: string;
  projects: string[];
  startedAt: number;
  updatedAt: number;
  status: SessionStatus;
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
  status: SessionStatus;
  updatedAt: number;
  completedAt?: number;
}

export interface FullSessionData {
  session: PersistedSession;
  logs: LogEntry[];
  chatMessages: StreamingMessage[];
  pendingPlan?: PlanProposal;
}
