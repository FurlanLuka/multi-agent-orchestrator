// Agent status states
export type AgentStatus =
  | 'IDLE'
  | 'WORKING'
  | 'DEBUGGING'
  | 'FATAL_DEBUGGING'
  | 'FATAL_RECOVERY'
  | 'READY'
  | 'E2E'
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

// Chat message
export interface ChatMessage {
  from: 'user' | 'planning' | 'system';
  message: string;
  timestamp: number;
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
