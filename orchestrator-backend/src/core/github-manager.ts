import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execWithShellEnv } from '../utils/shell-env';
import type { GitHubGlobalSettings, GitHubAuthStatus, GitHubRepoAccessResult } from '@orchy/types';

// Settings file location
const SETTINGS_DIR = path.join(os.homedir(), '.orchy-config');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'github-settings.json');

// Default settings
const DEFAULT_SETTINGS: GitHubGlobalSettings = {
  enabled: false,
  promptedOnFirstLoad: false,
  defaultVisibility: 'private',
  defaultOwnerType: 'user',
};

// Allowed gh CLI commands whitelist
// Format: [command, subcommand, requiresRepo]
const ALLOWED_COMMANDS: Array<{ command: string; subcommand: string; requiresRepo: boolean }> = [
  { command: 'auth', subcommand: 'status', requiresRepo: false },
  { command: 'repo', subcommand: 'view', requiresRepo: true },
  { command: 'repo', subcommand: 'create', requiresRepo: false },
  { command: 'secret', subcommand: 'set', requiresRepo: true },
  { command: 'secret', subcommand: 'list', requiresRepo: true },
];

export interface CreateRepoOptions {
  name: string;
  visibility: 'public' | 'private';
  ownerType: 'user' | 'org';
  owner?: string;  // Required for org
  description?: string;
}

export interface CreateRepoResult {
  success: boolean;
  repo?: string;  // owner/repo-name
  cloneUrl?: string;
  error?: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * GitHubManager handles all GitHub operations for Orchy workspaces.
 * All gh CLI commands are scoped to specific repos and whitelisted for security.
 */
export class GitHubManager {
  /**
   * Gets the current GitHub global settings
   */
  getSettings(): GitHubGlobalSettings {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const content = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
      }
    } catch (err) {
      console.error('[GitHubManager] Failed to read settings:', err);
    }
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Updates GitHub global settings
   */
  updateSettings(updates: Partial<GitHubGlobalSettings>): GitHubGlobalSettings {
    try {
      // Ensure directory exists
      if (!fs.existsSync(SETTINGS_DIR)) {
        fs.mkdirSync(SETTINGS_DIR, { recursive: true });
      }

      const current = this.getSettings();
      const updated = { ...current, ...updates };
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2));
      console.log('[GitHubManager] Settings updated:', updates);
      return updated;
    } catch (err) {
      console.error('[GitHubManager] Failed to update settings:', err);
      throw err;
    }
  }

  /**
   * Checks if gh CLI is installed
   */
  async isGhInstalled(): Promise<boolean> {
    try {
      const result = await execWithShellEnv('gh --version', { cwd: os.homedir(), timeout: 5000 });
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Checks GitHub CLI authentication status
   */
  async checkAuthStatus(): Promise<GitHubAuthStatus> {
    try {
      const result = await this.executeGhCommand(['auth', 'status']);

      if (result.exitCode === 0) {
        // Parse username from output
        // Format: "Logged in to github.com account username (keyring)"
        const match = result.stderr.match(/Logged in to github\.com account (\S+)/);
        const username = match ? match[1] : undefined;

        return {
          authenticated: true,
          username,
        };
      }

      return {
        authenticated: false,
        error: result.stderr || 'Not authenticated',
      };
    } catch (err) {
      return {
        authenticated: false,
        error: err instanceof Error ? err.message : 'Failed to check auth status',
      };
    }
  }

  /**
   * Verifies access to a specific repository
   */
  async verifyRepoAccess(repo: string): Promise<GitHubRepoAccessResult> {
    try {
      const result = await this.executeGhCommand(['repo', 'view'], repo);

      if (result.exitCode === 0) {
        return {
          hasAccess: true,
          repoExists: true,
        };
      }

      // Check for specific error types
      const errorLower = result.stderr.toLowerCase();
      if (errorLower.includes('not found') || errorLower.includes('could not resolve')) {
        return {
          hasAccess: false,
          repoExists: false,
          error: `Repository '${repo}' does not exist`,
        };
      }

      if (errorLower.includes('permission') || errorLower.includes('forbidden') || errorLower.includes('403')) {
        return {
          hasAccess: false,
          repoExists: true,
          error: `No access to repository '${repo}'`,
        };
      }

      return {
        hasAccess: false,
        repoExists: false,
        error: result.stderr || 'Unknown error',
      };
    } catch (err) {
      return {
        hasAccess: false,
        repoExists: false,
        error: err instanceof Error ? err.message : 'Failed to verify repo access',
      };
    }
  }

  /**
   * Creates a new GitHub repository
   */
  async createRepo(options: CreateRepoOptions): Promise<CreateRepoResult> {
    try {
      const args = ['repo', 'create'];

      // Build repo name with owner if org
      let repoName = options.name;
      if (options.ownerType === 'org' && options.owner) {
        repoName = `${options.owner}/${options.name}`;
      }
      args.push(repoName);

      // Add visibility flag
      args.push(options.visibility === 'public' ? '--public' : '--private');

      // Add description if provided
      if (options.description) {
        args.push('--description', options.description);
      }

      // Don't add remote or clone (we'll handle that separately)
      args.push('--source', '.', '--push');

      const result = await this.executeGhCommand(args);

      if (result.exitCode === 0) {
        // Parse repo URL from output
        const urlMatch = result.stdout.match(/https:\/\/github\.com\/([^\/\s]+\/[^\/\s]+)/);
        const repo = urlMatch ? urlMatch[1] : repoName;

        return {
          success: true,
          repo,
          cloneUrl: `https://github.com/${repo}.git`,
        };
      }

      return {
        success: false,
        error: result.stderr || 'Failed to create repository',
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create repository',
      };
    }
  }

  /**
   * Creates a GitHub repository without --source (for when we need to add remote separately)
   */
  async createRepoOnly(options: CreateRepoOptions): Promise<CreateRepoResult> {
    try {
      const args = ['repo', 'create'];

      // Build repo name with owner if org
      let repoName = options.name;
      if (options.ownerType === 'org' && options.owner) {
        repoName = `${options.owner}/${options.name}`;
      }
      args.push(repoName);

      // Add visibility flag
      args.push(options.visibility === 'public' ? '--public' : '--private');

      // Add description if provided
      if (options.description) {
        args.push('--description', options.description);
      }

      const result = await this.executeGhCommand(args);

      if (result.exitCode === 0) {
        // Parse repo URL from output
        const urlMatch = result.stdout.match(/https:\/\/github\.com\/([^\/\s]+\/[^\/\s]+)/);
        const repo = urlMatch ? urlMatch[1].replace(/\.git$/, '') : repoName;

        return {
          success: true,
          repo,
          cloneUrl: `https://github.com/${repo}.git`,
        };
      }

      // Check for "already exists" error
      if (result.stderr.includes('already exists')) {
        return {
          success: false,
          error: `Repository '${repoName}' already exists`,
        };
      }

      return {
        success: false,
        error: result.stderr || 'Failed to create repository',
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create repository',
      };
    }
  }

  /**
   * Sets a secret on a GitHub repository
   */
  async setSecret(repo: string, name: string, value: string): Promise<{ success: boolean; error?: string }> {
    try {
      // gh secret set expects value from stdin, so we use echo and pipe
      const result = await execWithShellEnv(
        `echo "${value.replace(/"/g, '\\"')}" | gh secret set "${name}" --repo "${repo}"`,
        { cwd: os.homedir(), timeout: 30000 }
      );

      if (result.exitCode === 0) {
        console.log(`[GitHubManager] Secret '${name}' set on ${repo}`);
        return { success: true };
      }

      return {
        success: false,
        error: result.stderr || 'Failed to set secret',
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to set secret',
      };
    }
  }

  /**
   * Lists secrets on a GitHub repository (names only, values are not returned)
   */
  async listSecrets(repo: string): Promise<{ success: boolean; secrets?: string[]; error?: string }> {
    try {
      const result = await this.executeGhCommand(['secret', 'list'], repo);

      if (result.exitCode === 0) {
        const secrets = result.stdout
          .trim()
          .split('\n')
          .filter(line => line.trim())
          .map(line => line.split('\t')[0].trim());

        return { success: true, secrets };
      }

      return {
        success: false,
        error: result.stderr || 'Failed to list secrets',
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to list secrets',
      };
    }
  }

  /**
   * Pushes the current branch to the remote origin
   */
  async pushToRemote(
    repoPath: string,
    branch: string,
    repo: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const expandedPath = repoPath.startsWith('~')
        ? repoPath.replace('~', os.homedir())
        : repoPath;

      // Use git push with the repo URL
      const result = await execWithShellEnv(
        `git push -u origin ${branch}`,
        { cwd: expandedPath, timeout: 60000 }
      );

      if (result.exitCode === 0) {
        console.log(`[GitHubManager] Pushed ${branch} to origin for ${repo}`);
        return { success: true };
      }

      return {
        success: false,
        error: result.stderr || 'Failed to push to remote',
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to push to remote',
      };
    }
  }

  /**
   * Adds origin remote to a git repository
   */
  async addRemote(repoPath: string, repo: string): Promise<{ success: boolean; error?: string }> {
    try {
      const expandedPath = repoPath.startsWith('~')
        ? repoPath.replace('~', os.homedir())
        : repoPath;

      const remoteUrl = `https://github.com/${repo}.git`;

      // Check if origin already exists
      const checkResult = await execWithShellEnv('git remote get-url origin', {
        cwd: expandedPath,
        timeout: 5000,
      });

      if (checkResult.exitCode === 0) {
        // Remote exists, update it
        const result = await execWithShellEnv(`git remote set-url origin "${remoteUrl}"`, {
          cwd: expandedPath,
          timeout: 5000,
        });

        if (result.exitCode !== 0) {
          return { success: false, error: result.stderr || 'Failed to update remote' };
        }
      } else {
        // Add new remote
        const result = await execWithShellEnv(`git remote add origin "${remoteUrl}"`, {
          cwd: expandedPath,
          timeout: 5000,
        });

        if (result.exitCode !== 0) {
          return { success: false, error: result.stderr || 'Failed to add remote' };
        }
      }

      console.log(`[GitHubManager] Added origin remote: ${remoteUrl}`);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to add remote',
      };
    }
  }

  /**
   * Gets the authenticated user's username and organizations
   */
  async getAuthenticatedUser(): Promise<{ username?: string; orgs?: string[]; error?: string }> {
    try {
      // Get username
      const userResult = await execWithShellEnv('gh api user --jq .login', { cwd: os.homedir(), timeout: 10000 });
      if (userResult.exitCode !== 0) {
        return { error: userResult.stderr || 'Failed to get user info' };
      }
      const username = userResult.stdout.trim();

      // Get organizations
      const orgsResult = await execWithShellEnv('gh api user/orgs --jq ".[].login"', { cwd: os.homedir(), timeout: 10000 });
      const orgs = orgsResult.exitCode === 0
        ? orgsResult.stdout.trim().split('\n').filter(Boolean)
        : [];

      return { username, orgs };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Failed to get authenticated user',
      };
    }
  }

  /**
   * Validates a command against the whitelist
   */
  private validateCommand(args: string[], repo?: string): boolean {
    if (args.length < 2) {
      console.warn('[GitHubManager] Invalid command: insufficient arguments');
      return false;
    }

    const [command, subcommand] = args;
    const allowed = ALLOWED_COMMANDS.find(
      c => c.command === command && c.subcommand === subcommand
    );

    if (!allowed) {
      console.warn(`[GitHubManager] Command not in whitelist: ${command} ${subcommand}`);
      return false;
    }

    if (allowed.requiresRepo && !repo) {
      console.warn(`[GitHubManager] Command requires --repo flag: ${command} ${subcommand}`);
      return false;
    }

    return true;
  }

  /**
   * Executes a gh CLI command with validation
   */
  private async executeGhCommand(args: string[], repo?: string): Promise<ExecResult> {
    if (!this.validateCommand(args, repo)) {
      return {
        stdout: '',
        stderr: 'Command not allowed',
        exitCode: 1,
      };
    }

    const fullArgs = [...args];
    if (repo) {
      fullArgs.push('--repo', repo);
    }

    const command = `gh ${fullArgs.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`;
    console.log(`[GitHubManager] Executing: ${command}`);

    try {
      return await execWithShellEnv(command, { cwd: os.homedir(), timeout: 30000 });
    } catch (err) {
      return {
        stdout: '',
        stderr: err instanceof Error ? err.message : 'Command failed',
        exitCode: 1,
      };
    }
  }
}
