import { EventEmitter } from 'events';
import * as fs from 'fs';
import type { WorkspaceConfig, WorkspaceProjectConfig, ProjectConfig, GitHubConfig, DeploymentState } from '@orchy/types';
import { WORKSPACE_ROOT_PROJECT } from '@orchy/types';
import * as path from 'path';

/**
 * Manages workspace configuration (stored in workspaces.json)
 * Projects are stored inline within each workspace.
 */
export class WorkspaceManager extends EventEmitter {
  private configPath: string;
  private workspaces: Record<string, WorkspaceConfig>;

  constructor(configPath: string) {
    super();
    this.configPath = configPath;
    this.workspaces = this.loadConfig();
  }

  private loadConfig(): Record<string, WorkspaceConfig> {
    if (!fs.existsSync(this.configPath)) {
      return {};
    }
    try {
      return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    } catch {
      console.warn('[WorkspaceManager] Failed to parse workspaces.json, starting empty');
      return {};
    }
  }

  private saveConfig(): void {
    fs.writeFileSync(this.configPath, JSON.stringify(this.workspaces, null, 2));
  }

  /**
   * Generate a slug ID from a name
   */
  private generateId(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    // Ensure uniqueness
    if (!this.workspaces[slug]) return slug;
    let i = 2;
    while (this.workspaces[`${slug}-${i}`]) i++;
    return `${slug}-${i}`;
  }

  getWorkspaces(): Record<string, WorkspaceConfig> {
    return this.workspaces;
  }

  getWorkspace(id: string): WorkspaceConfig | undefined {
    return this.workspaces[id];
  }

  createWorkspace(opts: { name: string; projects: WorkspaceProjectConfig[]; context?: string; orchyManaged?: boolean; github?: GitHubConfig; mainBranch?: string }): WorkspaceConfig {
    const id = this.generateId(opts.name);

    const now = Date.now();
    const workspace: WorkspaceConfig = {
      id,
      name: opts.name,
      projects: opts.projects,
      context: opts.context,
      orchyManaged: opts.orchyManaged,       // True for template-created monorepo workspaces
      github: opts.github,                   // GitHub integration config
      mainBranch: opts.mainBranch || 'main', // Default: 'main'
      createdAt: now,
      updatedAt: now,
    };

    this.workspaces[id] = workspace;
    this.saveConfig();
    console.log(`[WorkspaceManager] Created workspace: ${id}`);
    this.emit('workspaceCreated', workspace);
    return workspace;
  }

  updateWorkspace(id: string, updates: { name?: string; projects?: WorkspaceProjectConfig[]; context?: string; github?: GitHubConfig; deployment?: DeploymentState; mainBranch?: string }): WorkspaceConfig {
    const workspace = this.workspaces[id];
    if (!workspace) {
      throw new Error(`Workspace "${id}" does not exist`);
    }

    if (updates.name !== undefined) workspace.name = updates.name;
    if (updates.projects !== undefined) workspace.projects = updates.projects;
    if (updates.context !== undefined) workspace.context = updates.context;
    if (updates.github !== undefined) workspace.github = updates.github;
    if (updates.deployment !== undefined) workspace.deployment = updates.deployment;
    if (updates.mainBranch !== undefined) workspace.mainBranch = updates.mainBranch;
    workspace.updatedAt = Date.now();

    this.saveConfig();
    console.log(`[WorkspaceManager] Updated workspace: ${id}`);
    this.emit('workspaceUpdated', workspace);
    return workspace;
  }

  deleteWorkspace(id: string): void {
    if (!this.workspaces[id]) {
      throw new Error(`Workspace "${id}" does not exist`);
    }
    delete this.workspaces[id];
    this.saveConfig();
    console.log(`[WorkspaceManager] Deleted workspace: ${id}`);
    this.emit('workspaceDeleted', { id });
  }

  /**
   * Add a project to a workspace
   */
  addProjectToWorkspace(workspaceId: string, project: WorkspaceProjectConfig): WorkspaceConfig {
    const workspace = this.workspaces[workspaceId];
    if (!workspace) {
      throw new Error(`Workspace "${workspaceId}" does not exist`);
    }

    // Check if project name already exists
    if (workspace.projects.some(p => p.name === project.name)) {
      throw new Error(`Project "${project.name}" already exists in workspace`);
    }

    workspace.projects.push(project);
    workspace.updatedAt = Date.now();
    this.saveConfig();
    console.log(`[WorkspaceManager] Added project "${project.name}" to workspace: ${workspaceId}`);
    this.emit('workspaceUpdated', workspace);
    return workspace;
  }

  /**
   * Update a project within a workspace
   */
  updateWorkspaceProject(workspaceId: string, projectName: string, updates: Partial<ProjectConfig>): WorkspaceConfig {
    const workspace = this.workspaces[workspaceId];
    if (!workspace) {
      throw new Error(`Workspace "${workspaceId}" does not exist`);
    }

    const projectIndex = workspace.projects.findIndex(p => p.name === projectName);
    if (projectIndex === -1) {
      throw new Error(`Project "${projectName}" not found in workspace`);
    }

    // Apply updates (excluding name which is immutable)
    workspace.projects[projectIndex] = {
      ...workspace.projects[projectIndex],
      ...updates,
      name: projectName, // Preserve original name
    };
    workspace.updatedAt = Date.now();
    this.saveConfig();
    console.log(`[WorkspaceManager] Updated project "${projectName}" in workspace: ${workspaceId}`);
    this.emit('workspaceUpdated', workspace);
    return workspace;
  }

  /**
   * Remove a project from a workspace
   */
  removeProjectFromWorkspace(workspaceId: string, projectName: string): WorkspaceConfig {
    const workspace = this.workspaces[workspaceId];
    if (!workspace) {
      throw new Error(`Workspace "${workspaceId}" does not exist`);
    }

    const projectIndex = workspace.projects.findIndex(p => p.name === projectName);
    if (projectIndex === -1) {
      throw new Error(`Project "${projectName}" not found in workspace`);
    }

    workspace.projects.splice(projectIndex, 1);
    workspace.updatedAt = Date.now();
    this.saveConfig();
    console.log(`[WorkspaceManager] Removed project "${projectName}" from workspace: ${workspaceId}`);
    this.emit('workspaceUpdated', workspace);
    return workspace;
  }

  /**
   * Get project configs from a workspace as a Record<name, config>
   * (for compatibility with existing code that expects this format)
   *
   * For orchyManaged workspaces with projects, automatically injects a virtual
   * __workspace__ project pointing to the workspace root directory.
   */
  getWorkspaceProjectConfigs(workspaceId: string): Record<string, ProjectConfig> {
    const workspace = this.workspaces[workspaceId];
    if (!workspace) {
      return {};
    }

    const configs: Record<string, ProjectConfig> = {};
    for (const project of workspace.projects) {
      const { name, ...config } = project;
      configs[name] = config;
    }

    // For orchyManaged workspaces, inject virtual workspace root project
    if (workspace.orchyManaged && workspace.projects.length > 0) {
      const firstProject = workspace.projects[0];
      const workspaceRoot = path.dirname(firstProject.path);

      // Generate list of project directory names to exclude
      const projectDirNames = workspace.projects.map(p => path.basename(p.path));

      configs[WORKSPACE_ROOT_PROJECT] = {
        path: workspaceRoot,
        hasE2E: false,
        devServerEnabled: false,
        buildEnabled: false,
        // Same permissions as template projects
        permissions: {
          allow: [
            'Read', 'Write', 'Edit', 'Glob', 'Grep',
            'Bash(npm run *)', 'Bash(npm install *)',
            'Bash(git *)',
            'Bash(mkdir *)', 'Bash(touch *)', 'Bash(ls *)',
            'mcp__playwright__*',  // All playwright tools
          ]
        },
        e2eInstructions: `CRITICAL RESTRICTION: You are working at the workspace root level.

You MUST NOT enter or modify any project directories:
${projectDirNames.map(d => `- ${d}/`).join('\n')}

You may ONLY work in:
- The workspace root directory itself (files like package.json, turbo.json, etc.)
- .github/ directory (workflows, actions, dependabot)
- Shared configuration directories that are NOT project directories
- Documentation files at the root level

If a task requires modifying project code, it should be assigned to that specific project, not to ${WORKSPACE_ROOT_PROJECT}.`
      };
    }

    return configs;
  }

  /**
   * Get project names for a workspace (for backwards compatibility)
   *
   * For orchyManaged workspaces, includes the virtual __workspace__ project.
   */
  getWorkspaceProjectNames(workspaceId: string): string[] {
    const workspace = this.workspaces[workspaceId];
    if (!workspace) {
      return [];
    }

    const names = workspace.projects.map(p => p.name);

    // For orchyManaged workspaces, include the virtual workspace root project
    if (workspace.orchyManaged && workspace.projects.length > 0) {
      names.push(WORKSPACE_ROOT_PROJECT);
    }

    return names;
  }
}
