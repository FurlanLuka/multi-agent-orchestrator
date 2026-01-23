import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { SessionManager } from './session-manager';

export class MessageRouter extends EventEmitter {
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    super();
    this.sessionManager = sessionManager;
  }

  /**
   * Sends a message to an agent's inbox
   */
  sendToAgent(
    project: string,
    message: string,
    from: string = 'Orchestrator',
    type: string = 'message'
  ): boolean {
    const sessionDir = this.sessionManager.getSessionDir(project);
    if (!sessionDir) {
      console.error(`[MessageRouter] Cannot send message: no session for ${project}`);
      return false;
    }

    const inboxPath = path.join(sessionDir, 'inbox.txt');

    if (!fs.existsSync(inboxPath)) {
      console.error(`[MessageRouter] Inbox not found: ${inboxPath}`);
      return false;
    }

    const timestamp = new Date().toISOString();

    // Format message with clear separators (human and agent readable)
    const formattedMessage = `
═══════════════════════════════════════════════════════════════════════════════
FROM: ${from}
TIME: ${timestamp}
TYPE: ${type}

${message}
═══════════════════════════════════════════════════════════════════════════════
`;

    try {
      fs.appendFileSync(inboxPath, formattedMessage);
      console.log(`[MessageRouter] Sent message to ${project} from ${from} (type: ${type})`);
      this.emit('messageSent', { project, from, type, timestamp });
      return true;
    } catch (err) {
      console.error(`[MessageRouter] Failed to send message to ${project}:`, err);
      return false;
    }
  }

  /**
   * Broadcasts a message to all projects in the current session
   */
  broadcast(message: string, from: string = 'Orchestrator', type: string = 'broadcast'): void {
    const session = this.sessionManager.getCurrentSession();
    if (!session) {
      console.warn(`[MessageRouter] Cannot broadcast: no active session`);
      return;
    }

    console.log(`[MessageRouter] Broadcasting to ${session.projects.length} projects`);

    for (const project of session.projects) {
      this.sendToAgent(project, message, from, type);
    }

    this.emit('broadcast', { projects: session.projects, from, type });
  }

  /**
   * Sends a task prompt to an agent (for starting work)
   * Note: Status updates are now mostly automatic via native Claude hooks.
   * Manual hooks are still available for explicit communication.
   */
  sendTask(project: string, task: string, context?: string): boolean {
    const sessionDir = this.sessionManager.getSessionDir(project);
    const hooksDir = sessionDir ? `${sessionDir}/hooks` : './hooks';

    let message = `# Task Assignment

${task}`;

    if (context) {
      message += `

## Additional Context

${context}`;
    }

    message += `

## Orchestrator Integration

Your activity is automatically tracked via native hooks. When you start using tools, status auto-updates to WORKING. Error patterns and test results are auto-detected.

For explicit communication with the orchestrator, use these scripts at \`${hooksDir}/\`:

- \`${hooksDir}/on_complete.sh "summary"\` - **Required when done** - Report task completion
- \`${hooksDir}/on_question.sh "prompt"\` - Request user approval (blocks until response)
- \`${hooksDir}/send_message.sh PROJECT "message"\` - Message another agent
- \`${hooksDir}/on_error.sh "error" [severity]\` - Report errors explicitly
- \`${hooksDir}/request_restart.sh "reason"\` - Request dev server restart

## Workflow

1. Work on your assigned task (status auto-updates to WORKING)
2. When complete, run: \`${hooksDir}/on_complete.sh "Brief summary of what was implemented"\`

This signals readiness for E2E testing.`;

    return this.sendToAgent(project, message, 'Orchestrator', 'task');
  }

  /**
   * Sends an E2E test prompt to an agent
   * Note: Test pass/fail is auto-detected via PostToolUse hook patterns.
   */
  sendE2EPrompt(project: string, prompt: string, testScenarios: string[]): boolean {
    const sessionDir = this.sessionManager.getSessionDir(project);
    const hooksDir = sessionDir ? `${sessionDir}/hooks` : './hooks';

    let message = `# E2E Testing Required

Your task has been completed. Now run E2E tests to verify the implementation.

## Test Instructions

${prompt}

## Test Scenarios to Verify

${testScenarios.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## Status Tracking

Status is auto-tracked:
- Running tests auto-sets status to E2E
- Test pass/fail patterns are auto-detected

If you need to explicitly set status:
- \`${hooksDir}/on_status_change.sh E2E "Running E2E tests"\`
- \`${hooksDir}/on_status_change.sh IDLE "E2E tests passed"\` (on success)
- \`${hooksDir}/on_status_change.sh DEBUGGING "reason"\` (on failure, then fix and retry)`;

    return this.sendToAgent(project, message, 'Orchestrator', 'e2e_prompt');
  }

  /**
   * Sends debugging guidance to an agent
   */
  sendDebuggingGuidance(project: string, guidance: string, context?: string): boolean {
    let message = `# Debugging Guidance

${guidance}`;

    if (context) {
      message += `

## Error Context

${context}`;
    }

    message += `

## After Fixing

Once you've fixed the issue:
1. If it was a dev server crash: \`./hooks/on_status_change.sh FATAL_RECOVERY "Fixed: <what you fixed>"\`
2. Otherwise: \`./hooks/on_status_change.sh READY "Fixed: <what you fixed>"\``;

    return this.sendToAgent(project, message, 'Orchestrator', 'debugging');
  }

  /**
   * Reads the inbox for a project (for debugging)
   */
  readInbox(project: string): string | null {
    const sessionDir = this.sessionManager.getSessionDir(project);
    if (!sessionDir) return null;

    const inboxPath = path.join(sessionDir, 'inbox.txt');
    if (!fs.existsSync(inboxPath)) return null;

    return fs.readFileSync(inboxPath, 'utf-8');
  }

  /**
   * Clears the inbox for a project
   */
  clearInbox(project: string): boolean {
    const sessionDir = this.sessionManager.getSessionDir(project);
    if (!sessionDir) return false;

    const inboxPath = path.join(sessionDir, 'inbox.txt');
    if (!fs.existsSync(inboxPath)) return false;

    fs.writeFileSync(inboxPath, '');
    return true;
  }
}
