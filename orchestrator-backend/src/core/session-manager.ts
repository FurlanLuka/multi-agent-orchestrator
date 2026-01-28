import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Config, Session, Plan, HookConfig, PersistedSession, SessionSummary, FullSessionData, TaskDefinition } from '@aio/types';
import { SessionStore } from './session-store';
import { getHookTemplatesDir } from '../config/paths';

export class SessionManager {
  private config: Config;
  private currentSession: Session | null = null;
  private sessionStore: SessionStore;

  constructor(config: Config, sessionStore: SessionStore) {
    this.config = config;
    this.sessionStore = sessionStore;
  }

  /**
   * Expands ~ to home directory
   */
  private expandPath(p: string): string {
    if (p.startsWith('~')) {
      return p.replace('~', process.env.HOME || '');
    }
    return p;
  }

  /**
   * Creates a new orchestration session
   */
  createSession(feature: string, projects: string[]): Session {
    const id = randomUUID().slice(0, 8);
    const session: Session = {
      id,
      startedAt: Date.now(),
      feature,
      projects
    };

    // Persist to SessionStore
    this.sessionStore.createSession(id, feature, projects);

    // Create session directories in each project
    for (const projectName of projects) {
      const projectConfig = this.config.projects[projectName];
      if (!projectConfig) {
        console.warn(`Unknown project: ${projectName}, skipping`);
        continue;
      }

      const projectPath = this.expandPath(projectConfig.path);
      const sessionDir = path.join(projectPath, '.aio', `session_${id}`);

      // Create directories
      fs.mkdirSync(path.join(sessionDir, 'outbox'), { recursive: true });
      fs.mkdirSync(path.join(sessionDir, 'logs'), { recursive: true });

      // Set up Claude Code hooks via .claude/settings.json
      this.ensureHooksConfigured(projectPath);

      // Copy hook scripts to project's .claude/hooks/ directory
      this.ensureHookScripts(projectPath);

      // Create initial status file
      fs.writeFileSync(
        path.join(sessionDir, 'status.json'),
        JSON.stringify({
          status: 'IDLE',
          message: 'Initialized',
          updated_at: Date.now()
        }, null, 2)
      );

      // Create metadata
      fs.writeFileSync(
        path.join(sessionDir, 'metadata.json'),
        JSON.stringify({
          session_id: id,
          project: projectName,
          started_at: session.startedAt,
          feature,
          orchestrator_pid: process.pid
        }, null, 2)
      );

      console.log(`[SessionManager] Created session directory for ${projectName}: ${sessionDir}`);
    }

    // Register session globally (legacy - kept for compatibility)
    const globalDir = '/tmp/orchestrator/sessions';
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, 'active.json'),
      JSON.stringify(session, null, 2)
    );

    // Create approval queue directories
    fs.mkdirSync('/tmp/orchestrator/approval_queue/pending', { recursive: true });
    fs.mkdirSync('/tmp/orchestrator/approval_queue/responses', { recursive: true });

    this.currentSession = session;
    console.log(`[SessionManager] Created session: ${id} for feature: ${feature}`);

    return session;
  }

  /**
   * Ensures .claude/settings.json has hook configuration
   * This tells Claude Code which hooks to call
   */
  private ensureHooksConfigured(projectPath: string): void {
    const claudeDir = path.join(projectPath, '.claude');
    const settingsPath = path.join(claudeDir, 'settings.json');

    // Create .claude directory if it doesn't exist
    fs.mkdirSync(claudeDir, { recursive: true });

    // Define hook configuration (aio- prefix identifies AIO Orchestrator hooks)
    const hookConfig: HookConfig = {
      hooks: {
        Stop: [
          { hooks: [{ type: 'command', command: '.claude/hooks/aio-stop.sh' }] }
        ],
        Notification: [
          { hooks: [{ type: 'command', command: '.claude/hooks/aio-notification.sh' }] }
        ],
        PostToolUse: [
          { matcher: '', hooks: [{ type: 'command', command: '.claude/hooks/aio-postToolUse.sh' }] }
        ],
        PreToolUse: [
          { matcher: '', hooks: [{ type: 'command', command: '.claude/hooks/aio-preToolUse.sh' }] }
        ],
        SubagentStop: [
          { hooks: [{ type: 'command', command: '.claude/hooks/aio-subagentStop.sh' }] }
        ]
      }
    };

    // Merge with existing settings if present
    let existingSettings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      try {
        existingSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      } catch (err) {
        console.warn(`[SessionManager] Failed to parse existing settings.json: ${err}`);
      }
    }

    // Merge hooks (keep existing hooks, add our orchestrator hooks)
    const mergedSettings = {
      ...existingSettings,
      hooks: {
        ...(existingSettings.hooks as Record<string, unknown> || {}),
        ...hookConfig.hooks
      }
    };

    fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2));
    console.log(`[SessionManager] Configured hooks in ${settingsPath}`);
  }

  /**
   * Copies hook scripts from hook-templates/ to project's .claude/hooks/
   */
  private ensureHookScripts(projectPath: string): void {
    const hooksDir = path.join(projectPath, '.claude', 'hooks');
    const templatesDir = getHookTemplatesDir();

    // Create hooks directory
    fs.mkdirSync(hooksDir, { recursive: true });

    // List of hooks to copy (aio- prefix identifies AIO Orchestrator hooks)
    const hooks = ['aio-stop.sh', 'aio-notification.sh', 'aio-postToolUse.sh', 'aio-preToolUse.sh', 'aio-subagentStop.sh'];

    for (const hook of hooks) {
      const src = path.join(templatesDir, hook);
      const dest = path.join(hooksDir, hook);

      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        fs.chmodSync(dest, '755');
      } else {
        console.warn(`[SessionManager] Hook template not found: ${src}`);
      }
    }

    console.log(`[SessionManager] Deployed hook scripts to ${hooksDir}`);
  }

  /**
   * Attaches an approved plan to the current session
   */
  setPlan(plan: Plan): void {
    if (!this.currentSession) {
      throw new Error('No active session');
    }
    this.currentSession.plan = plan;

    // Persist to SessionStore
    this.sessionStore.setPlan(this.currentSession.id, plan);

    // Update global registry (legacy)
    const globalPath = '/tmp/orchestrator/sessions/active.json';
    fs.writeFileSync(globalPath, JSON.stringify(this.currentSession, null, 2));
  }

  /**
   * Adds a dynamic task (e.g., E2E fix) to the current session's plan.
   * Returns the task index.
   */
  addTask(task: TaskDefinition): number {
    const session = this.getCurrentSession();
    if (!session?.plan) {
      throw new Error('No active session or plan');
    }

    session.plan.tasks.push(task);
    const taskIndex = session.plan.tasks.length - 1;

    // Persist to session store
    this.sessionStore.updatePlanTasks(session.id, session.plan.tasks);

    console.log(`[SessionManager] Added dynamic task #${taskIndex}: ${task.name} (${task.project})`);

    return taskIndex;
  }

  /**
   * Gets the current session
   */
  getCurrentSession(): Session | null {
    return this.currentSession;
  }

  /**
   * Gets the session directory for a project
   */
  getSessionDir(project: string): string | null {
    if (!this.currentSession) return null;

    const projectConfig = this.config.projects[project];
    if (!projectConfig) return null;

    const projectPath = this.expandPath(projectConfig.path);
    return path.join(projectPath, '.aio', `session_${this.currentSession.id}`);
  }

  /**
   * Gets the project path (expanded)
   */
  getProjectPath(project: string): string | null {
    const projectConfig = this.config.projects[project];
    if (!projectConfig) return null;
    return this.expandPath(projectConfig.path);
  }

  /**
   * Cleans up session directories
   */
  cleanupSession(): void {
    if (!this.currentSession) return;

    for (const projectName of this.currentSession.projects) {
      const sessionDir = this.getSessionDir(projectName);
      if (sessionDir && fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`[SessionManager] Cleaned up: ${sessionDir}`);
      }
    }

    // Remove global registry
    const globalPath = '/tmp/orchestrator/sessions/active.json';
    if (fs.existsSync(globalPath)) {
      fs.unlinkSync(globalPath);
    }

    this.currentSession = null;
  }

  /**
   * Lists all projects in config
   */
  listProjects(): string[] {
    return Object.keys(this.config.projects);
  }

  /**
   * Gets project config
   */
  getProjectConfig(project: string) {
    return this.config.projects[project];
  }

  /**
   * Gets the SessionStore instance
   */
  getSessionStore(): SessionStore {
    return this.sessionStore;
  }

  /**
   * Lists all available sessions
   */
  listSessions(): SessionSummary[] {
    return this.sessionStore.listSessions();
  }

  /**
   * Loads a previous session
   * Returns full session data including logs and chat history
   */
  loadSession(sessionId: string): FullSessionData | null {
    const fullData = this.sessionStore.getFullSessionData(sessionId);
    if (!fullData) return null;

    // Convert persisted session to Session type
    this.currentSession = this.sessionStore.toSession(fullData.session);

    // Set up project directories if they don't exist (for resuming)
    for (const projectName of this.currentSession.projects) {
      const projectConfig = this.config.projects[projectName];
      if (!projectConfig) continue;

      const projectPath = this.expandPath(projectConfig.path);
      const sessionDir = path.join(projectPath, '.aio', `session_${sessionId}`);

      // Create directories if they don't exist
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(path.join(sessionDir, 'outbox'), { recursive: true });
        fs.mkdirSync(path.join(sessionDir, 'logs'), { recursive: true });
      }

      // Ensure hooks are configured
      this.ensureHooksConfigured(projectPath);
      this.ensureHookScripts(projectPath);
    }

    // Update global registry
    const globalDir = '/tmp/orchestrator/sessions';
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, 'active.json'),
      JSON.stringify(this.currentSession, null, 2)
    );

    console.log(`[SessionManager] Loaded session: ${sessionId}`);
    return fullData;
  }

  /**
   * Marks the current session as completed and clears it as active
   */
  markSessionCompleted(): void {
    if (!this.currentSession) return;

    // Mark as completed in the store
    this.sessionStore.markCompleted(this.currentSession.id);

    // Remove global active registry
    const globalPath = '/tmp/orchestrator/sessions/active.json';
    if (fs.existsSync(globalPath)) {
      fs.unlinkSync(globalPath);
    }

    console.log(`[SessionManager] Session ${this.currentSession.id} marked as completed`);

    // Clear current session reference
    this.currentSession = null;
  }

  /**
   * Marks the current session as interrupted and clears it as active
   */
  markSessionInterrupted(): void {
    if (!this.currentSession) return;

    // Mark as interrupted in the store
    this.sessionStore.markInterrupted(this.currentSession.id);

    // Remove global active registry
    const globalPath = '/tmp/orchestrator/sessions/active.json';
    if (fs.existsSync(globalPath)) {
      fs.unlinkSync(globalPath);
    }

    console.log(`[SessionManager] Session ${this.currentSession.id} marked as interrupted`);

    // Clear current session reference
    this.currentSession = null;
  }

  /**
   * Deletes a session
   */
  deleteSession(sessionId: string): boolean {
    return this.sessionStore.deleteSession(sessionId);
  }

  /**
   * Clears the current session reference without marking it completed/interrupted.
   * Used for starting a new session flow.
   */
  clearCurrentSession(): void {
    this.currentSession = null;
  }
}
