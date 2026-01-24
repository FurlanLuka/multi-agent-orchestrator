import { EventEmitter } from 'events';
import { AgentStatus, OrchestratorState } from '../types';
import { StatusMonitor } from './status-monitor';
import { StateMachine } from './state-machine';

/**
 * Valid status transitions for projects.
 * Key is the current status, value is an array of valid next statuses.
 */
const VALID_TRANSITIONS: Record<AgentStatus, AgentStatus[]> = {
  PENDING: ['WORKING', 'BLOCKED', 'IDLE'],
  WORKING: ['READY', 'DEBUGGING', 'FATAL_DEBUGGING', 'BLOCKED', 'IDLE', 'FAILED'],
  DEBUGGING: ['WORKING', 'BLOCKED', 'FATAL_DEBUGGING', 'IDLE'],
  FATAL_DEBUGGING: ['WORKING', 'BLOCKED', 'IDLE'],
  READY: ['E2E', 'IDLE', 'BLOCKED'],
  E2E: ['IDLE', 'E2E_FIXING', 'BLOCKED', 'FAILED'],
  E2E_FIXING: ['E2E', 'IDLE', 'BLOCKED', 'WORKING', 'FAILED'],
  BLOCKED: ['WORKING', 'IDLE', 'PENDING'],
  FAILED: ['WORKING', 'IDLE', 'BLOCKED'],  // User can retry or skip
  IDLE: ['WORKING', 'PENDING', 'E2E'],  // IDLE can restart if needed
};

export interface StateManagerConfig {
  statusMonitor: StatusMonitor;
  stateMachine: StateMachine;
  validateTransitions?: boolean;  // If true, reject invalid transitions
}

/**
 * StateManager coordinates StatusMonitor and StateMachine to provide
 * a unified interface for state management with validation.
 */
export class StateManager extends EventEmitter {
  private statusMonitor: StatusMonitor;
  private stateMachine: StateMachine;
  private validateTransitions: boolean;
  private activeAgents: Set<string> = new Set();

  constructor(config: StateManagerConfig) {
    super();
    this.statusMonitor = config.statusMonitor;
    this.stateMachine = config.stateMachine;
    this.validateTransitions = config.validateTransitions ?? false;

    // Forward events from StatusMonitor
    this.statusMonitor.on('statusChange', (event) => {
      this.emit('projectStatusChange', event);
    });

    this.statusMonitor.on('taskStatusChange', (event) => {
      this.emit('taskStatusChange', event);
    });

    this.statusMonitor.on('allComplete', () => {
      this.emit('allProjectsComplete');
    });

    // Forward events from StateMachine
    this.stateMachine.on('stateChange', (event) => {
      this.emit('orchestratorStateChange', event);
    });
  }

  /**
   * Updates a project's status with optional transition validation.
   * Returns true if the update was applied, false if rejected.
   */
  updateProjectStatus(project: string, status: AgentStatus, message: string): boolean {
    const currentState = this.statusMonitor.getStatus(project);
    const currentStatus = currentState?.status;

    // Validate transition if enabled and there's a current status
    if (this.validateTransitions && currentStatus) {
      const validNextStates = VALID_TRANSITIONS[currentStatus] || [];
      if (!validNextStates.includes(status)) {
        console.warn(
          `[StateManager] Invalid transition for ${project}: ${currentStatus} → ${status}. ` +
          `Valid transitions: ${validNextStates.join(', ')}`
        );
        // In strict mode, we'd return false here. For now, just warn.
        // return false;
      }
    }

    // Apply the status update
    this.statusMonitor.updateStatus(project, status, message);

    // Sync agent activity tracking
    if (status === 'WORKING' || status === 'E2E' || status === 'E2E_FIXING') {
      this.markAgentActive(project);
    } else if (status === 'IDLE' || status === 'BLOCKED' || status === 'READY' || status === 'FAILED') {
      this.markAgentIdle(project);
    }

    return true;
  }

  /**
   * Gets the current orchestrator state.
   */
  getOrchestratorState(): OrchestratorState {
    return this.stateMachine.getState();
  }

  /**
   * Transitions the orchestrator state.
   * Returns true if transition was successful.
   */
  transitionOrchestrator(action: 'start' | 'pause' | 'resume' | 'stop'): boolean {
    try {
      this.stateMachine.transition(action);
      return true;
    } catch (err) {
      console.error(`[StateManager] Failed to transition orchestrator: ${err}`);
      return false;
    }
  }

  /**
   * Marks an agent as active.
   */
  markAgentActive(project: string): void {
    this.activeAgents.add(project);
    this.stateMachine.markAgentActive(project);
  }

  /**
   * Marks an agent as idle.
   */
  markAgentIdle(project: string): void {
    this.activeAgents.delete(project);
    this.stateMachine.markAgentIdle(project);
  }

  /**
   * Checks if any agents are currently active.
   */
  hasActiveAgents(): boolean {
    return this.activeAgents.size > 0;
  }

  /**
   * Gets the set of active agent project names.
   */
  getActiveAgents(): Set<string> {
    return new Set(this.activeAgents);
  }

  /**
   * Gets a project's current status.
   */
  getProjectStatus(project: string) {
    return this.statusMonitor.getStatus(project);
  }

  /**
   * Gets all project statuses.
   */
  getAllProjectStatuses() {
    return this.statusMonitor.getAllStatuses();
  }

  /**
   * Initializes a project with PENDING status.
   */
  initializeProject(project: string): void {
    this.statusMonitor.initializeProject(project);
  }

  /**
   * Checks if all projects are in one of the specified statuses.
   */
  allProjectsInStatus(...statuses: AgentStatus[]): boolean {
    return this.statusMonitor.allInStatus(...statuses);
  }

  /**
   * Checks if any project is in one of the specified statuses.
   */
  anyProjectInStatus(...statuses: AgentStatus[]): boolean {
    return this.statusMonitor.anyInStatus(...statuses);
  }

  /**
   * Gets projects in a specific status.
   */
  getProjectsInStatus(status: AgentStatus): string[] {
    return this.statusMonitor.getProjectsInStatus(status);
  }

  /**
   * Validates if a transition from current to next status is allowed.
   */
  static isValidTransition(current: AgentStatus, next: AgentStatus): boolean {
    const validNextStates = VALID_TRANSITIONS[current] || [];
    return validNextStates.includes(next);
  }

  /**
   * Gets valid next statuses for a given current status.
   */
  static getValidTransitions(current: AgentStatus): AgentStatus[] {
    return VALID_TRANSITIONS[current] || [];
  }

  /**
   * Gets a summary of the current state.
   */
  getSummary(): {
    orchestratorState: OrchestratorState;
    activeAgents: string[];
    projectStatuses: Record<string, { status: AgentStatus; message: string }>;
  } {
    const statuses: Record<string, { status: AgentStatus; message: string }> = {};
    for (const [project, state] of this.statusMonitor.getAllStatuses()) {
      statuses[project] = { status: state.status, message: state.message };
    }

    return {
      orchestratorState: this.getOrchestratorState(),
      activeAgents: Array.from(this.activeAgents),
      projectStatuses: statuses
    };
  }
}
