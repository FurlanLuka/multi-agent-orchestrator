import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  Session,
  Plan,
  AgentStatus,
  ProjectState,
  LogEntry,
  StreamingMessage,
  TestScenarioStatus,
  PersistedSession,
  PersistedTestState,
  SessionSummary,
  FullSessionData,
  TaskState,
  TaskDefinition,
  ExplorationAnalysisResult,
} from '@aio/types';

/**
 * Central persistence layer for session data
 * Stores sessions in the provided sessions directory
 *
 * Directory structure:
 * {sessionsDir}/
 *   └── {sessionId}/
 *       ├── session.json     # Main session data
 *       ├── chat.jsonl       # Chat history (JSONL format)
 *       └── logs/
 *           └── {project}_{type}.jsonl
 */
export class SessionStore extends EventEmitter {
  private sessionsDir: string;
  private currentSessionId: string | null = null;

  // Cache and write debouncing to prevent race conditions
  private sessionCache: Map<string, PersistedSession> = new Map();
  private pendingWrites: Map<string, NodeJS.Timeout> = new Map();
  private readonly WRITE_DEBOUNCE_MS = 100;

  /**
   * Create a new SessionStore
   * @param sessionsDir - Directory where sessions are stored (e.g., ~/Library/Application Support/Orchestrator/sessions)
   */
  constructor(sessionsDir: string) {
    super();
    this.sessionsDir = sessionsDir;
    fs.mkdirSync(this.sessionsDir, { recursive: true });
  }

  /**
   * Normalizes a scenario name for case-insensitive matching
   * Prevents case mismatch issues when checking passed tests
   */
  private normalizeScenarioName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
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
      taskStates: [],
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

    // Cache and write session.json
    this.sessionCache.set(id, session);
    // Write directly without debounce for initial creation
    const sessionJsonPath = this.getSessionJsonPath(id);
    session.updatedAt = Date.now();
    fs.writeFileSync(sessionJsonPath, JSON.stringify(session, null, 2));

    // Create empty chat.jsonl
    fs.writeFileSync(this.getChatPath(id), '');

    this.currentSessionId = id;
    console.log(`[SessionStore] Created session: ${id}`);

    return session;
  }

  /**
   * Loads an existing session
   * Check cache first to prevent race conditions
   */
  loadSession(sessionId: string): PersistedSession | null {
    // Check cache first for faster access and consistency
    if (this.sessionCache.has(sessionId)) {
      this.currentSessionId = sessionId;
      return this.sessionCache.get(sessionId)!;
    }

    const sessionPath = this.getSessionJsonPath(sessionId);

    if (!fs.existsSync(sessionPath)) {
      console.warn(`[SessionStore] Session not found: ${sessionId}`);
      return null;
    }

    try {
      const data = fs.readFileSync(sessionPath, 'utf-8');
      const session = JSON.parse(data) as PersistedSession;
      this.currentSessionId = sessionId;
      // Cache the loaded session
      this.sessionCache.set(sessionId, session);
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
   * Debounce writes to prevent race conditions from rapid updates
   */
  private writeSession(session: PersistedSession): void {
    session.updatedAt = Date.now();

    // Update cache immediately for consistency
    this.sessionCache.set(session.id, session);

    // Debounce disk write
    const existingTimeout = this.pendingWrites.get(session.id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(() => {
      this.flushSession(session.id);
      this.pendingWrites.delete(session.id);
    }, this.WRITE_DEBOUNCE_MS);

    this.pendingWrites.set(session.id, timeout);
  }

  /**
   * Immediately flush a session to disk
   * Used for debounced writes
   */
  flushSession(sessionId: string): void {
    const session = this.sessionCache.get(sessionId);
    if (!session) return;

    const sessionPath = this.getSessionJsonPath(sessionId);
    try {
      fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
    } catch (err) {
      console.error(`[SessionStore] Failed to flush session ${sessionId}:`, err);
    }
  }

  /**
   * Flush all pending writes to disk
   * Called on shutdown to ensure all data is persisted
   */
  flushAll(): void {
    for (const [sessionId, timeout] of this.pendingWrites.entries()) {
      clearTimeout(timeout);
      this.flushSession(sessionId);
    }
    this.pendingWrites.clear();
    console.log('[SessionStore] Flushed all pending writes');
  }

  /**
   * Updates the session with a plan
   */
  setPlan(sessionId: string, plan: Plan): void {
    const session = this.loadSession(sessionId);
    if (!session) return;

    session.plan = plan;
    session.status = 'running';
    this.writeSession(session);
    console.log(`[SessionStore] Set plan for session ${sessionId}`);
  }

  /**
   * Updates the plan tasks (for dynamically added tasks like E2E fixes)
   */
  updatePlanTasks(sessionId: string, tasks: TaskDefinition[]): void {
    const session = this.loadSession(sessionId);
    if (!session?.plan) return;

    session.plan.tasks = tasks;
    this.writeSession(session);
    console.log(`[SessionStore] Updated plan tasks for session ${sessionId} (${tasks.length} tasks)`);
  }

  /**
   * Sets the exploration/analysis result from Phase 1
   */
  setExplorationResult(sessionId: string, result: ExplorationAnalysisResult): void {
    const session = this.loadSession(sessionId);
    if (!session) return;

    session.explorationResult = result;
    this.writeSession(session);
    console.log(`[SessionStore] Set exploration result for session ${sessionId}`);
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
   * Uses normalized scenario names for case-insensitive matching
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
    // Use normalized names for comparison
    const normalizedScenario = this.normalizeScenarioName(scenario);
    const existingIndex = testState.scenarios.findIndex(
      s => this.normalizeScenarioName(s.name) === normalizedScenario
    );

    if (existingIndex >= 0) {
      testState.scenarios[existingIndex] = { name: scenario, status, error };
    } else {
      testState.scenarios.push({ name: scenario, status, error });
    }

    testState.updatedAt = Date.now();
    this.writeSession(session);
  }

  /**
   * Updates all task states (called when tasks change)
   */
  updateTaskStates(sessionId: string, taskStates: TaskState[]): void {
    const session = this.loadSession(sessionId);
    if (!session) return;

    session.taskStates = taskStates;
    session.updatedAt = Date.now();
    this.writeSession(session);
  }

  /**
   * Updates the git branches for a session
   */
  updateGitBranches(sessionId: string, gitBranches: Record<string, string>): void {
    const session = this.loadSession(sessionId);
    if (!session) return;

    session.gitBranches = gitBranches;
    session.updatedAt = Date.now();
    this.writeSession(session);
    console.log(`[SessionStore] Updated git branches for session ${sessionId}`);
  }

  /**
   * Gets test states for a project
   */
  getTestStates(
    sessionId: string,
    project: string
  ): Array<{ name: string; status: TestScenarioStatus; error?: string }> | null {
    const session = this.loadSession(sessionId);
    
    if (!session) return null;

    return session.testStates[project]?.scenarios ?? null;
  }

  /**
   * Gets passed test scenarios for a project (for filtering on retry)
   * Returns normalized names for consistent matching
   */
  getPassedTests(sessionId: string, project: string): string[] {
    const testStates = this.getTestStates(sessionId, project);
    if (!testStates) return [];

    return testStates
      .filter(s => s.status === 'passed')
      .map(s => this.normalizeScenarioName(s.name));
  }

  /**
   * Gets passed tests with metadata to distinguish "no tests passed" from "no data exists"
   * Richer API for better state handling
   */
  getPassedTestsWithMeta(sessionId: string, project: string): {
    exists: boolean;
    passedTests: string[];
    totalTests: number;
  } {
    const testStates = this.getTestStates(sessionId, project);
    if (!testStates) {
      return { exists: false, passedTests: [], totalTests: 0 };
    }
    return {
      exists: true,
      passedTests: testStates
        .filter(s => s.status === 'passed')
        .map(s => this.normalizeScenarioName(s.name)),
      totalTests: testStates.length
    };
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
      // Clear from cache and cancel any pending writes
      this.sessionCache.delete(sessionId);
      const pendingTimeout = this.pendingWrites.get(sessionId);
      if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        this.pendingWrites.delete(sessionId);
      }

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
      gitBranches: persisted.gitBranches,
    };
  }
}
