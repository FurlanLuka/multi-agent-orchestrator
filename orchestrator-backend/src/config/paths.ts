import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * Environment detection for Tauri vs standalone modes
 */
export type RuntimeEnvironment = 'tauri' | 'development' | 'production';

/**
 * App configuration constants
 */
const APP_NAME = 'aio-config';

/**
 * Centralized path resolver for cross-platform support
 * Handles both Tauri desktop app and standalone server modes
 *
 * All platforms use ~/.aio-config/ for consistency
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
    // Check for Tauri-specific environment variable
    if (process.env.TAURI_ENV || process.env.ORCHESTRATOR_TAURI === 'true') {
      return 'tauri';
    }

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

    // In production/Tauri, use the directory containing the binary
    return path.dirname(process.execPath);
  }

  /**
   * Resolve standard paths based on environment
   * All platforms (including dev) use ~/.aio-config/ for consistency
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

    // All modes use ~/.aio-config/ for consistency
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

  /** Is running in Tauri desktop app */
  get isTauri(): boolean {
    return this.environment === 'tauri';
  }

  /** Is running in development mode */
  get isDevelopment(): boolean {
    return this.environment === 'development';
  }

  // Setup directories

  /** Directory containing bundled setup files */
  get setupDir(): string {
    if (this.environment === 'tauri') {
      // In Tauri: process.execPath = .../Contents/MacOS/aio-orchestrator-backend
      // Resources are at .../Contents/Resources/setup (mapped via tauri.conf.json)
      return path.join(path.dirname(process.execPath), '..', 'Resources', 'setup');
    }
    // Development: __dirname is dist/config, setup is at orchestrator-backend/setup
    return path.join(__dirname, '..', '..', 'setup');
  }

  /** Directory containing hooks scripts */
  get hooksDir(): string {
    return path.join(this.setupDir, 'hooks');
  }

  /** Directory containing hook templates for Claude */
  get hookTemplatesDir(): string {
    return path.join(this.setupDir, 'hook-templates');
  }

  /** Directory containing project templates */
  get projectTemplatesDir(): string {
    return path.join(this.setupDir, 'project-templates');
  }

  // Helper methods for specific file paths

  /** Path to projects.json config file */
  getProjectsConfigPath(): string {
    // Always use ~/.aio-config/projects.json
    return path.join(this._configDir, 'projects.json');
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

  /** Path to web dist directory (static frontend files) */
  getWebDistPath(): string {
    // Both dev and production: __dirname is dist/config
    // Web dist is at orchestrator-web/dist (sibling to orchestrator-backend)
    // In pkg, bundled from ../orchestrator-web/dist/**/* so same relative path works
    return path.join(__dirname, '..', '..', '..', 'orchestrator-web', 'dist');
  }

  /** Get session directory for a specific session */
  getSessionDir(sessionId: string): string {
    return path.join(this._dataDir, sessionId);
  }

  /** Get log file path for a specific project and type */
  getLogPath(sessionId: string, project: string, type: string): string {
    return path.join(this.getSessionDir(sessionId), 'logs', `${project}_${type}.jsonl`);
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

export function getWebDistPath(): string {
  return getPaths().getWebDistPath();
}

export function getSetupDir(): string {
  return getPaths().setupDir;
}

export function getHooksDir(): string {
  return getPaths().hooksDir;
}

export function getHookTemplatesDir(): string {
  return getPaths().hookTemplatesDir;
}

export function getProjectTemplatesDir(): string {
  return getPaths().projectTemplatesDir;
}

export function getMcpDir(): string {
  return path.join(getPaths().cacheDir, 'mcp');
}

/**
 * Get the path to the MCP permission server in setup directory
 */
export function getBundledMcpServerPath(): string {
  return path.join(getSetupDir(), 'mcp', 'permission-server.js');
}

/**
 * Get the path where the MCP permission server should be copied to
 */
export function getExtractedMcpServerPath(): string {
  return path.join(getMcpDir(), 'permission-server.js');
}

/**
 * Ensure the MCP permission server is copied to the cache directory.
 * We copy it so that node can execute it (Tauri resources are read-only).
 */
export function ensureMcpServerExtracted(): string {
  const bundledPath = getBundledMcpServerPath();
  const extractedPath = getExtractedMcpServerPath();
  const mcpDir = getMcpDir();

  // Ensure MCP directory exists
  if (!fs.existsSync(mcpDir)) {
    fs.mkdirSync(mcpDir, { recursive: true });
  }

  // Check if source file exists
  if (!fs.existsSync(bundledPath)) {
    throw new Error(`MCP permission server not found at: ${bundledPath}. Check that Tauri resources are properly bundled.`);
  }

  // Check if we need to copy/update the file
  let needsCopy = !fs.existsSync(extractedPath);

  if (!needsCopy) {
    // Compare file contents to see if update is needed
    try {
      const bundledContent = fs.readFileSync(bundledPath, 'utf-8');
      const extractedContent = fs.readFileSync(extractedPath, 'utf-8');
      needsCopy = bundledContent !== extractedContent;
    } catch {
      needsCopy = true;
    }
  }

  if (needsCopy) {
    try {
      const content = fs.readFileSync(bundledPath, 'utf-8');
      fs.writeFileSync(extractedPath, content, { mode: 0o755 });
      console.log(`[PathResolver] Copied MCP permission server to: ${extractedPath}`);
    } catch (err) {
      console.error(`[PathResolver] Failed to copy MCP server:`, err);
      throw new Error(`Failed to copy MCP permission server: ${err}`);
    }
  }

  return extractedPath;
}

export function isTauriEnvironment(): boolean {
  return getPaths().isTauri;
}

export function isDevelopmentEnvironment(): boolean {
  return getPaths().isDevelopment;
}

export function initializeConfigIfNeeded(): void {
  return getPaths().initializeConfigIfNeeded();
}
