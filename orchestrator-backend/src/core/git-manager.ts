import * as fs from 'fs';
import * as path from 'path';
import { execWithShellEnv } from '../utils/shell-env';

/**
 * GitManager handles git operations for project repositories.
 * Supports feature branches, auto-commits, and push operations.
 */
export class GitManager {
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
   * Executes a git command in the specified directory
   */
  private async runGitCommand(
    cwd: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const expandedCwd = this.expandPath(cwd);

    // Escape args for shell
    const escapedArgs = args.map(arg => {
      if (arg.includes(' ') || arg.includes("'") || arg.includes('"')) {
        return `"${arg.replace(/"/g, '\\"')}"`;
      }
      return arg;
    });

    return execWithShellEnv(`git ${escapedArgs.join(' ')}`, {
      cwd: expandedCwd,
    });
  }

  /**
   * Checks if a directory is a git repository
   */
  async isGitRepo(projectPath: string): Promise<boolean> {
    const expandedPath = this.expandPath(projectPath);
    const gitDir = path.join(expandedPath, '.git');
    return fs.existsSync(gitDir);
  }

  /**
   * Initializes a git repository (non-destructive - no-op if already a repo)
   * Ensures the main branch exists with at least one commit
   */
  async initRepo(projectPath: string, mainBranch: string = 'main'): Promise<{ success: boolean; message: string }> {
    const isRepo = await this.isGitRepo(projectPath);

    if (!isRepo) {
      // Initialize new git repo
      const result = await this.runGitCommand(projectPath, ['init']);
      if (result.exitCode !== 0) {
        console.error(`[GitManager] Failed to init repo at ${projectPath}: ${result.stderr}`);
        return { success: false, message: result.stderr || 'Failed to initialize git repository' };
      }
      console.log(`[GitManager] Initialized git repository at ${projectPath}`);
    } else {
      console.log(`[GitManager] ${projectPath} is already a git repository`);
    }

    // Check if any commits exist
    const logResult = await this.runGitCommand(projectPath, ['log', '--oneline', '-1']);
    const hasCommits = logResult.exitCode === 0;

    if (!hasCommits) {
      // No commits - create initial commit on main branch
      // First, checkout/create the main branch
      const checkoutResult = await this.runGitCommand(projectPath, ['checkout', '-b', mainBranch]);
      if (checkoutResult.exitCode !== 0 && !checkoutResult.stderr.includes('already exists')) {
        // If branch creation failed and it's not because it already exists, try just checkout
        await this.runGitCommand(projectPath, ['checkout', mainBranch]);
      }

      // Create an initial empty commit
      const commitResult = await this.runGitCommand(projectPath, ['commit', '--allow-empty', '-m', 'Initial commit']);
      if (commitResult.exitCode === 0) {
        console.log(`[GitManager] Created initial commit on branch '${mainBranch}' at ${projectPath}`);
      } else {
        console.warn(`[GitManager] Failed to create initial commit: ${commitResult.stderr}`);
      }
    } else {
      // Has commits - ensure main branch exists
      const mainBranchExists = await this.branchExists(projectPath, mainBranch);
      if (!mainBranchExists) {
        // Create the main branch pointing to current HEAD
        const branchResult = await this.runGitCommand(projectPath, ['branch', mainBranch]);
        if (branchResult.exitCode === 0) {
          console.log(`[GitManager] Created branch '${mainBranch}' at ${projectPath}`);
        } else {
          console.warn(`[GitManager] Failed to create branch '${mainBranch}': ${branchResult.stderr}`);
        }
      }
    }

    return { success: true, message: isRepo ? 'Already a git repository' : 'Git repository initialized' };
  }

  /**
   * Gets the current branch name
   */
  async getCurrentBranch(projectPath: string): Promise<string | null> {
    const result = await this.runGitCommand(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (result.exitCode === 0) {
      return result.stdout;
    }
    return null;
  }

  /**
   * Checks if a branch exists locally
   */
  async branchExists(projectPath: string, branchName: string): Promise<boolean> {
    const result = await this.runGitCommand(projectPath, [
      'show-ref',
      '--verify',
      '--quiet',
      `refs/heads/${branchName}`,
    ]);
    return result.exitCode === 0;
  }

  /**
   * Creates and checks out a new branch, or just checks out if it exists
   */
  async createAndCheckoutBranch(
    projectPath: string,
    branchName: string
  ): Promise<{ success: boolean; message: string; created: boolean }> {
    const exists = await this.branchExists(projectPath, branchName);

    if (exists) {
      // Branch exists, just checkout
      const result = await this.runGitCommand(projectPath, ['checkout', branchName]);
      if (result.exitCode === 0) {
        console.log(`[GitManager] Checked out existing branch '${branchName}' at ${projectPath}`);
        return { success: true, message: `Checked out branch '${branchName}'`, created: false };
      }
      console.error(`[GitManager] Failed to checkout branch '${branchName}': ${result.stderr}`);
      return { success: false, message: result.stderr || 'Failed to checkout branch', created: false };
    }

    // Create and checkout new branch
    const result = await this.runGitCommand(projectPath, ['checkout', '-b', branchName]);
    if (result.exitCode === 0) {
      console.log(`[GitManager] Created and checked out new branch '${branchName}' at ${projectPath}`);
      return { success: true, message: `Created branch '${branchName}'`, created: true };
    }

    console.error(`[GitManager] Failed to create branch '${branchName}': ${result.stderr}`);
    return { success: false, message: result.stderr || 'Failed to create branch', created: false };
  }

  /**
   * Stages all changes and creates a commit
   * Returns success: false with message if there are no changes to commit
   */
  async commit(
    projectPath: string,
    message: string
  ): Promise<{ success: boolean; message: string; commitHash?: string }> {
    // First, check if there are any changes to commit
    const statusResult = await this.runGitCommand(projectPath, ['status', '--porcelain']);
    if (statusResult.exitCode !== 0) {
      return { success: false, message: statusResult.stderr || 'Failed to get git status' };
    }

    if (!statusResult.stdout.trim()) {
      console.log(`[GitManager] No changes to commit at ${projectPath}`);
      return { success: true, message: 'No changes to commit' };
    }

    // Stage all changes
    const addResult = await this.runGitCommand(projectPath, ['add', '-A']);
    if (addResult.exitCode !== 0) {
      console.error(`[GitManager] Failed to stage changes: ${addResult.stderr}`);
      return { success: false, message: addResult.stderr || 'Failed to stage changes' };
    }

    // Create commit
    const commitResult = await this.runGitCommand(projectPath, ['commit', '-m', message]);
    if (commitResult.exitCode !== 0) {
      // Check if the error is "nothing to commit"
      if (commitResult.stdout.includes('nothing to commit') || commitResult.stderr.includes('nothing to commit')) {
        console.log(`[GitManager] No changes to commit at ${projectPath}`);
        return { success: true, message: 'No changes to commit' };
      }
      console.error(`[GitManager] Failed to commit: ${commitResult.stderr}`);
      return { success: false, message: commitResult.stderr || 'Failed to commit' };
    }

    // Get the commit hash
    const hashResult = await this.runGitCommand(projectPath, ['rev-parse', 'HEAD']);
    const commitHash = hashResult.exitCode === 0 ? hashResult.stdout.slice(0, 7) : undefined;

    console.log(`[GitManager] Created commit at ${projectPath}: ${message} (${commitHash || 'unknown'})`);
    return { success: true, message: `Committed: ${message}`, commitHash };
  }

  /**
   * Pushes a branch to origin
   * Sets upstream (-u) on first push
   */
  async pushBranch(
    projectPath: string,
    branchName: string
  ): Promise<{ success: boolean; message: string }> {
    // Check if remote 'origin' exists
    const remoteResult = await this.runGitCommand(projectPath, ['remote', 'get-url', 'origin']);
    if (remoteResult.exitCode !== 0) {
      console.error(`[GitManager] No remote 'origin' configured at ${projectPath}`);
      return { success: false, message: 'No remote \'origin\' configured. Please add a remote first.' };
    }

    // Push with -u to set upstream
    const pushResult = await this.runGitCommand(projectPath, ['push', '-u', 'origin', branchName]);
    if (pushResult.exitCode === 0) {
      console.log(`[GitManager] Pushed branch '${branchName}' to origin at ${projectPath}`);
      return { success: true, message: `Pushed branch '${branchName}' to origin` };
    }

    // Check for common errors
    const errorOutput = pushResult.stderr.toLowerCase();
    if (errorOutput.includes('permission denied') || errorOutput.includes('authentication failed')) {
      return { success: false, message: 'Push failed: Authentication/permission denied. Check your git credentials.' };
    }
    if (errorOutput.includes('could not resolve host')) {
      return { success: false, message: 'Push failed: Could not connect to remote. Check your network connection.' };
    }

    console.error(`[GitManager] Failed to push branch '${branchName}': ${pushResult.stderr}`);
    return { success: false, message: pushResult.stderr || 'Failed to push branch' };
  }

  /**
   * Generates a branch name from a feature description
   * Format: feature/kebab-case-feature-name (max 50 chars)
   */
  generateBranchName(feature: string): string {
    const kebabCase = feature
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
    return `feature/${kebabCase}`;
  }

  /**
   * Gets the diff of uncommitted changes (for debugging/logging)
   */
  async getDiff(projectPath: string): Promise<string> {
    const result = await this.runGitCommand(projectPath, ['diff', '--stat']);
    return result.stdout;
  }

  /**
   * Merges a branch into the target branch (typically main)
   * Checks out target, pulls latest, merges source, pushes
   */
  async mergeBranch(
    projectPath: string,
    sourceBranch: string,
    targetBranch: string
  ): Promise<{ success: boolean; message: string }> {
    // 1. Checkout target branch
    const checkoutResult = await this.runGitCommand(projectPath, ['checkout', targetBranch]);
    if (checkoutResult.exitCode !== 0) {
      return { success: false, message: `Failed to checkout ${targetBranch}: ${checkoutResult.stderr}` };
    }

    // 2. Pull latest changes
    const pullResult = await this.runGitCommand(projectPath, ['pull', 'origin', targetBranch]);
    if (pullResult.exitCode !== 0) {
      // Try to recover - go back to source branch
      await this.runGitCommand(projectPath, ['checkout', sourceBranch]);
      return { success: false, message: `Failed to pull ${targetBranch}: ${pullResult.stderr}` };
    }

    // 3. Merge source branch
    const mergeResult = await this.runGitCommand(projectPath, ['merge', sourceBranch, '--no-edit']);
    if (mergeResult.exitCode !== 0) {
      // Abort merge and go back to source branch
      await this.runGitCommand(projectPath, ['merge', '--abort']);
      await this.runGitCommand(projectPath, ['checkout', sourceBranch]);

      const errorOutput = mergeResult.stderr.toLowerCase();
      if (errorOutput.includes('conflict')) {
        return { success: false, message: 'Merge failed: conflicts detected. Please resolve manually.' };
      }
      return { success: false, message: `Merge failed: ${mergeResult.stderr}` };
    }

    // 4. Push merged changes
    const pushResult = await this.runGitCommand(projectPath, ['push', 'origin', targetBranch]);
    if (pushResult.exitCode !== 0) {
      // Go back to source branch but keep the merge locally
      await this.runGitCommand(projectPath, ['checkout', sourceBranch]);
      return { success: false, message: `Merge succeeded but push failed: ${pushResult.stderr}` };
    }

    // 5. Go back to source branch
    await this.runGitCommand(projectPath, ['checkout', sourceBranch]);

    console.log(`[GitManager] Merged '${sourceBranch}' into '${targetBranch}' at ${projectPath}`);
    return { success: true, message: `Merged '${sourceBranch}' into '${targetBranch}'` };
  }
}
