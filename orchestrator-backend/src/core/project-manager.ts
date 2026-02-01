import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { Config, ProjectConfig, ProjectTemplate, ProjectTemplateConfig } from '@orchy/types';
import { GitManager } from './git-manager';
import { getProjectTemplatesDir, getConfigDir } from '../config/paths';
import { spawnWithShellEnv, getDefaultShell } from '../utils/shell-env';

export interface AddProjectOptions {
  name: string;
  path: string;
  devServerEnabled?: boolean;
  devServer?: {
    command: string;
    readyPattern: string;
    env?: Record<string, string>;
    url?: string;
  };
  buildEnabled?: boolean;
  buildCommand?: string;
  installEnabled?: boolean;
  installCommand?: string;
  setupCommand?: string;  // Command to run on project setup (e.g., "claude mcp add playwright -- npx @playwright/mcp@latest")
  hasE2E?: boolean;
  e2eInstructions?: string;  // Custom E2E testing instructions (markdown)
  dependsOn?: string[];  // Projects that must complete E2E before this one starts
  dependencyInstall?: boolean;
  gitEnabled?: boolean;      // Enable git features (feature branches, auto-commits)
  mainBranch?: string;       // Main branch name (default: 'main')
  permissions?: {
    dangerouslyAllowAll?: boolean;
    allow: string[];
  };
}

export interface CreateFromTemplateOptions {
  name: string;
  targetPath: string;
  template: ProjectTemplate;
  // Optional overrides (otherwise uses template defaults)
  dependsOn?: string[];  // Projects that must complete E2E before this one starts
  permissions?: {
    dangerouslyAllowAll?: boolean;
    allow: string[];
  };
}

// Template configurations - full ProjectConfig (minus path)
const TEMPLATES: Record<ProjectTemplate, ProjectTemplateConfig> = {
  'vite-frontend': {
    name: 'vite-frontend',
    displayName: 'Vite + React Frontend',
    description: 'React frontend with Vite, TypeScript, and Playwright MCP for E2E testing',
    config: {
      devServerEnabled: true,
      devServer: {
        command: 'npm run dev',
        readyPattern: 'Local:.*http|ready in',
        env: {},
        url: 'http://localhost:5173'
      },
      buildEnabled: true,
      buildCommand: 'npm run build',
      installEnabled: true,
      installCommand: 'npm install',
      setupCommand: 'claude mcp add playwright -- npx @playwright/mcp@latest',
      hasE2E: true,
      gitEnabled: true,
      mainBranch: 'main'
    }
  },
  'nestjs-backend': {
    name: 'nestjs-backend',
    displayName: 'NestJS Backend',
    description: 'NestJS backend with TypeScript and curl-based E2E testing',
    config: {
      devServerEnabled: true,
      devServer: {
        command: 'npm run start:dev',
        readyPattern: 'Nest application successfully started|listening on|Application is running',
        env: {},
        url: 'http://localhost:3000'
      },
      buildEnabled: true,
      buildCommand: 'npm run build',
      installEnabled: true,
      installCommand: 'npm install',
      hasE2E: true,
      gitEnabled: true,
      mainBranch: 'main'
    }
  }
};

/**
 * Manages project configuration and setup
 */
export class ProjectManager extends EventEmitter {
  private configPath: string;
  private config: Config;

  constructor(configPath: string, config: Config) {
    super();
    this.configPath = configPath;
    this.config = config;
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
   * Ensures all Orchy related entries are in .gitignore
   * This keeps the project repo clean from orchestrator artifacts
   * Only .claude/ is needed since all session data is centralized in ~/.orchy-config/
   */
  private ensureOrchyGitignoreEntries(projectPath: string): void {
    const orchyEntries = [
      '# Orchy',
      '.claude/',
    ];

    const gitignorePath = path.join(projectPath, '.gitignore');

    let content = '';
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf-8');
    }

    const lines = content.split('\n').map(l => l.trim());
    const entriesToAdd: string[] = [];

    for (const entry of orchyEntries) {
      if (!lines.includes(entry)) {
        entriesToAdd.push(entry);
      }
    }

    if (entriesToAdd.length === 0) {
      return; // All entries already present
    }

    // Add a blank line before Orchy section if content exists and doesn't end with newlines
    const separator = content && !content.endsWith('\n\n') ? '\n' : '';
    const newContent = content.endsWith('\n') || content === ''
      ? `${content}${separator}${entriesToAdd.join('\n')}\n`
      : `${content}\n${separator}${entriesToAdd.join('\n')}\n`;

    fs.writeFileSync(gitignorePath, newContent);
    console.log(`[ProjectManager] Added Orchy entries to .gitignore`);
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
    const { name, path: projectPath, devServerEnabled, devServer, buildEnabled, buildCommand, installEnabled, installCommand, setupCommand, hasE2E, e2eInstructions, dependsOn, dependencyInstall, gitEnabled, mainBranch, permissions } = options;

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
      // Install packages (optional)
      installEnabled: installEnabled ?? false,
      installCommand: installCommand,
      // Build (optional)
      buildEnabled: buildEnabled ?? !!buildCommand,
      buildCommand: buildCommand,
      // Dev server (optional)
      devServerEnabled: devServerEnabled ?? true,
      devServer: devServer ? {
        command: devServer.command,
        readyPattern: devServer.readyPattern,
        env: devServer.env || {},
        url: devServer.url
      } : {
        command: 'npm run dev',
        readyPattern: 'ready|listening|started|compiled',
        env: {}
      },
      setupCommand: setupCommand,
      hasE2E: hasE2E ?? false,
      e2eInstructions: e2eInstructions,
      dependsOn: dependsOn,
      gitEnabled: gitEnabled ?? false,
      mainBranch: mainBranch || 'main',
      permissions: permissions
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

    // Run setup command if configured (e.g., adding MCP servers)
    if (setupCommand) {
      await this.runSetupCommand(name);
    }
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
    // Default to npm - explicitly include dev dependencies
    return { cmd: 'npm', args: ['install', '--include=dev'] };
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
    const fullCommand = `${cmd} ${args.join(' ')}`;
    console.log(`[ProjectManager] Running ${fullCommand} for ${projectName}...`);
    this.emit('dependencyInstallStart', { project: projectName, packageManager: cmd });

    // Debug command to log env info
    const debugCommand = `
echo "=== ORCHESTRATOR DEBUG ===" >&2
echo "PATH first 300: \${PATH:0:300}" >&2
echo "Which npm: $(which npm 2>/dev/null || echo 'not found')" >&2
echo "npm version: $(npm --version 2>&1 || echo 'n/a')" >&2
echo "==========================" >&2
${fullCommand}
`.trim();

    console.log(`[ProjectManager] Shell: ${getDefaultShell()}, CWD: ${projectPath}`);

    const proc = await spawnWithShellEnv(debugCommand, {
      cwd: projectPath,
    });

    console.log(`[ProjectManager] Spawned PID: ${proc.pid}`);

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        // Log npm output for debugging
        console.log(`[ProjectManager] [${projectName}] stdout: ${text.trim().substring(0, 200)}`);
        this.emit('dependencyInstallLog', { project: projectName, text, stream: 'stdout' });
      });

      proc.stderr?.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        // Log npm stderr for debugging
        console.log(`[ProjectManager] [${projectName}] stderr: ${text.trim().substring(0, 200)}`);
        this.emit('dependencyInstallLog', { project: projectName, text, stream: 'stderr' });
      });

      proc.on('error', (err) => {
        console.error(`[ProjectManager] ${cmd} install error for ${projectName}:`, err);
        this.emit('dependencyInstallError', { project: projectName, error: err.message });
        reject(err);
      });

      proc.on('exit', (code) => {
        // Debug: check what was installed
        const binPath = path.join(projectPath, 'node_modules', '.bin');
        let binContents: string[] = [];
        try {
          binContents = fs.readdirSync(binPath);
          console.log(`[ProjectManager] node_modules/.bin contents (${binContents.length} items): ${binContents.slice(0, 10).join(', ')}${binContents.length > 10 ? '...' : ''}`);
        } catch {
          console.log(`[ProjectManager] node_modules/.bin does not exist or is empty`);
        }

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
   * Runs the setup command for a project (e.g., adding MCP servers)
   */
  async runSetupCommand(projectName: string): Promise<void> {
    const projectConfig = this.config.projects[projectName];
    if (!projectConfig) {
      throw new Error(`Project "${projectName}" does not exist`);
    }

    if (!projectConfig.setupCommand) {
      console.log(`[ProjectManager] No setup command configured for ${projectName}`);
      return;
    }

    const projectPath = this.expandPath(projectConfig.path);
    const setupCommand = projectConfig.setupCommand;

    console.log(`[ProjectManager] Running setup command for ${projectName}: ${setupCommand}`);
    this.emit('setupCommandStart', { project: projectName, command: setupCommand });

    const proc = await spawnWithShellEnv(setupCommand, {
      cwd: projectPath,
    });

    return new Promise((resolve, reject) => {

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        this.emit('setupCommandLog', { project: projectName, text, stream: 'stdout' });
      });

      proc.stderr?.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        this.emit('setupCommandLog', { project: projectName, text, stream: 'stderr' });
      });

      proc.on('error', (err) => {
        console.error(`[ProjectManager] Setup command error for ${projectName}:`, err);
        this.emit('setupCommandError', { project: projectName, error: err.message });
        reject(err);
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          console.log(`[ProjectManager] Setup command completed for ${projectName}`);
          this.emit('setupCommandComplete', { project: projectName });
          resolve();
        } else {
          const error = `Setup command failed with code ${code}: ${stderr}`;
          console.error(`[ProjectManager] ${error}`);
          this.emit('setupCommandError', { project: projectName, error });
          // Don't reject - setup command failure shouldn't block project creation
          console.warn(`[ProjectManager] Continuing despite setup command failure`);
          resolve();
        }
      });
    });
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
    const { name, targetPath, template, dependsOn, permissions } = options;

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

    // Copy template files to target
    const templatePath = path.join(getProjectTemplatesDir(), template);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template directory not found: ${templatePath}`);
    }

    console.log(`[ProjectManager] Creating project "${name}" from template "${template}"...`);
    this.emit('templateCopyStart', { name, template, targetPath: expandedPath });

    // Recursively copy template directory
    this.copyDirectory(templatePath, expandedPath);

    console.log(`[ProjectManager] Template copied to ${expandedPath}`);
    this.emit('templateCopyComplete', { name, template, targetPath: expandedPath });

    // Copy full config from template, add path and optional overrides
    const projectConfig: ProjectConfig = {
      ...templateConfig.config,
      path: targetPath,
      dependsOn: dependsOn ?? templateConfig.config.dependsOn,
      permissions: permissions ?? templateConfig.config.permissions
    };

    // Add to config
    this.config.projects[name] = projectConfig;
    this.saveConfig();

    console.log(`[ProjectManager] Added project: ${name} at ${targetPath}`);
    this.emit('projectAdded', { name, config: projectConfig });

    // Install dependencies if enabled in template config
    if (projectConfig.installEnabled) {
      await this.installDependencies(name);
    }

    // Run setup command if configured (e.g., adding MCP servers)
    if (projectConfig.setupCommand) {
      await this.runSetupCommand(name);
    }

    // Initialize git repo and commit all files (template + hooks) if git is enabled
    if (projectConfig.gitEnabled) {
      const gitManager = new GitManager();
      const mainBranch = projectConfig.mainBranch || 'main';
      console.log(`[ProjectManager] Initializing git repository for ${name}...`);

      // Init repo (ensures main branch exists)
      const initResult = await gitManager.initRepo(expandedPath, mainBranch);
      if (initResult.success) {
        // Commit all files (template files + hooks setup)
        const commitResult = await gitManager.commit(expandedPath, `Initial commit from ${template} template`);
        if (commitResult.success) {
          console.log(`[ProjectManager] Git initialized and project committed for ${name}`);
        } else {
          console.warn(`[ProjectManager] Git init succeeded but commit failed: ${commitResult.message}`);
        }
      } else {
        console.warn(`[ProjectManager] Failed to initialize git for ${name}: ${initResult.message}`);
      }
    }
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

  /**
   * Attaches a design from the library to a project.
   * Copies design files to {projectPath}/ui_mockup/
   * @param projectName Name of the project
   * @param designName Name of the design from the library
   */
  async attachDesignToProject(projectName: string, designName: string): Promise<void> {
    const projectConfig = this.config.projects[projectName];
    if (!projectConfig) {
      throw new Error(`Project "${projectName}" does not exist`);
    }

    // Get design library path
    const designsLibraryDir = path.join(getConfigDir(), 'designs');
    const sanitizedDesignName = designName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const designDir = path.join(designsLibraryDir, sanitizedDesignName);

    if (!fs.existsSync(designDir)) {
      throw new Error(`Design "${designName}" not found in library`);
    }

    // Get project path
    const projectPath = this.expandPath(projectConfig.path);
    const uiMockupDir = path.join(projectPath, 'ui_mockup');

    // Create ui_mockup directory
    fs.mkdirSync(uiMockupDir, { recursive: true });

    // Files to copy from design folder
    const filesToCopy = [
      'theme.css',      // CSS variables/tokens
      'components.html', // Component reference
      'AGENTS.md',      // Usage instructions
    ];

    // Copy specific files
    for (const file of filesToCopy) {
      const srcPath = path.join(designDir, file);
      if (fs.existsSync(srcPath)) {
        const destPath = path.join(uiMockupDir, file);
        fs.copyFileSync(srcPath, destPath);
        console.log(`[ProjectManager] Copied ${file} to ui_mockup/`);
      }
    }

    // Copy all page HTML files (*.html except theme.html and components.html)
    const entries = fs.readdirSync(designDir);
    for (const entry of entries) {
      if (entry.endsWith('.html') && entry !== 'theme.html' && entry !== 'components.html') {
        const srcPath = path.join(designDir, entry);
        const destPath = path.join(uiMockupDir, entry);
        fs.copyFileSync(srcPath, destPath);
        console.log(`[ProjectManager] Copied page ${entry} to ui_mockup/`);
      }
    }

    // Update project config with attached design
    this.config.projects[projectName] = {
      ...projectConfig,
      attachedDesign: designName,
    };

    this.saveConfig();

    console.log(`[ProjectManager] Attached design "${designName}" to project "${projectName}"`);
    this.emit('designAttached', { project: projectName, design: designName });
  }

  /**
   * Detaches the design from a project.
   * Removes the attachedDesign config but does NOT delete the ui_mockup folder.
   * @param projectName Name of the project
   */
  detachDesignFromProject(projectName: string): void {
    const projectConfig = this.config.projects[projectName];
    if (!projectConfig) {
      throw new Error(`Project "${projectName}" does not exist`);
    }

    if (!projectConfig.attachedDesign) {
      console.log(`[ProjectManager] Project "${projectName}" has no attached design`);
      return;
    }

    const previousDesign = projectConfig.attachedDesign;

    // Remove attachedDesign from config
    const { attachedDesign, ...rest } = projectConfig;
    this.config.projects[projectName] = rest;

    this.saveConfig();

    console.log(`[ProjectManager] Detached design "${previousDesign}" from project "${projectName}"`);
    this.emit('designDetached', { project: projectName, design: previousDesign });
  }
}
