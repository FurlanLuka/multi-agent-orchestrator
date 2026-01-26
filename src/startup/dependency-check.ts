import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

export interface DependencyResult {
  name: string;
  available: boolean;
  version?: string;
  error?: string;
  installGuide?: string;
}

export interface DependencyCheckResult {
  allAvailable: boolean;
  dependencies: DependencyResult[];
  platform: string;
  timestamp: number;
}

/**
 * Check if Claude Code CLI is installed and accessible
 */
async function checkClaudeCode(): Promise<DependencyResult> {
  const installGuide = getClaudeCodeInstallGuide();

  try {
    const { stdout } = await execAsync('claude --version', {
      timeout: 10000, // 10 second timeout
    });

    // Parse version from output (format: "claude version X.Y.Z" or similar)
    const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
    const version = versionMatch ? versionMatch[1] : stdout.trim();

    return {
      name: 'Claude Code',
      available: true,
      version,
    };
  } catch (err: any) {
    // Check specific error types
    if (err.code === 'ENOENT' || (err.message && err.message.includes('not found'))) {
      return {
        name: 'Claude Code',
        available: false,
        error: 'Claude Code CLI not found in PATH',
        installGuide,
      };
    }

    return {
      name: 'Claude Code',
      available: false,
      error: err.message || 'Failed to check Claude Code',
      installGuide,
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
    const { stdout } = await execAsync('git --version', {
      timeout: 5000,
    });

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
 * Run all dependency checks
 */
export async function checkDependencies(): Promise<DependencyCheckResult> {
  const dependencies = await Promise.all([
    checkClaudeCode(),
    checkNodeJs(),
    checkGit(),
  ]);

  const allAvailable = dependencies.every((d) => d.available);

  return {
    allAvailable,
    dependencies,
    platform: os.platform(),
    timestamp: Date.now(),
  };
}

/**
 * Check only critical dependencies (Claude Code)
 */
export async function checkCriticalDependencies(): Promise<DependencyCheckResult> {
  const claudeResult = await checkClaudeCode();

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
