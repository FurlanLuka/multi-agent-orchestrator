// Agent status states
export type AgentStatus =
  | 'PENDING'       // Initialized but execution not started
  | 'IDLE'          // Execution complete, no active work
  | 'WORKING'
  | 'DEBUGGING'
  | 'FATAL_DEBUGGING'
  | 'FATAL_RECOVERY'
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
  task: string;
  dependencies: string[];
}

export interface Plan {
  feature: string;
  description: string;
  tasks: TaskDefinition[];
  testPlan: Record<string, string[]>;
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
  defaultPort: number;
}

// Project config (from projects.config.json)
export interface ProjectConfig {
  path: string;
  devServer: {
    command: string;
    readyPattern: string;
    env: Record<string, string>;
  };
  hasE2E: boolean;
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
