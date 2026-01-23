import { EventEmitter } from 'events';
import { AgentStatus, ProjectState } from '../types';

export class StatusMonitor extends EventEmitter {
  private states: Map<string, ProjectState> = new Map();

  /**
   * Updates the status for a project
   */
  updateStatus(project: string, status: AgentStatus, message: string): void {
    const prev = this.states.get(project);
    const state: ProjectState = {
      status,
      message,
      updatedAt: Date.now(),
      devServerPid: prev?.devServerPid,
      agentPid: prev?.agentPid
    };

    this.states.set(project, state);

    console.log(`[StatusMonitor] ${project}: ${prev?.status || 'NONE'} → ${status} (${message})`);

    this.emit('statusChange', {
      project,
      status,
      message,
      previous: prev?.status
    });

    // Trigger special actions based on status
    switch (status) {
      case 'READY':
        this.emit('projectReady', { project, message });
        break;

      case 'FATAL_RECOVERY':
        this.emit('fatalRecovery', { project });
        break;

      case 'DEBUGGING':
        this.emit('debugging', { project, message });
        break;

      case 'FATAL_DEBUGGING':
        this.emit('fatalDebugging', { project, message });
        break;

      case 'IDLE':
        // Check if all projects are now IDLE (feature complete)
        if (this.allInStatus('IDLE')) {
          this.emit('allComplete');
        }
        break;
    }

    // Check if all projects are ready for E2E
    if (this.allInStatus('READY', 'E2E', 'IDLE')) {
      this.emit('allReady');
    }
  }

  /**
   * Gets the current status for a project
   */
  getStatus(project: string): ProjectState | undefined {
    return this.states.get(project);
  }

  /**
   * Gets all project statuses
   */
  getAllStatuses(): Map<string, ProjectState> {
    return new Map(this.states);
  }

  /**
   * Gets statuses as a plain object (for serialization)
   */
  getStatusesObject(): Record<string, ProjectState> {
    const result: Record<string, ProjectState> = {};
    for (const [project, state] of this.states) {
      result[project] = state;
    }
    return result;
  }

  /**
   * Checks if all projects are in one of the given statuses
   */
  allInStatus(...statuses: AgentStatus[]): boolean {
    if (this.states.size === 0) return false;

    for (const [_, state] of this.states) {
      if (!statuses.includes(state.status)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Checks if any project is in one of the given statuses
   */
  anyInStatus(...statuses: AgentStatus[]): boolean {
    for (const [_, state] of this.states) {
      if (statuses.includes(state.status)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gets projects in a specific status
   */
  getProjectsInStatus(status: AgentStatus): string[] {
    const result: string[] = [];
    for (const [project, state] of this.states) {
      if (state.status === status) {
        result.push(project);
      }
    }
    return result;
  }

  /**
   * Initializes a project with PENDING status (before execution starts)
   */
  initializeProject(project: string): void {
    this.states.set(project, {
      status: 'PENDING',
      message: 'Waiting for execution',
      updatedAt: Date.now()
    });
    console.log(`[StatusMonitor] Initialized ${project} as PENDING`);
  }

  /**
   * Sets the dev server PID for a project
   */
  setDevServerPid(project: string, pid: number): void {
    const state = this.states.get(project);
    if (state) {
      state.devServerPid = pid;
    }
  }

  /**
   * Sets the agent PID for a project
   */
  setAgentPid(project: string, pid: number): void {
    const state = this.states.get(project);
    if (state) {
      state.agentPid = pid;
    }
  }

  /**
   * Clears all statuses
   */
  clear(): void {
    this.states.clear();
  }

  /**
   * Removes a project from monitoring
   */
  removeProject(project: string): void {
    this.states.delete(project);
  }

  /**
   * Gets a summary of all statuses
   */
  getSummary(): string {
    const lines: string[] = [];
    for (const [project, state] of this.states) {
      const age = Math.round((Date.now() - state.updatedAt) / 1000);
      lines.push(`  ${project}: ${state.status} (${age}s ago) - ${state.message}`);
    }
    return lines.length > 0 ? lines.join('\n') : '  No projects being monitored';
  }
}
