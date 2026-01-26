/**
 * Utility to write Claude Code permissions to project settings.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProjectPermissions } from '@aio/types';
import { ALWAYS_DENIED } from '@aio/types';

interface ClaudeSettings {
  permissions?: {
    allow?: string[];
    deny?: string[];
  };
  hooks?: Record<string, unknown>;
  // Preserve any other settings
  [key: string]: unknown;
}

/**
 * Writes or updates the .claude/settings.json file for a project
 * Preserves existing hooks and other settings, only updates permissions
 */
export async function writeProjectPermissions(
  projectPath: string,
  permissions: ProjectPermissions
): Promise<void> {
  const claudeDir = path.join(projectPath, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');

  // Ensure .claude directory exists
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }

  // Read existing settings if they exist
  let existingSettings: ClaudeSettings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      existingSettings = JSON.parse(content);
    } catch (err) {
      console.warn(`[PermissionsWriter] Could not parse existing settings.json, will overwrite: ${err}`);
    }
  }

  // Build new settings, preserving hooks and other config
  const newSettings: ClaudeSettings = {
    ...existingSettings,
    permissions: {
      allow: permissions.allow || [],
      deny: ALWAYS_DENIED,  // Always include dangerous denies
    }
  };

  // Write the updated settings
  fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2));
  console.log(`[PermissionsWriter] Updated ${settingsPath} with ${permissions.allow?.length || 0} allowed permissions`);
}

/**
 * Reads the current permissions from a project's settings.json
 */
export function readProjectPermissions(projectPath: string): ProjectPermissions | null {
  const settingsPath = path.join(projectPath, '.claude', 'settings.json');

  if (!fs.existsSync(settingsPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(settingsPath, 'utf-8');
    const settings: ClaudeSettings = JSON.parse(content);

    return {
      allow: settings.permissions?.allow || [],
      dangerouslyAllowAll: false,
    };
  } catch (err) {
    console.warn(`[PermissionsWriter] Could not read permissions from ${settingsPath}: ${err}`);
    return null;
  }
}

/**
 * Check if a project needs its permissions updated
 * Returns true if the project config permissions differ from the settings.json
 */
export function needsPermissionUpdate(
  projectPath: string,
  configPermissions: ProjectPermissions
): boolean {
  const currentPermissions = readProjectPermissions(projectPath);

  if (!currentPermissions) {
    // No settings.json exists, needs update
    return true;
  }

  // Compare allow lists
  const configAllow = new Set(configPermissions.allow || []);
  const currentAllow = new Set(currentPermissions.allow || []);

  if (configAllow.size !== currentAllow.size) {
    return true;
  }

  for (const perm of configAllow) {
    if (!currentAllow.has(perm)) {
      return true;
    }
  }

  return false;
}

/**
 * Expand home directory (~) in path
 */
function expandPath(p: string): string {
  if (p.startsWith('~')) {
    return p.replace('~', process.env.HOME || '');
  }
  return p;
}

/**
 * Sync all project permissions from config to their settings.json files
 */
export async function syncAllProjectPermissions(
  projects: Record<string, { path: string; permissions?: ProjectPermissions }>
): Promise<void> {
  for (const [projectName, config] of Object.entries(projects)) {
    if (config.permissions && !config.permissions.dangerouslyAllowAll) {
      const projectPath = expandPath(config.path);

      if (needsPermissionUpdate(projectPath, config.permissions)) {
        console.log(`[PermissionsWriter] Syncing permissions for ${projectName}`);
        await writeProjectPermissions(projectPath, config.permissions);
      }
    }
  }
}
