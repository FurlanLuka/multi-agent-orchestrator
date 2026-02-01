import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { ProjectConfig, ProjectTemplate, ProjectTemplateConfig } from '@orchy/types';
import { GitManager } from './git-manager';
import { getProjectTemplatesDir, getConfigDir } from '../config/paths';
import { spawnWithShellEnv, getDefaultShell } from '../utils/shell-env';

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
 * Manages project templates and utility functions.
 * No longer handles project CRUD - that's done via WorkspaceManager.
 */
export class TemplateManager extends EventEmitter {
  constructor() {
    super();
  }

  /**
   * Expands ~ to home directory
   */
  expandPath(p: string): string {
    if (p.startsWith('~')) {
      return p.replace('~', process.env.HOME || '');
    }
    return p;
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
  async installDependencies(projectPath: string, projectName: string): Promise<void> {
    const expandedPath = this.expandPath(projectPath);

    // Check if package.json exists
    const packageJsonPath = path.join(expandedPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      console.log(`[TemplateManager] No package.json found in ${projectName}, skipping dependency install`);
      return;
    }

    const { cmd, args } = this.detectPackageManager(expandedPath);
    const fullCommand = `${cmd} ${args.join(' ')}`;
    console.log(`[TemplateManager] Running ${fullCommand} for ${projectName}...`);
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

    console.log(`[TemplateManager] Shell: ${getDefaultShell()}, CWD: ${expandedPath}`);

    const proc = await spawnWithShellEnv(debugCommand, {
      cwd: expandedPath,
    });

    console.log(`[TemplateManager] Spawned PID: ${proc.pid}`);

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        // Log npm output for debugging
        console.log(`[TemplateManager] [${projectName}] stdout: ${text.trim().substring(0, 200)}`);
        this.emit('dependencyInstallLog', { project: projectName, text, stream: 'stdout' });
      });

      proc.stderr?.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        // Log npm stderr for debugging
        console.log(`[TemplateManager] [${projectName}] stderr: ${text.trim().substring(0, 200)}`);
        this.emit('dependencyInstallLog', { project: projectName, text, stream: 'stderr' });
      });

      proc.on('error', (err) => {
        console.error(`[TemplateManager] ${cmd} install error for ${projectName}:`, err);
        this.emit('dependencyInstallError', { project: projectName, error: err.message });
        reject(err);
      });

      proc.on('exit', (code) => {
        // Debug: check what was installed
        const binPath = path.join(expandedPath, 'node_modules', '.bin');
        let binContents: string[] = [];
        try {
          binContents = fs.readdirSync(binPath);
          console.log(`[TemplateManager] node_modules/.bin contents (${binContents.length} items): ${binContents.slice(0, 10).join(', ')}${binContents.length > 10 ? '...' : ''}`);
        } catch {
          console.log(`[TemplateManager] node_modules/.bin does not exist or is empty`);
        }

        if (code === 0) {
          console.log(`[TemplateManager] ${cmd} install completed for ${projectName}`);
          this.emit('dependencyInstallComplete', { project: projectName });
          resolve();
        } else {
          const error = `${cmd} install failed with code ${code}: ${stderr}`;
          console.error(`[TemplateManager] ${error}`);
          this.emit('dependencyInstallError', { project: projectName, error });
          reject(new Error(error));
        }
      });
    });
  }

  /**
   * Runs the setup command for a project (e.g., adding MCP servers)
   */
  async runSetupCommand(projectPath: string, projectName: string, setupCommand: string): Promise<void> {
    const expandedPath = this.expandPath(projectPath);

    console.log(`[TemplateManager] Running setup command for ${projectName}: ${setupCommand}`);
    this.emit('setupCommandStart', { project: projectName, command: setupCommand });

    const proc = await spawnWithShellEnv(setupCommand, {
      cwd: expandedPath,
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
        console.error(`[TemplateManager] Setup command error for ${projectName}:`, err);
        this.emit('setupCommandError', { project: projectName, error: err.message });
        reject(err);
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          console.log(`[TemplateManager] Setup command completed for ${projectName}`);
          this.emit('setupCommandComplete', { project: projectName });
          resolve();
        } else {
          const error = `Setup command failed with code ${code}: ${stderr}`;
          console.error(`[TemplateManager] ${error}`);
          this.emit('setupCommandError', { project: projectName, error });
          // Don't reject - setup command failure shouldn't block project creation
          console.warn(`[TemplateManager] Continuing despite setup command failure`);
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
   * Gets a specific template config
   */
  getTemplate(template: ProjectTemplate): ProjectTemplateConfig | undefined {
    return TEMPLATES[template];
  }

  /**
   * Creates a new project from a template
   * Returns the project config (does NOT save to any config file)
   */
  async createFromTemplate(options: CreateFromTemplateOptions): Promise<ProjectConfig> {
    const { name, targetPath, template, dependsOn, permissions } = options;

    // Validate template exists
    const templateConfig = TEMPLATES[template];
    if (!templateConfig) {
      throw new Error(`Template "${template}" does not exist`);
    }

    // Expand target path and append project name to create final destination
    const expandedBasePath = this.expandPath(targetPath);

    // Validate base path exists (it should be the parent directory where we create the project)
    if (!fs.existsSync(expandedBasePath)) {
      throw new Error(`Target directory does not exist: ${expandedBasePath}`);
    }

    // Create final path by appending project name
    const expandedPath = path.join(expandedBasePath, name);

    // Check final destination doesn't already exist
    if (fs.existsSync(expandedPath)) {
      throw new Error(`Project folder already exists: ${expandedPath}`);
    }

    // Copy template files to target
    const templatePath = path.join(getProjectTemplatesDir(), template);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template directory not found: ${templatePath}`);
    }

    console.log(`[TemplateManager] Creating project "${name}" from template "${template}"...`);
    this.emit('templateCopyStart', { name, template, targetPath: expandedPath });

    // Recursively copy template directory
    this.copyDirectory(templatePath, expandedPath);

    console.log(`[TemplateManager] Template copied to ${expandedPath}`);
    this.emit('templateCopyComplete', { name, template, targetPath: expandedPath });

    // Copy full config from template, add path and optional overrides
    // Use the final expanded path (base path + project name)
    const projectConfig: ProjectConfig = {
      ...templateConfig.config,
      path: expandedPath,
      dependsOn: dependsOn ?? templateConfig.config.dependsOn,
      permissions: permissions ?? templateConfig.config.permissions
    };

    console.log(`[TemplateManager] Created project config for: ${name} at ${expandedPath}`);
    this.emit('projectAdded', { name, config: projectConfig });

    // Install dependencies if enabled in template config
    if (projectConfig.installEnabled) {
      await this.installDependencies(expandedPath, name);
    }

    // Run setup command if configured (e.g., adding MCP servers)
    if (projectConfig.setupCommand) {
      await this.runSetupCommand(expandedPath, name, projectConfig.setupCommand);
    }

    // Initialize git repo and commit all files (template + hooks) if git is enabled
    if (projectConfig.gitEnabled) {
      const gitManager = new GitManager();
      const mainBranch = projectConfig.mainBranch || 'main';
      console.log(`[TemplateManager] Initializing git repository for ${name}...`);

      // Init repo (ensures main branch exists)
      const initResult = await gitManager.initRepo(expandedPath, mainBranch);
      if (initResult.success) {
        // Commit all files (template files + hooks setup)
        const commitResult = await gitManager.commit(expandedPath, `Initial commit from ${template} template`);
        if (commitResult.success) {
          console.log(`[TemplateManager] Git initialized and project committed for ${name}`);
        } else {
          console.warn(`[TemplateManager] Git init succeeded but commit failed: ${commitResult.message}`);
        }
      } else {
        console.warn(`[TemplateManager] Failed to initialize git for ${name}: ${initResult.message}`);
      }
    }

    return projectConfig;
  }

  /**
   * Recursively copies a directory
   */
  copyDirectory(src: string, dest: string): void {
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
   * Attaches a design from the library to a project path.
   * Copies design files to {projectPath}/ui_mockup/
   * Returns updated project config with attachedDesign field
   */
  async attachDesignToProject(projectPath: string, projectName: string, designName: string): Promise<{ attachedDesign: string }> {
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
    const expandedProjectPath = this.expandPath(projectPath);
    const uiMockupDir = path.join(expandedProjectPath, 'ui_mockup');

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
        console.log(`[TemplateManager] Copied ${file} to ui_mockup/`);
      }
    }

    // Copy all page HTML files (*.html except theme.html and components.html)
    const entries = fs.readdirSync(designDir);
    for (const entry of entries) {
      if (entry.endsWith('.html') && entry !== 'theme.html' && entry !== 'components.html') {
        const srcPath = path.join(designDir, entry);
        const destPath = path.join(uiMockupDir, entry);
        fs.copyFileSync(srcPath, destPath);
        console.log(`[TemplateManager] Copied page ${entry} to ui_mockup/`);
      }
    }

    console.log(`[TemplateManager] Attached design "${designName}" to project "${projectName}"`);
    this.emit('designAttached', { project: projectName, design: designName });

    return { attachedDesign: designName };
  }
}
