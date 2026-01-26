import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execAsync = promisify(exec);

/**
 * Execute command via interactive login shell to get user's full PATH
 * This ensures nvm, homebrew, etc. paths are available
 * -l = login shell (sources .zprofile/.bash_profile)
 * -i = interactive shell (sources .zshrc/.bashrc where nvm is typically loaded)
 */
function execWithUserPath(command: string, timeout: number): Promise<{ stdout: string; stderr: string }> {
  const shell = process.env.SHELL || '/bin/bash';
  // Use both -l (login) and -i (interactive) to source all profile files
  return execAsync(`${shell} -l -i -c "${command}"`, {
    timeout,
    env: { ...process.env, HOME: os.homedir() },
  });
}

/**
 * Get shell environment with user's full PATH
 * Exported for use when spawning processes elsewhere
 */
export async function getShellEnv(): Promise<Record<string, string>> {
  try {
    const shell = process.env.SHELL || '/bin/bash';
    // Use both -l (login) and -i (interactive) to get full env including nvm
    const { stdout } = await execAsync(`${shell} -l -i -c "env"`, {
      timeout: 5000,
      env: { ...process.env, HOME: os.homedir() },
    });

    const env: Record<string, string> = {};
    for (const line of stdout.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) {
        env[line.substring(0, idx)] = line.substring(idx + 1);
      }
    }
    return env;
  } catch {
    return process.env as Record<string, string>;
  }
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
 */
async function checkClaudeCode(): Promise<DependencyResult> {
  const installGuide = getClaudeCodeInstallGuide();
  const shell = process.env.SHELL || '/bin/bash';
  const debugLines: string[] = [];

  debugLines.push(`Shell: ${shell}`);
  debugLines.push(`HOME: ${os.homedir()}`);
  debugLines.push(`Process PATH: ${process.env.PATH?.substring(0, 150)}...`);

  console.log('[DependencyCheck] Checking for Claude CLI...');
  console.log(`[DependencyCheck] Using shell: ${shell}`);
  console.log(`[DependencyCheck] HOME: ${os.homedir()}`);
  console.log(`[DependencyCheck] Current PATH: ${process.env.PATH?.substring(0, 200)}...`);

  try {
    // First, try to get the shell's PATH to debug (use -l -i for full env)
    let shellPath = '';
    try {
      const { stdout: pathOutput } = await execAsync(`${shell} -l -i -c "echo \\$PATH"`, {
        timeout: 5000,
        env: { ...process.env, HOME: os.homedir() },
      });
      shellPath = pathOutput.trim();
      debugLines.push(`Shell PATH (-l -i): ${shellPath.substring(0, 150)}...`);
      console.log(`[DependencyCheck] Shell PATH: ${shellPath.substring(0, 200)}...`);
    } catch (pathErr: any) {
      debugLines.push(`Shell PATH error: ${pathErr.message}`);
      console.log(`[DependencyCheck] Failed to get shell PATH: ${pathErr.message}`);
    }

    // Try to find claude using 'which' first
    let whichResult = '';
    try {
      const { stdout: whichOutput } = await execAsync(`${shell} -l -i -c "which claude"`, {
        timeout: 5000,
        env: { ...process.env, HOME: os.homedir() },
      });
      whichResult = whichOutput.trim();
      debugLines.push(`which claude: ${whichResult}`);
      console.log(`[DependencyCheck] 'which claude' returned: ${whichResult}`);
    } catch (whichErr: any) {
      debugLines.push(`which claude: not found (${whichErr.message})`);
      console.log(`[DependencyCheck] 'which claude' failed: ${whichErr.message}`);
    }

    // Use login shell to get user's full PATH (nvm, homebrew, etc.)
    const { stdout } = await execWithUserPath('claude --version', 10000);
    console.log(`[DependencyCheck] Claude version output: ${stdout.trim()}`);

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

    console.log(`[DependencyCheck] Claude check failed:`);
    console.log(`[DependencyCheck]   Error code: ${err.code}`);
    console.log(`[DependencyCheck]   Error message: ${err.message}`);
    console.log(`[DependencyCheck]   Stderr: ${err.stderr || 'none'}`);

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
