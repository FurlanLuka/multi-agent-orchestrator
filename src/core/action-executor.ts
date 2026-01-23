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

// Patterns that indicate dev server issues in agent responses
const DEV_SERVER_ISSUE_PATTERNS = [
  /connection refused/i,
  /ECONNREFUSED/i,
  /server not responding/i,
  /server is not running/i,
  /dev server.*not.*running/i,
  /cannot connect to.*localhost/i,
  /failed to fetch/i,
  /net::ERR_CONNECTION_REFUSED/i,
  /ETIMEDOUT/i,
  /socket hang up/i,
];

/**
 * Executes actions returned by the Planning Agent
 */
export class ActionExecutor extends EventEmitter {
  private processManager: ProcessManager;
  private statusMonitor: StatusMonitor;
  private stateMachine: StateMachine;
  private retryCount: Map<string, number> = new Map();
  private readonly MAX_RETRIES = 2;

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
   * Checks if agent response indicates dev server issues
   */
  private detectsDevServerIssue(result: string): boolean {
    return DEV_SERVER_ISSUE_PATTERNS.some(pattern => pattern.test(result));
  }

  /**
   * Attempts to recover dev server and retry the task
   * Returns true if recovery was successful and task should be retried
   */
  private async attemptDevServerRecovery(project: string): Promise<boolean> {
    const retries = this.retryCount.get(project) || 0;
    if (retries >= this.MAX_RETRIES) {
      console.log(`[ActionExecutor] Max retries (${this.MAX_RETRIES}) reached for ${project}`);
      this.retryCount.delete(project);
      return false;
    }

    console.log(`[ActionExecutor] Attempting dev server recovery for ${project} (attempt ${retries + 1}/${this.MAX_RETRIES})`);
    this.retryCount.set(project, retries + 1);

    // Health check first
    const health = await this.processManager.checkDevServerHealth(project);
    if (health.healthy) {
      console.log(`[ActionExecutor] Dev server for ${project} is actually healthy, issue may be transient`);
      return true; // Server is fine, retry the task
    }

    // Server is unhealthy, attempt restart
    console.log(`[ActionExecutor] Dev server unhealthy for ${project}, restarting...`);
    this.statusMonitor.updateStatus(project, 'WORKING', 'Restarting dev server...');

    try {
      await this.processManager.restartDevServer(project);

      // Verify health after restart
      const retryHealth = await this.processManager.checkDevServerHealthWithRetry(project, 3, 2000);
      if (retryHealth.healthy) {
        console.log(`[ActionExecutor] Dev server for ${project} recovered successfully`);
        return true;
      } else {
        console.error(`[ActionExecutor] Dev server still unhealthy after restart for ${project}`);
        return false;
      }
    } catch (err) {
      console.error(`[ActionExecutor] Failed to restart dev server for ${project}:`, err);
      return false;
    }
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

      // Check if agent response indicates dev server issues
      if (this.detectsDevServerIssue(result)) {
        console.log(`[ActionExecutor] Detected dev server issue in ${action.project} response`);

        const recovered = await this.attemptDevServerRecovery(action.project);
        if (recovered) {
          // Retry the task
          console.log(`[ActionExecutor] Retrying task for ${action.project} after dev server recovery`);
          this.emit('chat', {
            from: 'system',
            message: `Dev server issue detected for ${action.project}. Restarted server and retrying task...`
          });

          // Recursively retry
          await this.executeSendToAgent(action);
          return;
        } else {
          // Recovery failed, mark as fatal
          this.statusMonitor.updateStatus(action.project, 'FATAL_DEBUGGING',
            'Dev server not responding after recovery attempts');
          this.stateMachine.markAgentIdle(action.project);
          this.retryCount.delete(action.project);
          this.emit('error', { action, error: 'Dev server recovery failed' });
          return;
        }
      }

      // Success - clear retry count and update status
      this.retryCount.delete(action.project);

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

      // Check if E2E failure is due to dev server issues (not actual test failures)
      if (this.detectsDevServerIssue(result)) {
        console.log(`[ActionExecutor] Detected dev server issue during E2E for ${action.project}`);

        const recovered = await this.attemptDevServerRecovery(action.project);
        if (recovered) {
          // Retry E2E
          console.log(`[ActionExecutor] Retrying E2E for ${action.project} after dev server recovery`);
          this.emit('chat', {
            from: 'system',
            message: `Dev server issue detected during E2E for ${action.project}. Restarted server and retrying tests...`
          });

          // Recursively retry
          await this.executeSendE2E(action);
          return;
        } else {
          // Recovery failed
          this.statusMonitor.updateStatus(action.project, 'FATAL_DEBUGGING',
            'Dev server not responding during E2E tests');
          this.stateMachine.markAgentIdle(action.project);
          this.retryCount.delete(action.project);
          this.emit('error', { action, error: 'Dev server recovery failed during E2E' });
          return;
        }
      }

      // Clear retry count on success (even if tests fail, server was working)
      this.retryCount.delete(action.project);

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
