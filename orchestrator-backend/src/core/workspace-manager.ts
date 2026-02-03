import { EventEmitter } from 'events';
import * as fs from 'fs';
import type { WorkspaceConfig, WorkspaceProjectConfig, ProjectConfig } from '@orchy/types';

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

  createWorkspace(opts: { name: string; projects: WorkspaceProjectConfig[]; context?: string; managedGit?: boolean; autoMerge?: boolean; orchyManaged?: boolean }): WorkspaceConfig {
    const id = this.generateId(opts.name);

    const now = Date.now();
    const workspace: WorkspaceConfig = {
      id,
      name: opts.name,
      projects: opts.projects,
      context: opts.context,
      managedGit: opts.managedGit ?? true,   // Default: true for new workspaces
      autoMerge: opts.autoMerge ?? true,     // Default: true for new workspaces
      orchyManaged: opts.orchyManaged,       // True for template-created monorepo workspaces
      createdAt: now,
      updatedAt: now,
    };

    this.workspaces[id] = workspace;
    this.saveConfig();
    console.log(`[WorkspaceManager] Created workspace: ${id}`);
    this.emit('workspaceCreated', workspace);
    return workspace;
  }

  updateWorkspace(id: string, updates: { name?: string; projects?: WorkspaceProjectConfig[]; context?: string; managedGit?: boolean; autoMerge?: boolean }): WorkspaceConfig {
    const workspace = this.workspaces[id];
    if (!workspace) {
      throw new Error(`Workspace "${id}" does not exist`);
    }

    if (updates.name !== undefined) workspace.name = updates.name;
    if (updates.projects !== undefined) workspace.projects = updates.projects;
    if (updates.context !== undefined) workspace.context = updates.context;
    if (updates.managedGit !== undefined) workspace.managedGit = updates.managedGit;
    if (updates.autoMerge !== undefined) workspace.autoMerge = updates.autoMerge;
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
    return configs;
  }

  /**
   * Get project names for a workspace (for backwards compatibility)
   */
  getWorkspaceProjectNames(workspaceId: string): string[] {
    const workspace = this.workspaces[workspaceId];
    if (!workspace) {
      return [];
    }
    return workspace.projects.map(p => p.name);
  }
}
