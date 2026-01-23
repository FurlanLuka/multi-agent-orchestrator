import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { QueuedEvent, OrchestratorEvent, PlanningAction } from '../types';
import { StateMachine } from './state-machine';
import { PlanningAgentManager } from '../planning/planning-agent-manager';

/**
 * Queues events for the Planning Agent to analyze
 * Events are processed sequentially; queue can be paused/resumed
 */
export class EventQueue extends EventEmitter {
  private queue: QueuedEvent[] = [];
  private processing: boolean = false;
  private stateMachine: StateMachine;
  private planningAgent: PlanningAgentManager;

  constructor(stateMachine: StateMachine, planningAgent: PlanningAgentManager) {
    super();
    this.stateMachine = stateMachine;
    this.planningAgent = planningAgent;

    // When state machine resumes, start processing
    this.stateMachine.on('resumed', () => {
      this.processNext();
    });
  }

  /**
   * Adds an event to the queue
   */
  add(event: OrchestratorEvent): void {
    const queuedEvent: QueuedEvent = {
      id: randomUUID().slice(0, 8),
      type: event.type,
      project: 'project' in event ? event.project : undefined,
      data: event,
      queuedAt: Date.now()
    };

    this.queue.push(queuedEvent);
    this.emit('eventAdded', queuedEvent);

    console.log(`[EventQueue] Added event: ${event.type} (queue size: ${this.queue.length})`);

    // Start processing if not already and state allows
    if (!this.processing && this.stateMachine.canProcessQueue()) {
      this.processNext();
    }
  }

  /**
   * Pauses queue processing (delegates to state machine)
   */
  pause(): void {
    this.stateMachine.transition('pause');
    console.log('[EventQueue] Queue paused');
    this.emit('paused');
  }

  /**
   * Resumes queue processing (delegates to state machine)
   */
  resume(): void {
    this.stateMachine.transition('resume');
    console.log('[EventQueue] Queue resumed');
    this.emit('resumed');
  }

  /**
   * Processes the next event in the queue
   */
  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    if (!this.stateMachine.canProcessQueue()) {
      this.processing = false;
      console.log('[EventQueue] Processing paused, waiting for resume');
      return;
    }

    this.processing = true;
    const event = this.queue.shift()!;

    console.log(`[EventQueue] Processing event: ${event.type} (remaining: ${this.queue.length})`);
    this.emit('processing', event);

    try {
      // Send event to Planning Agent for analysis
      const action = await this.analyzeEvent(event);

      if (action) {
        console.log(`[EventQueue] Planning Agent returned action: ${action.type}`);
        this.emit('action', action);
      }
    } catch (err) {
      console.error('[EventQueue] Error processing event:', err);
      this.emit('error', { event, error: err });
    }

    // Process next event
    // Small delay to prevent overwhelming the Planning Agent
    setTimeout(() => this.processNext(), 100);
  }

  /**
   * Sends event to Planning Agent for analysis
   */
  private async analyzeEvent(event: QueuedEvent): Promise<PlanningAction | null> {
    // Format event for Planning Agent
    // Note: event.data already contains type, so we just add project and queuedAt
    const eventJson = JSON.stringify({
      ...event.data,
      project: event.project,
      queuedAt: event.queuedAt
    }, null, 2);

    try {
      // Ask Planning Agent to analyze the event
      const response = await this.planningAgent.analyzeEvent(eventJson);

      // Parse action from response
      return this.parseAction(response);
    } catch (err) {
      console.error('[EventQueue] Planning Agent analysis failed:', err);
      return null;
    }
  }

  /**
   * Parses action JSON from Planning Agent response
   */
  private parseAction(response: string): PlanningAction | null {
    try {
      // Look for JSON in the response
      const jsonMatch = response.match(/\{[\s\S]*?"type"\s*:\s*"[\s\S]*?\}/);
      if (jsonMatch) {
        const action = JSON.parse(jsonMatch[0]) as PlanningAction;
        return action;
      }

      // If no JSON found, treat as chat response
      if (response.trim()) {
        return {
          type: 'chat_response',
          message: response.trim()
        };
      }

      return null;
    } catch (err) {
      console.error('[EventQueue] Failed to parse action:', err);
      // If parsing fails, return as chat response
      return {
        type: 'chat_response',
        message: response
      };
    }
  }

  /**
   * Gets current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Gets all queued events (for debugging)
   */
  getQueuedEvents(): QueuedEvent[] {
    return [...this.queue];
  }

  /**
   * Clears the queue
   */
  clear(): void {
    this.queue = [];
    this.processing = false;
    this.emit('cleared');
    console.log('[EventQueue] Queue cleared');
  }

  /**
   * Checks if queue is processing
   */
  isProcessing(): boolean {
    return this.processing;
  }
}
