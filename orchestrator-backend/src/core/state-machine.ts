import { EventEmitter } from 'events';
import { OrchestratorState } from '@aio/types';

/**
 * Manages orchestrator state transitions
 * States: IDLE -> RUNNING -> PAUSING -> PAUSED -> RUNNING -> ...
 */
export class StateMachine extends EventEmitter {
  private state: OrchestratorState = 'IDLE';
  private activeAgents: Set<string> = new Set();

  constructor() {
    super();
  }

  /**
   * Gets current state
   */
  getState(): OrchestratorState {
    return this.state;
  }

  /**
   * Transitions to a new state
   */
  transition(action: 'start' | 'pause' | 'resume' | 'stop'): boolean {
    const previousState = this.state;

    switch (action) {
      case 'start':
        if (this.state === 'IDLE' || this.state === 'PAUSED') {
          this.state = 'RUNNING';
          this.emit('stateChange', { previous: previousState, current: this.state });
          return true;
        }
        break;

      case 'pause':
        if (this.state === 'RUNNING') {
          this.state = 'PAUSING';
          this.emit('stateChange', { previous: previousState, current: this.state });

          // Check if we can immediately transition to PAUSED
          this.checkPausedTransition();
          return true;
        }
        break;

      case 'resume':
        if (this.state === 'PAUSED') {
          this.state = 'RUNNING';
          this.emit('stateChange', { previous: previousState, current: this.state });
          this.emit('resumed');
          return true;
        }
        break;

      case 'stop':
        if (this.state !== 'IDLE') {
          this.state = 'IDLE';
          this.activeAgents.clear();
          this.emit('stateChange', { previous: previousState, current: this.state });
          return true;
        }
        break;
    }

    return false;
  }

  /**
   * Marks an agent as active (working)
   */
  markAgentActive(project: string): void {
    this.activeAgents.add(project);
  }

  /**
   * Marks an agent as idle
   */
  markAgentIdle(project: string): void {
    this.activeAgents.delete(project);
    this.checkPausedTransition();
  }

  /**
   * Checks if all agents are idle and transitions to PAUSED if so
   */
  private checkPausedTransition(): void {
    if (this.state === 'PAUSING' && this.activeAgents.size === 0) {
      const previousState = this.state;
      this.state = 'PAUSED';
      this.emit('stateChange', { previous: previousState, current: this.state });
      this.emit('paused');
    }
  }

  /**
   * Returns whether the event queue should process events
   */
  canProcessQueue(): boolean {
    return this.state === 'RUNNING';
  }

  /**
   * Returns whether direct prompts can be sent (always true)
   */
  canSendDirect(): boolean {
    return true;
  }

  /**
   * Returns whether agents can be started
   */
  canStartAgents(): boolean {
    return this.state === 'RUNNING';
  }

  /**
   * Gets list of active agents
   */
  getActiveAgents(): string[] {
    return Array.from(this.activeAgents);
  }

  /**
   * Resets state machine
   */
  reset(): void {
    this.state = 'IDLE';
    this.activeAgents.clear();
    this.emit('reset');
  }
}
