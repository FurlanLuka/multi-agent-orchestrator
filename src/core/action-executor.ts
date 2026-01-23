import { EventEmitter } from 'events';
import {
  PlanningAction,
  ChatResponseAction,
  SendToAgentAction,
  SendE2EAction,
  RestartServerAction,
  CompleteAction
} from '../types';
import { ProcessManager } from './process-manager';
import { StatusMonitor } from './status-monitor';
import { StateMachine } from './state-machine';

/**
 * Executes actions returned by the Planning Agent
 */
export class ActionExecutor extends EventEmitter {
  private processManager: ProcessManager;
  private statusMonitor: StatusMonitor;
  private stateMachine: StateMachine;

  constructor(
    processManager: ProcessManager,
    statusMonitor: StatusMonitor,
    stateMachine: StateMachine
  ) {
    super();
    this.processManager = processManager;
    this.statusMonitor = statusMonitor;
    this.stateMachine = stateMachine;
  }

  /**
   * Executes a planning action
   */
  async execute(action: PlanningAction): Promise<void> {
    console.log(`[ActionExecutor] Executing action: ${action.type}`);

    switch (action.type) {
      case 'chat_response':
        await this.executeChatResponse(action);
        break;

      case 'send_to_agent':
        await this.executeSendToAgent(action);
        break;

      case 'send_e2e':
        await this.executeSendE2E(action);
        break;

      case 'restart_server':
        await this.executeRestartServer(action);
        break;

      case 'complete':
        await this.executeComplete(action);
        break;

      case 'noop':
        // Do nothing
        break;

      default:
        console.warn(`[ActionExecutor] Unknown action type: ${(action as PlanningAction).type}`);
    }
  }

  /**
   * Sends a chat response to the UI
   */
  private async executeChatResponse(action: ChatResponseAction): Promise<void> {
    console.log(`[ActionExecutor] Chat response: ${action.message.substring(0, 100)}...`);
    this.emit('chat', { from: 'planning', message: action.message });
  }

  /**
   * Sends a prompt to an agent via stdin
   */
  private async executeSendToAgent(action: SendToAgentAction): Promise<void> {
    console.log(`[ActionExecutor] Sending prompt to ${action.project}`);

    try {
      this.statusMonitor.updateStatus(action.project, 'WORKING', 'Processing task');
      this.stateMachine.markAgentActive(action.project);
      this.emit('agentPromptSent', { project: action.project });

      // sendToAgent now returns Promise<string> and waits for completion
      const result = await this.processManager.sendToAgent(action.project, action.prompt);
      console.log(`[ActionExecutor] Agent ${action.project} completed task (${result.length} chars)`);

      // Update status to READY - this triggers E2E flow via StatusMonitor.projectReady event
      this.statusMonitor.updateStatus(action.project, 'READY', 'Task completed');
      this.stateMachine.markAgentIdle(action.project);

      // Emit completion event
      this.emit('agentTaskComplete', { project: action.project, result });
    } catch (err) {
      console.error(`[ActionExecutor] Failed to send prompt to ${action.project}:`, err);
      this.emit('error', { action, error: 'Failed to send prompt' });
    }
  }

  /**
   * Sends an E2E test prompt to an agent
   * Note: Does NOT automatically transition to IDLE - the result needs to be analyzed first
   */
  private async executeSendE2E(action: SendE2EAction): Promise<void> {
    console.log(`[ActionExecutor] Sending E2E prompt to ${action.project}`);

    try {
      this.statusMonitor.updateStatus(action.project, 'E2E', 'Running E2E tests');
      this.stateMachine.markAgentActive(action.project);
      this.emit('e2ePromptSent', { project: action.project });

      const result = await this.processManager.sendToAgent(action.project, action.prompt);
      console.log(`[ActionExecutor] Agent ${action.project} completed E2E (${result.length} chars)`);

      // Don't update status here - emit result for analysis
      // The listener will analyze and set status to either IDLE (passed) or E2E_FIXING (failed)
      this.stateMachine.markAgentIdle(action.project);

      this.emit('e2eComplete', { project: action.project, result });
    } catch (err) {
      console.error(`[ActionExecutor] Failed to send E2E prompt to ${action.project}:`, err);
      this.emit('error', { action, error: 'Failed to send E2E prompt' });
    }
  }

  /**
   * Sends a fix prompt to an agent after E2E failure
   */
  async sendE2EFix(project: string, fixPrompt: string): Promise<string> {
    console.log(`[ActionExecutor] Sending E2E fix prompt to ${project}`);

    try {
      this.statusMonitor.updateStatus(project, 'E2E_FIXING', 'Fixing E2E test failures');
      this.stateMachine.markAgentActive(project);
      this.emit('e2eFixPromptSent', { project });

      const result = await this.processManager.sendToAgent(project, fixPrompt);
      console.log(`[ActionExecutor] Agent ${project} completed E2E fix (${result.length} chars)`);

      this.stateMachine.markAgentIdle(project);
      this.emit('e2eFixComplete', { project, result });

      return result;
    } catch (err) {
      console.error(`[ActionExecutor] Failed to send E2E fix prompt to ${project}:`, err);
      this.emit('error', { project, error: 'Failed to send E2E fix prompt' });
      throw err;
    }
  }

  /**
   * Restarts a dev server
   */
  private async executeRestartServer(action: RestartServerAction): Promise<void> {
    console.log(`[ActionExecutor] Restarting dev server for ${action.project}`);

    try {
      await this.processManager.restartDevServer(action.project);
      this.emit('serverRestarted', { project: action.project });
    } catch (err) {
      console.error(`[ActionExecutor] Failed to restart server for ${action.project}:`, err);
      this.emit('error', { action, error: err });
    }
  }

  /**
   * Marks execution as complete
   */
  private async executeComplete(action: CompleteAction): Promise<void> {
    console.log(`[ActionExecutor] Execution complete: ${action.summary}`);

    // Notify UI
    this.emit('chat', { from: 'planning', message: action.summary });
    this.emit('complete', { summary: action.summary });

    // Stop the state machine
    this.stateMachine.transition('stop');
  }

  /**
   * Sends a direct prompt to an agent (bypasses queue)
   * Returns true if the prompt was sent successfully (async - doesn't wait for result)
   */
  async sendDirect(project: string, prompt: string): Promise<boolean> {
    if (!this.stateMachine.canSendDirect()) {
      console.warn(`[ActionExecutor] Cannot send direct prompt in current state`);
      return false;
    }

    console.log(`[ActionExecutor] Sending direct prompt to ${project}`);

    try {
      this.stateMachine.markAgentActive(project);
      this.emit('directPromptSent', { project });

      // Fire and forget - don't await the result for direct prompts
      this.processManager.sendToAgent(project, prompt).then(result => {
        console.log(`[ActionExecutor] Direct prompt completed for ${project}`);
        this.emit('directPromptComplete', { project, result });
      }).catch(err => {
        console.error(`[ActionExecutor] Direct prompt failed for ${project}:`, err);
        this.emit('error', { project, error: err });
      });

      return true;
    } catch (err) {
      console.error(`[ActionExecutor] Failed to send direct prompt to ${project}:`, err);
      return false;
    }
  }
}
