import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * Environment detection for Tauri vs standalone modes
 */
export type RuntimeEnvironment = 'tauri' | 'development' | 'production';

/**
 * Centralized path resolver for cross-platform support
 * Handles both Tauri desktop app and standalone server modes
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

    // In Tauri, __dirname points to the binary location
    // In development, it's the src directory
    if (this.environment === 'development') {
      // Go up from dist/ or src/ to root
      return path.resolve(__dirname, '../..');
    }

    // In production/Tauri, use the directory containing the binary
    return path.dirname(process.execPath);
  }

  /**
   * Resolve standard paths based on environment
   */
  private resolvePaths(): {
    dataDir: string;
    logsDir: string;
    configDir: string;
    cacheDir: string;
  } {
    const platform = os.platform();
    const appName = 'Orchestrator';

    // Allow full override via environment variables
    if (process.env.ORCHESTRATOR_DATA_DIR) {
      const baseDir = process.env.ORCHESTRATOR_DATA_DIR;
      return {
        dataDir: baseDir,
        logsDir: path.join(baseDir, 'logs'),
        configDir: process.env.ORCHESTRATOR_CONFIG_DIR || path.join(baseDir, 'config'),
        cacheDir: process.env.ORCHESTRATOR_CACHE_DIR || path.join(baseDir, 'cache'),
      };
    }

    // In development mode, use local directories
    if (this.environment === 'development') {
      return {
        dataDir: path.join(this._orchestratorDir, '.sessions'),
        logsDir: path.join(this._orchestratorDir, '.logs'),
        configDir: this._orchestratorDir,
        cacheDir: path.join(this._orchestratorDir, '.cache'),
      };
    }

    // Production/Tauri mode - use standard OS paths
    switch (platform) {
      case 'darwin': // macOS
        return {
          dataDir: path.join(os.homedir(), 'Library', 'Application Support', appName, 'sessions'),
          logsDir: path.join(os.homedir(), 'Library', 'Logs', appName),
          configDir: path.join(os.homedir(), '.config', 'orchestrator'),
          cacheDir: path.join(os.homedir(), 'Library', 'Caches', appName),
        };

      case 'win32': // Windows
        const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        return {
          dataDir: path.join(appData, appName, 'sessions'),
          logsDir: path.join(localAppData, appName, 'logs'),
          configDir: path.join(appData, appName, 'config'),
          cacheDir: path.join(localAppData, appName, 'cache'),
        };

      default: // Linux and others
        const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
        const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
        const xdgCache = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
        return {
          dataDir: path.join(xdgData, 'orchestrator', 'sessions'),
          logsDir: path.join(xdgData, 'orchestrator', 'logs'),
          configDir: path.join(xdgConfig, 'orchestrator'),
          cacheDir: path.join(xdgCache, 'orchestrator'),
        };
    }
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

  // Helper methods for specific file paths

  /** Path to projects.config.json */
  getProjectsConfigPath(): string {
    // In development, use local config
    if (this.environment === 'development') {
      return path.join(this._orchestratorDir, 'projects.config.json');
    }

    // In Tauri/production, use user config directory
    return path.join(this._configDir, 'projects.json');
  }

  /**
   * Initialize config file in user directory if it doesn't exist
   * Copies from bundled config or creates default
   */
  initializeConfigIfNeeded(): void {
    if (this.environment === 'development') {
      return; // Development uses local config
    }

    const userConfigPath = this.getProjectsConfigPath();

    if (fs.existsSync(userConfigPath)) {
      return; // Config already exists
    }

    // Check for bundled config to copy
    const bundledConfigPath = path.join(this._orchestratorDir, 'projects.config.json');
    if (fs.existsSync(bundledConfigPath)) {
      const bundledConfig = fs.readFileSync(bundledConfigPath, 'utf-8');
      fs.mkdirSync(path.dirname(userConfigPath), { recursive: true });
      fs.writeFileSync(userConfigPath, bundledConfig);
      console.log(`[PathResolver] Copied config to: ${userConfigPath}`);
      return;
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
    if (this.environment === 'development') {
      return path.join(this._orchestratorDir, 'web', 'dist');
    }
    // In Tauri/production, web files are bundled
    return path.join(this._orchestratorDir, 'web', 'dist');
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

export function isTauriEnvironment(): boolean {
  return getPaths().isTauri;
}

export function isDevelopmentEnvironment(): boolean {
  return getPaths().isDevelopment;
}

export function initializeConfigIfNeeded(): void {
  return getPaths().initializeConfigIfNeeded();
}
