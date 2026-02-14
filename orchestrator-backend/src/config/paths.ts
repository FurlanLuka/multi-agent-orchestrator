import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { VERSION } from '../version';

/**
 * Environment detection for development vs production modes
 */
export type RuntimeEnvironment = 'development' | 'production';

/**
 * App configuration constants
 */
const APP_NAME = 'orchy-config';

/**
 * Centralized path resolver for cross-platform support
 * Handles both development and production (compiled binary) modes
 *
 * All platforms use ~/.orchy-config/ for consistency
 */
export class PathResolver {
  private static instance: PathResolver;
  private environment: RuntimeEnvironment;
  private _dataDir: string;
  private _logsDir: string;
  private _configDir: string;
  private _cacheDir: string;
  private _orchestratorDir: string;

  private constructor() {
    this.environment = this.detectEnvironment();
    this._orchestratorDir = this.resolveOrchestratorDir();

    const paths = this.resolvePaths();
    this._dataDir = paths.dataDir;
    this._logsDir = paths.logsDir;
    this._configDir = paths.configDir;
    this._cacheDir = paths.cacheDir;

    // Ensure directories exist
    this.ensureDirectories();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PathResolver {
    if (!PathResolver.instance) {
      PathResolver.instance = new PathResolver();
    }
    return PathResolver.instance;
  }

  /**
   * Reset singleton (for testing)
   */
  static reset(): void {
    PathResolver.instance = undefined as any;
  }

  /**
   * Detect runtime environment
   */
  private detectEnvironment(): RuntimeEnvironment {
    // Check for development mode
    if (process.env.NODE_ENV === 'development' || process.env.ORCHESTRATOR_DEV === 'true') {
      return 'development';
    }

    return 'production';
  }

  /**
   * Resolve the orchestrator installation directory
   */
  private resolveOrchestratorDir(): string {
    // Allow override via environment variable
    if (process.env.ORCHESTRATOR_DIR) {
      return path.resolve(process.env.ORCHESTRATOR_DIR);
    }

    // In development, resolve to monorepo root
    if (this.environment === 'development') {
      const cwd = process.cwd();
      // If running from orchestrator-backend (via npm -w), go up one level
      if (cwd.endsWith('orchestrator-backend')) {
        return path.dirname(cwd);
      }
      return cwd;
    }

    // In production, use the directory containing the binary
    return path.dirname(process.execPath);
  }

  /**
   * Resolve standard paths based on environment
   * All platforms (including dev) use ~/.orchy-config/ for consistency
   */
  private resolvePaths(): {
    dataDir: string;
    logsDir: string;
    configDir: string;
    cacheDir: string;
  } {
    const homeDir = os.homedir();

    // Allow full override via environment variables
    if (process.env.ORCHESTRATOR_DATA_DIR) {
      const baseDir = process.env.ORCHESTRATOR_DATA_DIR;
      return {
        dataDir: path.join(baseDir, 'sessions'),
        logsDir: path.join(baseDir, 'logs'),
        configDir: process.env.ORCHESTRATOR_CONFIG_DIR || baseDir,
        cacheDir: process.env.ORCHESTRATOR_CACHE_DIR || path.join(baseDir, 'cache'),
      };
    }

    // All modes use ~/.orchy-config/ for consistency
    const baseDir = path.join(homeDir, `.${APP_NAME}`);
    return {
      dataDir: path.join(baseDir, 'sessions'),
      logsDir: path.join(baseDir, 'logs'),
      configDir: baseDir,
      cacheDir: path.join(baseDir, 'cache'),
    };
  }

  /**
   * Ensure all required directories exist
   */
  private ensureDirectories(): void {
    const dirs = [this._dataDir, this._logsDir, this._configDir, this._cacheDir];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  // Getters for paths

  /** Directory for session data */
  get sessionsDir(): string {
    return this._dataDir;
  }

  /** Directory for log files */
  get logsDir(): string {
    return this._logsDir;
  }

  /** Directory for configuration files */
  get configDir(): string {
    return this._configDir;
  }

  /** Directory for cache files */
  get cacheDir(): string {
    return this._cacheDir;
  }

  /** Root orchestrator directory (where the app lives) */
  get orchestratorDir(): string {
    return this._orchestratorDir;
  }

  /** Current runtime environment */
  get env(): RuntimeEnvironment {
    return this.environment;
  }

  /** Is running in development mode */
  get isDevelopment(): boolean {
    return this.environment === 'development';
  }

  /**
   * Get the bundled setup directory path (inside pkg virtual filesystem or dev)
   * This is where setup files are bundled, not where they're extracted to
   */
  private get bundledSetupDir(): string {
    if (this.isDevelopment) {
      // Development: __dirname is dist/config, setup is at orchestrator-backend/setup
      return path.join(__dirname, '..', '..', 'setup');
    }
    // Production (pkg): setup is bundled at /snapshot/orchestrator-backend/setup
    // pkg uses __dirname to reference bundled assets
    return path.join(__dirname, '..', '..', 'setup');
  }

  /**
   * Directory where setup files are extracted for use
   * Setup files need to be on real filesystem for Claude to execute hooks/scripts
   */
  get setupDir(): string {
    if (this.isDevelopment) {
      // Development: use setup directly from source
      return path.join(__dirname, '..', '..', 'setup');
    }
    // Production: extract to ~/.orchy-config/setup/
    return path.join(this._configDir, 'setup');
  }

  /** Directory containing project templates */
  get projectTemplatesDir(): string {
    return path.join(this.setupDir, 'project-templates');
  }

  /** Directory containing design templates (theme-template.html, etc.) */
  get designTemplatesDir(): string {
    return path.join(this.setupDir, 'design-templates');
  }

  // Helper methods for specific file paths

  /** Path to projects.json config file */
  getProjectsConfigPath(): string {
    // Always use ~/.orchy-config/projects.json
    return path.join(this._configDir, 'projects.json');
  }

  /**
   * Get project session directory for a specific session and project.
   * This is where all project-specific session data is stored centrally.
   * Path: ~/.orchy-config/sessions/{sessionId}/projects/{projectName}/
   */
  getProjectSessionDir(sessionId: string, projectName: string): string {
    return path.join(this._dataDir, sessionId, 'projects', projectName);
  }

  /**
   * Ensure project session directory exists and return the path.
   * Creates: ~/.orchy-config/sessions/{sessionId}/projects/{projectName}/
   * With subdirectories: outbox/, logs/
   */
  ensureProjectSessionDir(sessionId: string, projectName: string): string {
    const projectDir = this.getProjectSessionDir(sessionId, projectName);
    const outboxDir = path.join(projectDir, 'outbox');
    const logsDir = path.join(projectDir, 'logs');

    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    if (!fs.existsSync(outboxDir)) {
      fs.mkdirSync(outboxDir, { recursive: true });
    }
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    return projectDir;
  }

  /**
   * Initialize config file if it doesn't exist
   * Creates default config
   */
  initializeConfigIfNeeded(): void {
    const userConfigPath = this.getProjectsConfigPath();

    if (fs.existsSync(userConfigPath)) {
      return; // Config already exists
    }

    // Create default config
    const defaultConfig = {
      projects: {},
      defaults: {
        approvalTimeout: 300000,
        maxRestarts: 3,
        debugEscalationTime: 60000
      }
    };
    fs.mkdirSync(path.dirname(userConfigPath), { recursive: true });
    fs.writeFileSync(userConfigPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`[PathResolver] Created default config at: ${userConfigPath}`);
  }

  /**
   * Path to web dist directory (static frontend files)
   * In production, this is inside pkg's virtual filesystem
   */
  getWebDistPath(): string {
    if (this.isDevelopment) {
      // Dev mode: relative to backend dist
      const devPath = path.join(__dirname, '..', '..', '..', 'orchestrator-web', 'dist');
      if (fs.existsSync(devPath)) {
        console.log(`[PathResolver] Found web dist at: ${devPath}`);
        return devPath;
      }
    }

    // Production (pkg): web-dist is bundled at /snapshot/orchestrator-backend/web-dist
    // pkg intercepts fs operations for paths starting with /snapshot/
    const pkgPath = path.join(__dirname, '..', '..', 'web-dist');
    console.log(`[PathResolver] Using embedded web dist at: ${pkgPath}`);
    return pkgPath;
  }

  /** Get session directory for a specific session */
  getSessionDir(sessionId: string): string {
    return path.join(this._dataDir, sessionId);
  }

  /** Get log file path for a specific project and type */
  getLogPath(sessionId: string, project: string, type: string): string {
    return path.join(this.getSessionDir(sessionId), 'logs', `${project}_${type}.jsonl`);
  }

  /**
   * Ensure setup files are extracted to the real filesystem.
   * Called on startup in production mode.
   *
   * Always re-syncs to ensure the latest setup files are used.
   * This handles cases where the user updates Orchy but the version number
   * hasn't changed (e.g., during development or quick patches).
   */
  ensureSetupExtracted(): void {
    if (this.isDevelopment) {
      return; // No extraction needed in development - use source directly
    }

    const extractedSetupDir = this.setupDir;
    const bundledSetupDir = this.bundledSetupDir;

    // Always sync setup files to ensure they're up to date
    // This handles updates where version hasn't changed
    console.log(`[PathResolver] Syncing setup files to: ${extractedSetupDir}`);

    // Ensure setup directory exists
    if (!fs.existsSync(extractedSetupDir)) {
      fs.mkdirSync(extractedSetupDir, { recursive: true });
    }

    // Sync files (copy newer files, remove deleted files)
    this.syncDirRecursive(bundledSetupDir, extractedSetupDir);

    // Make scripts executable
    this.makeScriptsExecutable(extractedSetupDir);

    // Write version file for reference
    const versionFile = path.join(extractedSetupDir, '.version');
    const currentVersion = VERSION;
    fs.writeFileSync(versionFile, currentVersion);

    console.log(`[PathResolver] Setup files synced successfully`);
  }

  /**
   * Recursively sync directory contents (copy new/updated, remove deleted).
   * More efficient than full remove + copy as it only updates changed files.
   */
  private syncDirRecursive(src: string, dest: string): void {
    if (!fs.existsSync(src)) {
      return;
    }

    // Get list of files in source
    const srcEntries = fs.readdirSync(src, { withFileTypes: true });
    const srcNames = new Set(srcEntries.map(e => e.name));

    // Get list of files in destination (if exists)
    const destNames = new Set<string>();
    if (fs.existsSync(dest)) {
      const destEntries = fs.readdirSync(dest, { withFileTypes: true });
      for (const entry of destEntries) {
        destNames.add(entry.name);
      }
    } else {
      fs.mkdirSync(dest, { recursive: true });
    }

    // Process each source entry
    for (const entry of srcEntries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        // Recurse into subdirectory
        this.syncDirRecursive(srcPath, destPath);
      } else {
        // Copy file if different or missing
        let needsCopy = !fs.existsSync(destPath);
        if (!needsCopy) {
          try {
            const srcContent = fs.readFileSync(srcPath);
            const destContent = fs.readFileSync(destPath);
            needsCopy = !srcContent.equals(destContent);
          } catch {
            needsCopy = true;
          }
        }
        if (needsCopy) {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }

    // Remove files in dest that don't exist in src (cleanup old files)
    for (const name of destNames) {
      if (!srcNames.has(name) && name !== '.version') {
        const destPath = path.join(dest, name);
        try {
          const stat = fs.statSync(destPath);
          if (stat.isDirectory()) {
            fs.rmSync(destPath, { recursive: true });
          } else {
            fs.unlinkSync(destPath);
          }
        } catch {
          // Ignore errors during cleanup
        }
      }
    }
  }

  /**
   * Recursively copy directory contents
   */
  private copyDirRecursive(src: string, dest: string): void {
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        this.copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Make shell scripts executable
   */
  private makeScriptsExecutable(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        this.makeScriptsExecutable(fullPath);
      } else if (entry.name.endsWith('.sh') || entry.name.endsWith('.js')) {
        try {
          fs.chmodSync(fullPath, 0o755);
        } catch (err) {
          // Ignore chmod errors on Windows
        }
      }
    }
  }
}

// Export singleton accessor
export function getPaths(): PathResolver {
  return PathResolver.getInstance();
}

// Export convenience functions
export function getSessionsDir(): string {
  return getPaths().sessionsDir;
}

export function getLogsDir(): string {
  return getPaths().logsDir;
}

export function getConfigDir(): string {
  return getPaths().configDir;
}

export function getCacheDir(): string {
  return getPaths().cacheDir;
}

export function getProjectsConfigPath(): string {
  return getPaths().getProjectsConfigPath();
}

export function getWorkspacesConfigPath(): string {
  return path.join(getPaths().configDir, 'workspaces.json');
}

export function getWebDistPath(): string {
  return getPaths().getWebDistPath();
}

export function getSetupDir(): string {
  return getPaths().setupDir;
}

export function getDesignTemplatesDir(): string {
  return getPaths().designTemplatesDir;
}

export function getProjectTemplatesDir(): string {
  return getPaths().projectTemplatesDir;
}

// MCP servers now run in-process via HTTP transport — no file extraction needed.

/**
 * Get project session directory for a specific session and project.
 * Returns: ~/.orchy-config/sessions/{sessionId}/projects/{projectName}/
 */
export function getProjectSessionDir(sessionId: string, projectName: string): string {
  return getPaths().getProjectSessionDir(sessionId, projectName);
}

/**
 * Ensure project session directory exists and return the path.
 */
export function ensureProjectSessionDir(sessionId: string, projectName: string): string {
  return getPaths().ensureProjectSessionDir(sessionId, projectName);
}

export function isDevelopmentEnvironment(): boolean {
  return getPaths().isDevelopment;
}

/**
 * Get design session directory for a specific session.
 * Returns: ~/.orchy-config/design-sessions/{sessionId}/
 * Note: This is separate from saved designs which go to ~/.orchy-config/designs/
 */
export function getDesignSessionDir(sessionId: string): string {
  return path.join(getConfigDir(), 'design-sessions', sessionId);
}

/**
 * Ensure design session directory exists and return the path.
 * Creates: ~/.orchy-config/design-sessions/{sessionId}/
 */
export function ensureDesignSessionDir(sessionId: string): string {
  const sessionDir = getDesignSessionDir(sessionId);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }
  return sessionDir;
}

/**
 * Get path to a specific artifact in a design session.
 * Returns: ~/.orchy-config/design-sessions/{sessionId}/{artifactName}
 */
export function getDesignArtifactPath(sessionId: string, artifactName: string): string {
  return path.join(getDesignSessionDir(sessionId), artifactName);
}

export function initializeConfigIfNeeded(): void {
  return getPaths().initializeConfigIfNeeded();
}

/**
 * Get path to planner permissions config file.
 * Returns: ~/.orchy-config/planner-permissions.json
 */
export function getPlannerPermissionsPath(): string {
  return path.join(getPaths().configDir, 'planner-permissions.json');
}

/**
 * Initialize planner permissions file if it doesn't exist.
 * Creates default permissions for read-only codebase exploration.
 */
export function initializePlannerPermissionsIfNeeded(): void {
  const plannerPermissionsPath = getPlannerPermissionsPath();

  if (fs.existsSync(plannerPermissionsPath)) {
    return; // Already exists
  }

  const defaultPlannerPermissions = {
    allow: [
      // Read tools for codebase exploration
      'Read',
      'Glob',
      'Grep',
      // Bash commands for directory listing
      'Bash(ls *)',
      'Bash(find *)',
      // Web browsing
      'WebFetch',
      'WebSearch',
      // Orchestrator MCP tools
      'mcp__orchestrator-planning__ask_planning_question',
      'mcp__orchestrator-planning__submit_refined_feature',
      'mcp__orchestrator-planning__submit_technical_spec',
      'mcp__orchestrator-planning__submit_plan_for_approval',
      'mcp__orchestrator-planning__exploration_complete',
      'mcp__orchestrator-planning__request_user_input',
      'mcp__orchestrator-planning__task_complete',
      'mcp__orchestrator-planning__check_deployment_available',
      'mcp__orchestrator-planning__list_deployment_providers',
      'mcp__orchestrator-planning__get_provider_requirements',
      'mcp__orchestrator-planning__save_deployment_state',
    ]
  };

  fs.writeFileSync(plannerPermissionsPath, JSON.stringify(defaultPlannerPermissions, null, 2));
  console.log(`[PathResolver] Created default planner permissions at: ${plannerPermissionsPath}`);
}

/**
 * Ensure setup files are extracted (call on startup)
 */
export function ensureSetupExtracted(): void {
  return getPaths().ensureSetupExtracted();
}
