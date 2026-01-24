import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Config, ProjectConfig, ProjectTemplate, ProjectTemplateConfig } from '../types';

export interface AddProjectOptions {
  name: string;
  path: string;
  devServer?: {
    command: string;
    readyPattern: string;
    env?: Record<string, string>;
    port?: number;
  };
  buildCommand?: string;
  hasE2E?: boolean;
  e2eInstructions?: string;  // Custom E2E testing instructions (markdown)
  dependencyInstall?: boolean;
}

export interface CreateFromTemplateOptions {
  name: string;
  targetPath: string;
  template: ProjectTemplate;
  dependencyInstall?: boolean;
}

// Template configurations
const TEMPLATES: Record<ProjectTemplate, ProjectTemplateConfig> = {
  'vite-frontend': {
    name: 'vite-frontend',
    displayName: 'Vite + React Frontend',
    description: 'React frontend with Vite, TypeScript, and Playwright MCP for E2E testing',
    devServer: {
      command: 'npm run dev',
      readyPattern: 'Local:.*http|ready in'
    },
    buildCommand: 'npm run build',
    defaultPort: 5173
  },
  'nestjs-backend': {
    name: 'nestjs-backend',
    displayName: 'NestJS Backend',
    description: 'NestJS backend with TypeScript and curl-based E2E testing',
    devServer: {
      command: 'npm run start:dev',
      readyPattern: 'Nest application successfully started|listening on|Application is running'
    },
    buildCommand: 'npm run build',
    defaultPort: 3000
  }
};

/**
 * Manages project configuration and setup
 */
export class ProjectManager extends EventEmitter {
  private configPath: string;
  private config: Config;
  private orchestratorDir: string;

  constructor(configPath: string, config: Config, orchestratorDir: string) {
    super();
    this.configPath = configPath;
    this.config = config;
    this.orchestratorDir = orchestratorDir;
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
   * Ensures an entry exists in .gitignore (creates file if needed)
   */
  private ensureGitignoreEntry(projectPath: string, entry: string): void {
    const gitignorePath = path.join(projectPath, '.gitignore');

    let content = '';
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf-8');
      // Check if entry already exists (as whole line)
      const lines = content.split('\n').map(l => l.trim());
      if (lines.includes(entry)) {
        return; // Already present
      }
    }

    // Append entry with newline
    const newContent = content.endsWith('\n') || content === ''
      ? `${content}${entry}\n`
      : `${content}\n${entry}\n`;

    fs.writeFileSync(gitignorePath, newContent);
    console.log(`[ProjectManager] Added '${entry}' to .gitignore`);
  }

  /**
   * Gets all configured projects
   */
  getProjects(): Record<string, ProjectConfig> {
    return this.config.projects;
  }

  /**
   * Gets a specific project config
   */
  getProject(name: string): ProjectConfig | undefined {
    return this.config.projects[name];
  }

  /**
   * Adds a new project to the configuration
   */
  async addProject(options: AddProjectOptions): Promise<void> {
    const { name, path: projectPath, devServer, buildCommand, hasE2E, e2eInstructions, dependencyInstall } = options;

    // Validate project name
    if (this.config.projects[name]) {
      throw new Error(`Project "${name}" already exists`);
    }

    // Expand and validate path
    const expandedPath = this.expandPath(projectPath);
    if (!fs.existsSync(expandedPath)) {
      throw new Error(`Path does not exist: ${expandedPath}`);
    }

    // Create project config with defaults
    const projectConfig: ProjectConfig = {
      path: projectPath, // Keep original path format (with ~)
      devServer: devServer ? {
        command: devServer.command,
        readyPattern: devServer.readyPattern,
        env: devServer.env || {},
        port: devServer.port
      } : {
        command: 'npm run dev',
        readyPattern: 'ready|listening|started|compiled',
        env: {}
      },
      buildCommand: buildCommand || 'npm run build',
      hasE2E: hasE2E ?? false,
      e2eInstructions: e2eInstructions
    };

    // Add to config
    this.config.projects[name] = projectConfig;

    // Save config
    this.saveConfig();

    console.log(`[ProjectManager] Added project: ${name} at ${projectPath}`);
    this.emit('projectAdded', { name, config: projectConfig });

    // Install dependencies if requested
    if (dependencyInstall) {
      await this.installDependencies(name);
    }

    // Set up Claude hooks for the project
    await this.setupProjectHooks(name);
  }

  /**
   * Updates an existing project configuration
   */
  updateProject(name: string, updates: Partial<ProjectConfig>): void {
    if (!this.config.projects[name]) {
      throw new Error(`Project "${name}" does not exist`);
    }

    this.config.projects[name] = {
      ...this.config.projects[name],
      ...updates
    };

    this.saveConfig();

    console.log(`[ProjectManager] Updated project: ${name}`);
    this.emit('projectUpdated', { name, config: this.config.projects[name] });
  }

  /**
   * Removes a project from the configuration
   */
  removeProject(name: string): void {
    if (!this.config.projects[name]) {
      throw new Error(`Project "${name}" does not exist`);
    }

    delete this.config.projects[name];
    this.saveConfig();

    console.log(`[ProjectManager] Removed project: ${name}`);
    this.emit('projectRemoved', { name });
  }

  /**
   * Detects the package manager used by the project
   */
  private detectPackageManager(projectPath: string): { cmd: string; args: string[] } {
    // Check for lock files to determine package manager
    if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
      return { cmd: 'pnpm', args: ['install'] };
    }
    if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) {
      return { cmd: 'yarn', args: ['install'] };
    }
    if (fs.existsSync(path.join(projectPath, 'bun.lockb'))) {
      return { cmd: 'bun', args: ['install'] };
    }
    // Default to npm
    return { cmd: 'npm', args: ['install'] };
  }

  /**
   * Installs dependencies for a project (detects npm/yarn/pnpm/bun)
   */
  async installDependencies(projectName: string): Promise<void> {
    const projectConfig = this.config.projects[projectName];
    if (!projectConfig) {
      throw new Error(`Project "${projectName}" does not exist`);
    }

    const projectPath = this.expandPath(projectConfig.path);

    // Check if package.json exists
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      console.log(`[ProjectManager] No package.json found in ${projectName}, skipping dependency install`);
      return;
    }

    const { cmd, args } = this.detectPackageManager(projectPath);
    console.log(`[ProjectManager] Running ${cmd} ${args.join(' ')} for ${projectName}...`);
    console.log(`[ProjectManager] Install spawn details:`, {
      cmd,
      args,
      cwd: projectPath,
      shell: true,
      SHELL: process.env.SHELL,
      PATH: process.env.PATH?.split(':').slice(0, 5).join(':') + '...'  // First 5 PATH entries
    });
    this.emit('dependencyInstallStart', { project: projectName, packageManager: cmd });

    return new Promise((resolve, reject) => {
      // Use shell: true to let Node find npm via PATH
      const proc = spawn(cmd, args, {
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: process.env
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        this.emit('dependencyInstallLog', { project: projectName, text, stream: 'stdout' });
      });

      proc.stderr?.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        this.emit('dependencyInstallLog', { project: projectName, text, stream: 'stderr' });
      });

      proc.on('error', (err) => {
        console.error(`[ProjectManager] ${cmd} install error for ${projectName}:`, err);
        this.emit('dependencyInstallError', { project: projectName, error: err.message });
        reject(err);
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          console.log(`[ProjectManager] ${cmd} install completed for ${projectName}`);
          this.emit('dependencyInstallComplete', { project: projectName });
          resolve();
        } else {
          const error = `${cmd} install failed with code ${code}: ${stderr}`;
          console.error(`[ProjectManager] ${error}`);
          this.emit('dependencyInstallError', { project: projectName, error });
          reject(new Error(error));
        }
      });
    });
  }

  /**
   * Sets up Claude hooks for a project
   */
  async setupProjectHooks(projectName: string): Promise<void> {
    const projectConfig = this.config.projects[projectName];
    if (!projectConfig) {
      throw new Error(`Project "${projectName}" does not exist`);
    }

    const projectPath = this.expandPath(projectConfig.path);

    // Add .session to .gitignore if not already present
    this.ensureGitignoreEntry(projectPath, '.session');

    // Ensure .claude directory exists
    const claudeDir = path.join(projectPath, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });

    // Set up hooks directory
    const hooksDir = path.join(claudeDir, 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });

    // Copy hook templates
    const templatesDir = path.join(this.orchestratorDir, 'hook-templates');
    const hooks = ['stop.sh', 'notification.sh', 'postToolUse.sh', 'preToolUse.sh', 'subagentStop.sh'];

    for (const hook of hooks) {
      const src = path.join(templatesDir, hook);
      const dest = path.join(hooksDir, hook);

      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        fs.chmodSync(dest, '755');
      }
    }

    // Configure .claude/settings.json
    const settingsPath = path.join(claudeDir, 'settings.json');
    const hookConfig = {
      hooks: {
        Stop: [{ hooks: [{ type: 'command', command: '.claude/hooks/stop.sh' }] }],
        Notification: [{ hooks: [{ type: 'command', command: '.claude/hooks/notification.sh' }] }],
        PostToolUse: [{ matcher: '', hooks: [{ type: 'command', command: '.claude/hooks/postToolUse.sh' }] }],
        PreToolUse: [{ matcher: '', hooks: [{ type: 'command', command: '.claude/hooks/preToolUse.sh' }] }],
        SubagentStop: [{ hooks: [{ type: 'command', command: '.claude/hooks/subagentStop.sh' }] }]
      }
    };

    // Merge with existing settings if present
    let existingSettings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      try {
        existingSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      } catch {
        console.warn(`[ProjectManager] Failed to parse existing settings.json for ${projectName}`);
      }
    }

    const mergedSettings = {
      ...existingSettings,
      hooks: {
        ...(existingSettings.hooks as Record<string, unknown> || {}),
        ...hookConfig.hooks
      }
    };

    fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2));

    console.log(`[ProjectManager] Set up hooks for ${projectName}`);
    this.emit('hooksConfigured', { project: projectName });
  }

  /**
   * Gets available project templates
   */
  getTemplates(): ProjectTemplateConfig[] {
    return Object.values(TEMPLATES);
  }

  /**
   * Creates a new project from a template
   */
  async createFromTemplate(options: CreateFromTemplateOptions): Promise<void> {
    const { name, targetPath, template, dependencyInstall } = options;

    // Validate project name doesn't exist
    if (this.config.projects[name]) {
      throw new Error(`Project "${name}" already exists`);
    }

    // Validate template exists
    const templateConfig = TEMPLATES[template];
    if (!templateConfig) {
      throw new Error(`Template "${template}" does not exist`);
    }

    // Expand and validate target path parent exists
    const expandedPath = this.expandPath(targetPath);
    const parentDir = path.dirname(expandedPath);
    if (!fs.existsSync(parentDir)) {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }

    // Check target doesn't already exist
    if (fs.existsSync(expandedPath)) {
      throw new Error(`Target path already exists: ${expandedPath}`);
    }

    // Copy template to target
    const templatePath = path.join(this.orchestratorDir, 'project-templates', template);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template directory not found: ${templatePath}`);
    }

    console.log(`[ProjectManager] Creating project "${name}" from template "${template}"...`);
    this.emit('templateCopyStart', { name, template, targetPath: expandedPath });

    // Recursively copy template directory
    this.copyDirectory(templatePath, expandedPath);

    console.log(`[ProjectManager] Template copied to ${expandedPath}`);
    this.emit('templateCopyComplete', { name, template, targetPath: expandedPath });

    // Create project config
    const projectConfig: ProjectConfig = {
      path: targetPath,
      devServer: {
        command: templateConfig.devServer.command,
        readyPattern: templateConfig.devServer.readyPattern,
        env: {}
      },
      buildCommand: templateConfig.buildCommand,
      hasE2E: true // Templates include E2E skills
    };

    // Add to config
    this.config.projects[name] = projectConfig;
    this.saveConfig();

    console.log(`[ProjectManager] Added project: ${name} at ${targetPath}`);
    this.emit('projectAdded', { name, config: projectConfig });

    // Install dependencies if requested
    if (dependencyInstall) {
      await this.installDependencies(name);
    }

    // Set up Claude hooks for the project
    await this.setupProjectHooks(name);
  }

  /**
   * Recursively copies a directory
   */
  private copyDirectory(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Detects project type and suggests configuration
   */
  detectProjectType(projectPath: string): Partial<ProjectConfig> {
    const expandedPath = this.expandPath(projectPath);
    const suggestions: Partial<ProjectConfig> = {};

    // Check for package.json
    const packageJsonPath = path.join(expandedPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const scripts = packageJson.scripts || {};

        // Detect dev server command
        if (scripts.dev) {
          suggestions.devServer = {
            command: 'npm run dev',
            readyPattern: 'ready|listening|started|compiled',
            env: {}
          };
        } else if (scripts.start) {
          suggestions.devServer = {
            command: 'npm start',
            readyPattern: 'ready|listening|started',
            env: {}
          };
        }

        // Detect E2E testing
        if (scripts['test:e2e'] || scripts.e2e || scripts.cypress || scripts.playwright) {
          suggestions.hasE2E = true;
        }

        // Detect framework-specific patterns
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

        if (deps.next) {
          suggestions.devServer = {
            command: 'npm run dev',
            readyPattern: 'ready started server|localhost:3000',
            env: {}
          };
        } else if (deps.vite) {
          suggestions.devServer = {
            command: 'npm run dev',
            readyPattern: 'Local:.*http',
            env: {}
          };
        } else if (deps['@angular/core']) {
          suggestions.devServer = {
            command: 'npm start',
            readyPattern: 'Compiled successfully|Angular Live Development Server',
            env: {}
          };
        } else if (deps.express || deps.fastify || deps.koa) {
          suggestions.devServer = {
            command: 'npm run dev',
            readyPattern: 'listening|Server started|ready',
            env: {}
          };
        }

      } catch {
        // Ignore parse errors
      }
    }

    return suggestions;
  }

  /**
   * Saves the current configuration to disk
   */
  private saveConfig(): void {
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  /**
   * Reloads configuration from disk
   */
  reloadConfig(): void {
    this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    this.emit('configReloaded', this.config);
  }
}
