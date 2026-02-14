import * as os from 'os';
import { getShellEnv, clearShellEnvCache, execWithShellEnv } from '../utils/shell-env';

// Re-export for backwards compatibility
export { getShellEnv, clearShellEnvCache };

// Cache for deduplicating concurrent dependency checks
let pendingCheckPromise: Promise<DependencyCheckResult> | null = null;
let cachedCheckResult: DependencyCheckResult | null = null;
const CACHE_TTL = 30000; // 30 seconds

/**
 * Execute command with user's shell environment
 */
async function execWithUserPath(command: string, timeout: number): Promise<{ stdout: string; stderr: string }> {
  const result = await execWithShellEnv(command, { cwd: os.homedir(), timeout });
  return { stdout: result.stdout, stderr: result.stderr };
}

export interface DependencyResult {
  name: string;
  available: boolean;
  version?: string;
  error?: string;
  installGuide?: string;
  debug?: string;  // Debug info for troubleshooting
}

export interface DependencyCheckResult {
  allAvailable: boolean;
  dependencies: DependencyResult[];
  platform: string;
  timestamp: number;
}

/**
 * Check if Claude Code CLI is installed and accessible
 * Uses pre-warmed shell env cache to avoid redundant shell spawns
 */
async function checkClaudeCode(shellEnv: Record<string, string>): Promise<DependencyResult> {
  const installGuide = getClaudeCodeInstallGuide();
  const shell = shellEnv.SHELL || process.env.SHELL || '/bin/bash';
  const debugLines: string[] = [];

  debugLines.push(`Shell: ${shell}`);
  debugLines.push(`HOME: ${os.homedir()}`);
  debugLines.push(`Shell PATH: ${shellEnv.PATH?.substring(0, 150) || 'not set'}...`);

  console.log('[DependencyCheck] Checking for Claude CLI...');

  try {
    // Use login shell to get user's full PATH (nvm, homebrew, etc.)
    const { stdout } = await execWithUserPath('claude --version', 10000);
    console.log(`[DependencyCheck] Claude version: ${stdout.trim()}`);

    // Parse version from output (format: "claude version X.Y.Z" or similar)
    const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
    const version = versionMatch ? versionMatch[1] : stdout.trim();

    return {
      name: 'Claude Code',
      available: true,
      version,
      debug: debugLines.join('\n'),
    };
  } catch (err: any) {
    debugLines.push(`Error code: ${err.code || 'none'}`);
    debugLines.push(`Error: ${err.message}`);
    if (err.stderr) {
      debugLines.push(`Stderr: ${err.stderr}`);
    }

    console.log(`[DependencyCheck] Claude check failed: ${err.message}`);

    // Check specific error types
    if (err.code === 'ENOENT' || (err.message && err.message.includes('not found'))) {
      return {
        name: 'Claude Code',
        available: false,
        error: 'Claude Code CLI not found in PATH',
        installGuide,
        debug: debugLines.join('\n'),
      };
    }

    return {
      name: 'Claude Code',
      available: false,
      error: err.message || 'Failed to check Claude Code',
      installGuide,
      debug: debugLines.join('\n'),
    };
  }
}

/**
 * Check if Node.js is available (should always be true if we're running)
 */
async function checkNodeJs(): Promise<DependencyResult> {
  return {
    name: 'Node.js',
    available: true,
    version: process.version,
  };
}

/**
 * Check if Git is installed
 */
async function checkGit(): Promise<DependencyResult> {
  try {
    // Use login shell to get user's full PATH
    const { stdout } = await execWithUserPath('git --version', 5000);

    const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
    const version = versionMatch ? versionMatch[1] : stdout.trim();

    return {
      name: 'Git',
      available: true,
      version,
    };
  } catch (err: any) {
    return {
      name: 'Git',
      available: false,
      error: err.message || 'Git not found',
      installGuide: getGitInstallGuide(),
    };
  }
}

/**
 * Check if GitHub CLI (gh) is installed
 */
async function checkGitHubCLI(): Promise<DependencyResult> {
  try {
    const { stdout } = await execWithUserPath('gh --version', 5000);

    const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
    const version = versionMatch ? versionMatch[1] : stdout.trim().split('\n')[0];

    return {
      name: 'GitHub CLI',
      available: true,
      version,
    };
  } catch (err: any) {
    return {
      name: 'GitHub CLI',
      available: false,
      error: err.message || 'GitHub CLI not found',
      installGuide: getGitHubCLIInstallGuide(),
    };
  }
}

/**
 * Get platform-specific install guide for GitHub CLI
 */
function getGitHubCLIInstallGuide(): string {
  const platform = os.platform();

  if (platform === 'darwin') {
    return 'Install GitHub CLI:\n  brew install gh\n\nThen authenticate:\n  gh auth login';
  }

  if (platform === 'win32') {
    return 'Install GitHub CLI:\n  winget install --id GitHub.cli\n\nThen authenticate:\n  gh auth login';
  }

  return 'Install GitHub CLI:\n  sudo apt install gh  (Debian/Ubuntu)\n  sudo dnf install gh  (Fedora/RHEL)\n  See https://github.com/cli/cli#installation for other distros\n\nThen authenticate:\n  gh auth login';
}

/**
 * Get platform-specific install guide for Claude Code
 */
function getClaudeCodeInstallGuide(): string {
  const platform = os.platform();

  const baseGuide = `
Claude Code is required to run this orchestrator.

Install Claude Code:
  npm install -g @anthropic-ai/claude-code

Or with Homebrew (macOS):
  brew install claude-code

After installation, run:
  claude auth

For more information:
  https://docs.anthropic.com/claude-code
`.trim();

  if (platform === 'darwin') {
    return `${baseGuide}

macOS Tip: If you installed Node.js via nvm or brew,
make sure your shell profile sources the correct paths.`;
  }

  if (platform === 'win32') {
    return `${baseGuide}

Windows Tip: You may need to restart your terminal
or add npm global bin to your PATH.`;
  }

  return baseGuide;
}

/**
 * Get platform-specific install guide for Git
 */
function getGitInstallGuide(): string {
  const platform = os.platform();

  if (platform === 'darwin') {
    return 'Install Git:\n  xcode-select --install\n  or: brew install git';
  }

  if (platform === 'win32') {
    return 'Install Git:\n  Download from https://git-scm.com/download/win';
  }

  return 'Install Git:\n  sudo apt install git  (Debian/Ubuntu)\n  sudo dnf install git  (Fedora)';
}

/**
 * Run all dependency checks (with deduplication for concurrent requests)
 */
export async function checkDependencies(): Promise<DependencyCheckResult> {
  // Return cached result if still valid
  if (cachedCheckResult && Date.now() - cachedCheckResult.timestamp < CACHE_TTL) {
    console.log('[DependencyCheck] Returning cached result');
    return cachedCheckResult;
  }

  // If a check is already in progress, wait for it
  if (pendingCheckPromise) {
    console.log('[DependencyCheck] Check already in progress, waiting...');
    return pendingCheckPromise;
  }

  // Create and store the promise to deduplicate concurrent calls
  pendingCheckPromise = (async () => {
    try {
      // Pre-warm shell env cache (single call, shared by all checks)
      console.log('[DependencyCheck] Pre-warming shell environment...');
      const shellEnv = await getShellEnv();

      const dependencies = await Promise.all([
        checkClaudeCode(shellEnv),
        checkNodeJs(),
        checkGit(),
        checkGitHubCLI(),
      ]);

      // gh is optional, so only check critical deps for allAvailable
      const criticalDeps = dependencies.filter(d => d.name !== 'GitHub CLI');
      const allAvailable = criticalDeps.every((d) => d.available);

      const result: DependencyCheckResult = {
        allAvailable,
        dependencies,
        platform: os.platform(),
        timestamp: Date.now(),
      };

      // Cache the result
      cachedCheckResult = result;
      return result;
    } finally {
      pendingCheckPromise = null;
    }
  })();

  return pendingCheckPromise;
}

/**
 * Check only critical dependencies (Claude Code)
 */
export async function checkCriticalDependencies(): Promise<DependencyCheckResult> {
  // Pre-warm shell env cache
  const shellEnv = await getShellEnv();
  const claudeResult = await checkClaudeCode(shellEnv);

  return {
    allAvailable: claudeResult.available,
    dependencies: [claudeResult],
    platform: os.platform(),
    timestamp: Date.now(),
  };
}

/**
 * Format dependency check results for display
 */
export function formatDependencyResults(result: DependencyCheckResult): string {
  const lines: string[] = ['Dependency Check:', ''];

  for (const dep of result.dependencies) {
    const status = dep.available ? '✓' : '✗';
    const version = dep.version ? ` (${dep.version})` : '';
    lines.push(`  ${status} ${dep.name}${version}`);

    if (!dep.available && dep.error) {
      lines.push(`    Error: ${dep.error}`);
    }

    if (!dep.available && dep.installGuide) {
      lines.push('');
      // Indent install guide
      const guideLines = dep.installGuide.split('\n').map((l) => `    ${l}`);
      lines.push(...guideLines);
      lines.push('');
    }
  }

  if (!result.allAvailable) {
    lines.push('');
    lines.push('Please install missing dependencies and restart.');
  }

  return lines.join('\n');
}
