import { EventEmitter } from 'events';
import * as fs from 'fs';
import type { WorkspaceConfig } from '@aio/types';
import type { ProjectManager } from './project-manager';

/**
 * Manages workspace configuration (stored in workspaces.json)
 */
export class WorkspaceManager extends EventEmitter {
  private configPath: string;
  private workspaces: Record<string, WorkspaceConfig>;
  private projectManager: ProjectManager;

  constructor(configPath: string, projectManager: ProjectManager) {
    super();
    this.configPath = configPath;
    this.projectManager = projectManager;
    this.workspaces = this.loadConfig();

    // Auto-remove deleted projects from workspaces
    this.projectManager.on('projectRemoved', ({ name }: { name: string }) => {
      this.removeProjectFromAll(name);
    });
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

  createWorkspace(opts: { name: string; projects: string[]; context?: string }): WorkspaceConfig {
    const id = this.generateId(opts.name);
    const invalid = this.validateProjectReferences(opts.projects);
    if (invalid.length > 0) {
      throw new Error(`Unknown projects: ${invalid.join(', ')}`);
    }

    const now = Date.now();
    const workspace: WorkspaceConfig = {
      id,
      name: opts.name,
      projects: opts.projects,
      context: opts.context,
      createdAt: now,
      updatedAt: now,
    };

    this.workspaces[id] = workspace;
    this.saveConfig();
    console.log(`[WorkspaceManager] Created workspace: ${id}`);
    this.emit('workspaceCreated', workspace);
    return workspace;
  }

  updateWorkspace(id: string, updates: { name?: string; projects?: string[]; context?: string }): WorkspaceConfig {
    const workspace = this.workspaces[id];
    if (!workspace) {
      throw new Error(`Workspace "${id}" does not exist`);
    }

    if (updates.projects) {
      const invalid = this.validateProjectReferences(updates.projects);
      if (invalid.length > 0) {
        throw new Error(`Unknown projects: ${invalid.join(', ')}`);
      }
    }

    if (updates.name !== undefined) workspace.name = updates.name;
    if (updates.projects !== undefined) workspace.projects = updates.projects;
    if (updates.context !== undefined) workspace.context = updates.context;
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
   * Returns project names that don't exist in ProjectManager
   */
  validateProjectReferences(names: string[]): string[] {
    const existing = this.projectManager.getProjects();
    return names.filter(n => !existing[n]);
  }

  /**
   * Remove a project reference from all workspaces (called when project is deleted)
   */
  private removeProjectFromAll(projectName: string): void {
    let changed = false;
    for (const ws of Object.values(this.workspaces)) {
      const idx = ws.projects.indexOf(projectName);
      if (idx !== -1) {
        ws.projects.splice(idx, 1);
        ws.updatedAt = Date.now();
        changed = true;
      }
    }
    if (changed) {
      this.saveConfig();
      console.log(`[WorkspaceManager] Removed project "${projectName}" from workspaces`);
    }
  }
}
