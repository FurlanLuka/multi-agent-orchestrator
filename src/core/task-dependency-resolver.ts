import { EventEmitter } from 'events';
import { TaskDefinition } from '../types';
import { detectCycles, CycleDetectionResult } from '../utils/dependency-graph';

export interface PendingTask {
  task: TaskDefinition;
  taskIndex: number;
  waitingOn: number[];  // Task indices this task is waiting on
}

export interface TaskDependencyStats {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  inProgress: number;
}

/**
 * TaskDependencyResolver manages task dependencies and determines which tasks
 * are ready to execute based on completed/failed dependencies.
 */
export class TaskDependencyResolver extends EventEmitter {
  private tasks: TaskDefinition[] = [];
  private pendingTasks: Map<number, PendingTask> = new Map();
  private completedTasks: Set<number> = new Set();
  private failedTasks: Set<number> = new Set();
  private inProgressTasks: Set<number> = new Set();

  /**
   * Initializes the resolver with a list of tasks.
   * Returns cycle detection result - if hasCycle is true, execution should not proceed.
   */
  initialize(tasks: TaskDefinition[]): CycleDetectionResult {
    this.tasks = tasks;
    this.pendingTasks.clear();
    this.completedTasks.clear();
    this.failedTasks.clear();
    this.inProgressTasks.clear();

    // Check for circular dependencies
    const cycleResult = detectCycles(tasks);
    if (cycleResult.hasCycle) {
      return cycleResult;
    }

    // Initialize all tasks as pending with their dependencies
    tasks.forEach((task, index) => {
      // Filter to valid dependencies that haven't completed yet
      const validDeps = task.dependencies.filter(depIndex =>
        depIndex >= 0 && depIndex < tasks.length && !this.completedTasks.has(depIndex)
      );

      this.pendingTasks.set(index, {
        task,
        taskIndex: index,
        waitingOn: validDeps
      });
    });

    return { hasCycle: false };
  }

  /**
   * Gets all tasks that are ready to execute (no pending dependencies).
   * Returns one task per project to avoid parallel execution on same project.
   */
  getReadyTasks(): Array<{ task: TaskDefinition; taskIndex: number }> {
    const readyTasks: Array<{ task: TaskDefinition; taskIndex: number }> = [];
    const projectsSeen: Set<string> = new Set();

    for (const [taskIndex, pending] of this.pendingTasks) {
      // Skip if already in progress
      if (this.inProgressTasks.has(taskIndex)) continue;

      // Check if all dependencies are satisfied
      const remainingDeps = pending.waitingOn.filter(
        depIdx => !this.completedTasks.has(depIdx)
      );

      if (remainingDeps.length === 0) {
        // Only one task per project
        if (!projectsSeen.has(pending.task.project)) {
          readyTasks.push({ task: pending.task, taskIndex });
          projectsSeen.add(pending.task.project);
        }
      }
    }

    return readyTasks;
  }

  /**
   * Gets all tasks that have no dependencies (can start immediately).
   */
  getInitialReadyTasks(): Array<{ task: TaskDefinition; taskIndex: number }> {
    return this.getReadyTasks();
  }

  /**
   * Marks a task as started (in progress).
   */
  markStarted(taskIndex: number): void {
    this.inProgressTasks.add(taskIndex);
  }

  /**
   * Marks a task as completed and returns newly unblocked tasks.
   */
  markCompleted(taskIndex: number): Array<{ task: TaskDefinition; taskIndex: number }> {
    this.completedTasks.add(taskIndex);
    this.inProgressTasks.delete(taskIndex);
    this.pendingTasks.delete(taskIndex);

    this.emit('taskCompleted', { taskIndex });

    // Find tasks that were waiting on this one
    const unblockedTasks: Array<{ task: TaskDefinition; taskIndex: number }> = [];
    const projectsSeen: Set<string> = new Set();

    for (const [idx, pending] of this.pendingTasks) {
      if (pending.waitingOn.includes(taskIndex)) {
        // Remove completed task from waiting list
        pending.waitingOn = pending.waitingOn.filter(i => i !== taskIndex);

        // Check if now ready
        const remainingDeps = pending.waitingOn.filter(
          depIdx => !this.completedTasks.has(depIdx) && !this.failedTasks.has(depIdx)
        );

        if (remainingDeps.length === 0 && !this.inProgressTasks.has(idx)) {
          if (!projectsSeen.has(pending.task.project)) {
            unblockedTasks.push({ task: pending.task, taskIndex: idx });
            projectsSeen.add(pending.task.project);
          }
        } else {
          // Update remaining deps
          pending.waitingOn = remainingDeps;
        }
      }
    }

    return unblockedTasks;
  }

  /**
   * Marks a task as failed.
   */
  markFailed(taskIndex: number): void {
    this.failedTasks.add(taskIndex);
    this.inProgressTasks.delete(taskIndex);
    this.pendingTasks.delete(taskIndex);

    this.emit('taskFailed', { taskIndex });
  }

  /**
   * Defers a task (puts it back into pending without running it).
   * Used when a task can't run yet due to project-level constraints.
   */
  defer(taskIndex: number, task: TaskDefinition): void {
    this.inProgressTasks.delete(taskIndex);

    if (!this.pendingTasks.has(taskIndex)) {
      this.pendingTasks.set(taskIndex, {
        task,
        taskIndex,
        waitingOn: []  // No dependency waiting, just project-level deferral
      });
    }
  }

  /**
   * Gets statistics about task execution.
   */
  getStats(): TaskDependencyStats {
    return {
      total: this.tasks.length,
      completed: this.completedTasks.size,
      failed: this.failedTasks.size,
      pending: this.pendingTasks.size,
      inProgress: this.inProgressTasks.size
    };
  }

  /**
   * Checks if all remaining tasks are blocked by failed tasks.
   * Returns true if execution is stuck and cannot proceed.
   */
  isStuck(): boolean {
    if (this.pendingTasks.size === 0) return false;
    if (this.inProgressTasks.size > 0) return false;
    if (this.failedTasks.size === 0) return false;

    // Check if all pending tasks are blocked by failed tasks
    for (const [_idx, pending] of this.pendingTasks) {
      // Check if any dependency could still complete
      const hasNonFailedDep = pending.waitingOn.some(depIdx =>
        !this.failedTasks.has(depIdx) && !this.completedTasks.has(depIdx)
      );

      if (hasNonFailedDep) {
        return false;  // Still possible for this task to proceed
      }

      // If all deps are complete, this task should be ready
      const allDepsComplete = pending.waitingOn.every(depIdx =>
        this.completedTasks.has(depIdx)
      );

      if (allDepsComplete) {
        return false;  // This task can still run
      }
    }

    return true;  // All pending tasks are blocked by failures
  }

  /**
   * Gets details about the stuck state for error reporting.
   */
  getStuckDetails(): {
    failedTasks: Array<{ index: number; name: string }>;
    blockedTasks: Array<{ index: number; name: string; blockedBy: number[] }>;
  } {
    const failed = Array.from(this.failedTasks).map(idx => ({
      index: idx,
      name: this.tasks[idx]?.name || `Task ${idx}`
    }));

    const blocked = Array.from(this.pendingTasks.entries()).map(([idx, pending]) => ({
      index: idx,
      name: pending.task.name,
      blockedBy: pending.waitingOn.filter(depIdx => this.failedTasks.has(depIdx))
    }));

    return { failedTasks: failed, blockedTasks: blocked };
  }

  /**
   * Gets completed task indices.
   */
  getCompletedTasks(): Set<number> {
    return new Set(this.completedTasks);
  }

  /**
   * Gets failed task indices.
   */
  getFailedTasks(): Set<number> {
    return new Set(this.failedTasks);
  }

  /**
   * Gets pending tasks map.
   */
  getPendingTasks(): Map<number, PendingTask> {
    return new Map(this.pendingTasks);
  }

  /**
   * Clears all state.
   */
  clear(): void {
    this.tasks = [];
    this.pendingTasks.clear();
    this.completedTasks.clear();
    this.failedTasks.clear();
    this.inProgressTasks.clear();
  }
}
