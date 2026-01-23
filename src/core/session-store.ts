import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  Session,
  Plan,
  PlanProposal,
  AgentStatus,
  ProjectState,
  LogEntry,
  StreamingMessage,
  TestScenarioStatus,
  PersistedSession,
  PersistedTestState,
  SessionSummary,
  FullSessionData,
} from '../types';

/**
 * Central persistence layer for session data
 * Stores sessions in .sessions/{sessionId}/ directory
 */
export class SessionStore extends EventEmitter {
  private sessionsDir: string;
  private currentSessionId: string | null = null;

  constructor(orchestratorDir: string) {
    super();
    this.sessionsDir = path.join(orchestratorDir, '.sessions');
    fs.mkdirSync(this.sessionsDir, { recursive: true });
  }

  /**
   * Gets the directory path for a session
   */
  private getSessionPath(sessionId: string): string {
    return path.join(this.sessionsDir, sessionId);
  }

  /**
   * Gets the session.json path for a session
   */
  private getSessionJsonPath(sessionId: string): string {
    return path.join(this.getSessionPath(sessionId), 'session.json');
  }

  /**
   * Gets the logs directory for a session
   */
  private getLogsDir(sessionId: string): string {
    return path.join(this.getSessionPath(sessionId), 'logs');
  }

  /**
   * Gets the chat file path for a session
   */
  private getChatPath(sessionId: string): string {
    return path.join(this.getSessionPath(sessionId), 'chat.jsonl');
  }

  /**
   * Creates a new session
   */
  createSession(id: string, feature: string, projects: string[]): PersistedSession {
    const sessionPath = this.getSessionPath(id);
    const logsDir = this.getLogsDir(id);

    // Create directories
    fs.mkdirSync(sessionPath, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });

    // Create initial session data
    const session: PersistedSession = {
      id,
      feature,
      projects,
      startedAt: Date.now(),
      statuses: {},
      testStates: {},
      status: 'planning',
      updatedAt: Date.now(),
    };

    // Initialize statuses for all projects
    for (const project of projects) {
      session.statuses[project] = {
        status: 'PENDING',
        message: 'Waiting for execution',
        updatedAt: Date.now(),
      };
    }

    // Write session.json
    this.writeSession(session);

    // Create empty chat.jsonl
    fs.writeFileSync(this.getChatPath(id), '');

    this.currentSessionId = id;
    console.log(`[SessionStore] Created session: ${id}`);

    return session;
  }

  /**
   * Loads an existing session
   */
  loadSession(sessionId: string): PersistedSession | null {
    const sessionPath = this.getSessionJsonPath(sessionId);

    if (!fs.existsSync(sessionPath)) {
      console.warn(`[SessionStore] Session not found: ${sessionId}`);
      return null;
    }

    try {
      const data = fs.readFileSync(sessionPath, 'utf-8');
      const session = JSON.parse(data) as PersistedSession;
      this.currentSessionId = sessionId;
      console.log(`[SessionStore] Loaded session: ${sessionId}`);
      return session;
    } catch (err) {
      console.error(`[SessionStore] Failed to load session ${sessionId}:`, err);
      return null;
    }
  }

  /**
   * Gets the current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Sets the current session ID (for resuming)
   */
  setCurrentSessionId(sessionId: string | null): void {
    this.currentSessionId = sessionId;
  }

  /**
   * Lists all available sessions
   */
  listSessions(): SessionSummary[] {
    const sessions: SessionSummary[] = [];

    if (!fs.existsSync(this.sessionsDir)) {
      return sessions;
    }

    const entries = fs.readdirSync(this.sessionsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const sessionPath = this.getSessionJsonPath(entry.name);
      if (!fs.existsSync(sessionPath)) continue;

      try {
        const data = fs.readFileSync(sessionPath, 'utf-8');
        const session = JSON.parse(data) as PersistedSession;

        sessions.push({
          id: session.id,
          feature: session.feature,
          projects: session.projects,
          startedAt: session.startedAt,
          updatedAt: session.updatedAt,
          status: session.status,
          completedAt: session.completedAt,
        });
      } catch (err) {
        console.warn(`[SessionStore] Failed to read session ${entry.name}:`, err);
      }
    }

    // Sort by most recent first
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);

    return sessions;
  }

  /**
   * Writes session data to disk
   */
  private writeSession(session: PersistedSession): void {
    const sessionPath = this.getSessionJsonPath(session.id);
    session.updatedAt = Date.now();
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
  }

  /**
   * Updates the session with a plan
   */
  setPlan(sessionId: string, plan: Plan): void {
    const session = this.loadSession(sessionId);
    if (!session) return;

    session.plan = plan;
    session.pendingPlan = undefined;  // Clear pending plan once approved
    session.status = 'running';
    this.writeSession(session);
    console.log(`[SessionStore] Set plan for session ${sessionId}`);
  }

  /**
   * Sets a pending plan (waiting for user approval)
   */
  setPendingPlan(sessionId: string, pendingPlan: PlanProposal): void {
    const session = this.loadSession(sessionId);
    if (!session) return;

    session.pendingPlan = pendingPlan;
    this.writeSession(session);
    console.log(`[SessionStore] Set pending plan for session ${sessionId}`);
  }

  /**
   * Clears the pending plan (user declined or continued conversation)
   */
  clearPendingPlan(sessionId: string): void {
    const session = this.loadSession(sessionId);
    if (!session) return;

    session.pendingPlan = undefined;
    this.writeSession(session);
    console.log(`[SessionStore] Cleared pending plan for session ${sessionId}`);
  }

  /**
   * Gets the pending plan for a session
   */
  getPendingPlan(sessionId: string): PlanProposal | undefined {
    const session = this.loadSession(sessionId);
    return session?.pendingPlan;
  }

  /**
   * Updates a project's status
   */
  updateStatus(sessionId: string, project: string, status: AgentStatus, message: string): void {
    const session = this.loadSession(sessionId);
    if (!session) return;

    session.statuses[project] = {
      status,
      message,
      updatedAt: Date.now(),
    };

    this.writeSession(session);
  }

  /**
   * Updates test state for a project
   */
  updateTestState(
    sessionId: string,
    project: string,
    scenario: string,
    status: TestScenarioStatus,
    error?: string
  ): void {
    const session = this.loadSession(sessionId);
    if (!session) return;

    if (!session.testStates[project]) {
      session.testStates[project] = {
        scenarios: [],
        updatedAt: Date.now(),
      };
    }

    const testState = session.testStates[project];
    const existingIndex = testState.scenarios.findIndex(s => s.name === scenario);

    if (existingIndex >= 0) {
      testState.scenarios[existingIndex] = { name: scenario, status, error };
    } else {
      testState.scenarios.push({ name: scenario, status, error });
    }

    testState.updatedAt = Date.now();
    this.writeSession(session);
  }

  /**
   * Marks a session as completed
   */
  markCompleted(sessionId: string): void {
    const session = this.loadSession(sessionId);
    if (!session) return;

    session.status = 'completed';
    session.completedAt = Date.now();
    this.writeSession(session);
    console.log(`[SessionStore] Marked session ${sessionId} as completed`);
  }

  /**
   * Marks a session as interrupted (for recovery)
   */
  markInterrupted(sessionId: string): void {
    const session = this.loadSession(sessionId);
    if (!session) return;

    session.status = 'interrupted';
    this.writeSession(session);
    console.log(`[SessionStore] Marked session ${sessionId} as interrupted`);
  }

  /**
   * Appends a log entry to the session's logs
   */
  appendLog(sessionId: string, entry: LogEntry): void {
    const logsDir = this.getLogsDir(sessionId);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Use JSONL format for efficient append
    const logFile = path.join(logsDir, `${entry.project}_${entry.type}.jsonl`);
    const line = JSON.stringify(entry) + '\n';

    try {
      fs.appendFileSync(logFile, line);
    } catch (err) {
      // Ignore file write errors
    }
  }

  /**
   * Appends a chat message to the session's chat history
   */
  appendChatMessage(sessionId: string, message: StreamingMessage): void {
    const chatPath = this.getChatPath(sessionId);
    const line = JSON.stringify(message) + '\n';

    try {
      fs.appendFileSync(chatPath, line);
    } catch (err) {
      console.error(`[SessionStore] Failed to append chat message:`, err);
    }
  }

  /**
   * Gets all logs for a session
   */
  getLogs(sessionId: string, project?: string): LogEntry[] {
    const logsDir = this.getLogsDir(sessionId);
    const logs: LogEntry[] = [];

    if (!fs.existsSync(logsDir)) {
      return logs;
    }

    const files = fs.readdirSync(logsDir).filter(f => f.endsWith('.jsonl'));

    for (const file of files) {
      // Filter by project if specified
      if (project && !file.startsWith(`${project}_`)) continue;

      const filePath = path.join(logsDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(l => l);

        for (const line of lines) {
          try {
            logs.push(JSON.parse(line) as LogEntry);
          } catch {
            // Skip malformed lines
          }
        }
      } catch (err) {
        // Skip files that can't be read
      }
    }

    // Sort by timestamp
    logs.sort((a, b) => a.timestamp - b.timestamp);

    return logs;
  }

  /**
   * Gets chat history for a session
   */
  getChatHistory(sessionId: string): StreamingMessage[] {
    const chatPath = this.getChatPath(sessionId);
    const messages: StreamingMessage[] = [];

    if (!fs.existsSync(chatPath)) {
      return messages;
    }

    try {
      const content = fs.readFileSync(chatPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);

      for (const line of lines) {
        try {
          messages.push(JSON.parse(line) as StreamingMessage);
        } catch {
          // Skip malformed lines
        }
      }
    } catch (err) {
      console.error(`[SessionStore] Failed to read chat history:`, err);
    }

    return messages;
  }

  /**
   * Gets full session data for loading (session + logs + chat)
   */
  getFullSessionData(sessionId: string): FullSessionData | null {
    const session = this.loadSession(sessionId);
    if (!session) return null;

    return {
      session,
      logs: this.getLogs(sessionId),
      chatMessages: this.getChatHistory(sessionId),
    };
  }

  /**
   * Deletes a session
   */
  deleteSession(sessionId: string): boolean {
    const sessionPath = this.getSessionPath(sessionId);

    if (!fs.existsSync(sessionPath)) {
      return false;
    }

    try {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log(`[SessionStore] Deleted session: ${sessionId}`);

      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
      }

      return true;
    } catch (err) {
      console.error(`[SessionStore] Failed to delete session ${sessionId}:`, err);
      return false;
    }
  }

  /**
   * Checks if a session exists
   */
  sessionExists(sessionId: string): boolean {
    return fs.existsSync(this.getSessionJsonPath(sessionId));
  }

  /**
   * Converts PersistedSession to Session (for compatibility)
   */
  toSession(persisted: PersistedSession): Session {
    return {
      id: persisted.id,
      startedAt: persisted.startedAt,
      feature: persisted.feature,
      projects: persisted.projects,
      plan: persisted.plan,
    };
  }
}
