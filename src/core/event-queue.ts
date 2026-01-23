import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import {
  QueuedEvent,
  OrchestratorEvent,
  PlanningAction,
  UserChatEvent,
  E2ECompleteEvent,
  E2EPromptRequestEvent,
  FailureAnalysisEvent
} from '../types';
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
    // user_chat events can be processed in any state (IDLE or RUNNING)
    if (!this.processing && this.canProcessEvent(queuedEvent)) {
      this.processNext();
    }
  }

  /**
   * Checks if an event can be processed in the current state
   * Planning Agent events (user_chat, e2e_complete, e2e_prompt_request, failure_analysis)
   * can be processed anytime as long as PA isn't busy
   * Other events (hook events, etc.) require RUNNING state
   */
  private canProcessEvent(event: QueuedEvent): boolean {
    // Planning Agent related events can be processed anytime
    const planningAgentEventTypes = ['user_chat', 'e2e_complete', 'e2e_prompt_request', 'failure_analysis'];
    if (planningAgentEventTypes.includes(event.type)) {
      // Can process as long as Planning Agent isn't busy
      return !this.planningAgent.isBusy();
    }
    // Other events require RUNNING state
    return this.stateMachine.canProcessQueue();
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
      this.emit('idle'); // Emit when queue is empty and done processing
      return;
    }

    // Check if Planning Agent is busy
    if (this.planningAgent.isBusy()) {
      this.processing = false;
      console.log('[EventQueue] Planning Agent is busy, waiting...');
      return;
    }

    // Find the next processable event
    const eventIndex = this.queue.findIndex(e => this.canProcessEvent(e));
    if (eventIndex === -1) {
      this.processing = false;
      console.log('[EventQueue] No processable events, waiting for state change');
      return;
    }

    this.processing = true;
    const event = this.queue.splice(eventIndex, 1)[0];

    // Notify that an event was removed from queue (for UI updates)
    this.emit('eventRemoved', event);

    console.log(`[EventQueue] Processing event: ${event.type} (remaining: ${this.queue.length})`);
    this.emit('processing', event);

    try {
      // Handle different event types with specific handlers
      switch (event.type) {
        case 'user_chat': {
          // Emit for external handling via chatHandler.handleUserMessage
          const chatEvent = event.data as UserChatEvent;
          this.emit('userChat', { message: chatEvent.message });
          break;
        }

        case 'e2e_complete': {
          // Emit for external handling via chatHandler.analyzeE2EResult
          const e2eEvent = event.data as E2ECompleteEvent;
          this.emit('e2eComplete', {
            project: e2eEvent.project,
            result: e2eEvent.result,
            testScenarios: e2eEvent.testScenarios,
            devServerLogs: e2eEvent.devServerLogs,
            allProjects: e2eEvent.allProjects
          });
          break;
        }

        case 'e2e_prompt_request': {
          // Emit for external handling via chatHandler.requestE2EPrompt
          const promptEvent = event.data as E2EPromptRequestEvent;
          this.emit('e2ePromptRequest', {
            project: promptEvent.project,
            taskSummary: promptEvent.taskSummary,
            testScenarios: promptEvent.testScenarios,
            devServerUrl: promptEvent.devServerUrl
          });
          break;
        }

        case 'failure_analysis': {
          // Emit for external handling via chatHandler.requestFailureAnalysis
          const failureEvent = event.data as FailureAnalysisEvent;
          this.emit('failureAnalysis', {
            project: failureEvent.project,
            error: failureEvent.error,
            context: failureEvent.context
          });
          break;
        }

        default: {
          // For other events (hook events, etc.), use the generic analyzeEvent
          const action = await this.analyzeEvent(event);
          if (action) {
            console.log(`[EventQueue] Planning Agent returned action: ${action.type}`);
            this.emit('action', action);
          }
        }
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

  /**
   * Triggers processing of the queue (called when Planning Agent becomes free)
   */
  triggerProcessing(): void {
    if (!this.processing && this.queue.length > 0) {
      this.processNext();
    }
  }

  /**
   * Checks if there are pending events that could be processed
   */
  hasPendingEvents(): boolean {
    return this.queue.length > 0;
  }
}
