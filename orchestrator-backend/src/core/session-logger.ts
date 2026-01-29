import * as fs from 'fs';
import * as path from 'path';
import { getSessionsDir } from '../config/paths';

/**
 * Logs session events to filesystem for debugging
 */
export class SessionLogger {
  private logDir: string;
  private logFile: string;

  constructor(sessionId: string) {
    // Use central sessions directory from path resolver (~/.orchy-config/sessions/)
    this.logDir = path.join(getSessionsDir(), sessionId, 'logs');
    fs.mkdirSync(this.logDir, { recursive: true });
    this.logFile = path.join(this.logDir, 'events.log');

    // Write session start
    this.log('SESSION_START', { sessionId, timestamp: new Date().toISOString() });
  }

  /**
   * Log an event with timestamp
   */
  log(eventType: string, data: any): void {
    const entry = {
      timestamp: new Date().toISOString(),
      type: eventType,
      data
    };

    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.logFile, line);

    // Also write to a human-readable log
    const readableLine = `[${entry.timestamp}] ${eventType}: ${JSON.stringify(data).substring(0, 200)}\n`;
    fs.appendFileSync(path.join(this.logDir, 'readable.log'), readableLine);
  }

  /**
   * Log chat message
   */
  chat(from: 'user' | 'planning' | 'system', message: string): void {
    this.log('CHAT', { from, message: message.substring(0, 500) });

    // Also append to chat.md for easy reading
    const chatLine = `### ${from} (${new Date().toLocaleTimeString()})\n${message}\n\n---\n\n`;
    fs.appendFileSync(path.join(this.logDir, 'chat.md'), chatLine);
  }

  /**
   * Log planning agent output
   */
  planningOutput(text: string): void {
    this.log('PLANNING_OUTPUT', { length: text.length, preview: text.substring(0, 200) });
  }

  /**
   * Log agent task
   */
  agentTask(project: string, prompt: string): void {
    this.log('AGENT_TASK', { project, prompt: prompt.substring(0, 300) });
  }

  /**
   * Log agent result
   */
  agentResult(project: string, result: string): void {
    this.log('AGENT_RESULT', { project, length: result.length, preview: result.substring(0, 200) });
  }

  /**
   * Log error
   */
  error(context: string, error: any): void {
    this.log('ERROR', {
      context,
      message: error?.message || String(error),
      stack: error?.stack?.substring(0, 500)
    });
  }

  /**
   * Get log directory path
   */
  getLogDir(): string {
    return this.logDir;
  }
}
