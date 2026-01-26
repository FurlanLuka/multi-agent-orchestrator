import { EventEmitter } from 'events';
import { AgentStatus, ProjectState, TaskState, TaskStatus, TaskDefinition } from '@aio/types';
import { SessionStore } from './session-store';

export class StatusMonitor extends EventEmitter {
  private states: Map<string, ProjectState> = new Map();
  private taskStates: Map<number, TaskState> = new Map();  // Keyed by task index
  private sessionStore: SessionStore | null = null;
  private currentSessionId: string | null = null;

  /**
   * Sets the SessionStore for persistence
   */
  setSessionStore(store: SessionStore): void {
    this.sessionStore = store;
  }

  /**
   * Sets the current session ID for persistence
   */
  setCurrentSessionId(sessionId: string | null): void {
    this.currentSessionId = sessionId;
  }

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

    // Persist to SessionStore
    if (this.sessionStore && this.currentSessionId) {
      this.sessionStore.updateStatus(this.currentSessionId, project, status, message);
    }

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
        this.emit('projectReady', { project, message, previous: prev?.status });
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

    // Persist to SessionStore
    if (this.sessionStore && this.currentSessionId) {
      this.sessionStore.updateStatus(this.currentSessionId, project, 'PENDING', 'Waiting for execution');
    }

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

  // ==================== Task State Tracking ====================

  /**
   * Initializes task states from plan tasks
   */
  initializeTasks(tasks: TaskDefinition[]): void {
    this.taskStates.clear();
    tasks.forEach((task, index) => {
      this.taskStates.set(index, {
        taskIndex: index,
        project: task.project,
        name: task.name || `Task ${index + 1}`,  // Fallback for legacy plans without name
        description: task.task,
        status: 'pending',
        type: task.type,              // Include task type (implementation or user_action)
        userAction: task.userAction   // Include userAction definition if present
      });
    });
    console.log(`[StatusMonitor] Initialized ${tasks.length} tasks`);

    // Persist initial task states
    if (this.sessionStore && this.currentSessionId) {
      this.sessionStore.updateTaskStates(this.currentSessionId, this.getAllTaskStates());
    }
  }

  /**
   * Initialize a single task's state (for dynamically added tasks like E2E fixes)
   */
  initializeTask(taskIndex: number, task: TaskDefinition): void {
    const taskState: TaskState = {
      taskIndex,
      project: task.project,
      name: task.name || `Task ${taskIndex + 1}`,
      description: task.task,
      status: 'pending',
      type: task.type,
      userAction: task.userAction,
    };

    this.taskStates.set(taskIndex, taskState);
    console.log(`[StatusMonitor] Initialized dynamic task #${taskIndex}: ${task.name} (${task.project})`);

    // Persist task states
    if (this.sessionStore && this.currentSessionId) {
      this.sessionStore.updateTaskStates(this.currentSessionId, this.getAllTaskStates());
    }

    this.emit('taskStatusChange', {
      taskIndex,
      project: task.project,
      status: 'pending',
      message: 'Task created',
      timestamp: Date.now(),
    });
  }

  /**
   * Updates the status of a task
   */
  updateTaskStatus(taskIndex: number, status: TaskStatus, message?: string): void {
    const task = this.taskStates.get(taskIndex);
    if (task) {
      const prevStatus = task.status;
      task.status = status;
      task.message = message;
      if (status === 'working' && !task.startedAt) task.startedAt = Date.now();
      if (status === 'completed' || status === 'failed') {
        task.completedAt = Date.now();
      }

      console.log(`[StatusMonitor] Task #${taskIndex} (${task.project}): ${prevStatus} → ${status}${message ? ` (${message})` : ''}`);

      // Persist task states to session store
      if (this.sessionStore && this.currentSessionId) {
        this.sessionStore.updateTaskStates(this.currentSessionId, this.getAllTaskStates());
      }

      this.emit('taskStatusChange', {
        taskIndex,
        project: task.project,
        status,
        message,
        timestamp: Date.now()
      });

      // Emit task completion event
      if (status === 'completed') {
        this.emit('taskComplete', { taskIndex, project: task.project });
      }
    }
  }

  /**
   * Gets a task state by index
   */
  getTaskState(taskIndex: number): TaskState | undefined {
    return this.taskStates.get(taskIndex);
  }

  /**
   * Gets all task states as an array
   */
  getAllTaskStates(): TaskState[] {
    return Array.from(this.taskStates.values());
  }

  /**
   * Gets tasks for a specific project
   */
  getTasksForProject(project: string): TaskState[] {
    return Array.from(this.taskStates.values()).filter(t => t.project === project);
  }

  /**
   * Clears all statuses
   */
  clear(): void {
    this.states.clear();
    this.taskStates.clear();
    this.currentSessionId = null;
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

  /**
   * Restores statuses from a persisted session
   */
  restoreStatuses(statuses: Record<string, ProjectState>): void {
    this.states.clear();
    for (const [project, state] of Object.entries(statuses)) {
      this.states.set(project, state);
    }
    console.log(`[StatusMonitor] Restored statuses for ${Object.keys(statuses).length} projects`);
  }
}
