/**
 * Get environment variables from the user's shell.
 *
 * This is needed because GUI apps on macOS don't inherit shell environment
 * variables like PATH set in .zshrc, .bashrc, etc.
 *
 * Handles version managers (nvm, pyenv, rbenv) that use lazy initialization.
 */

import { execSync, exec, spawn, ChildProcess, SpawnOptions } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as path from 'path';

const execAsync = promisify(exec);

const DELIMITER = '_SHELL_ENV_DELIMITER_';

// Cache for shell env (per process lifetime)
let cachedShellEnv: Record<string, string> | null = null;
// Promise cache to prevent race conditions during concurrent calls
let pendingShellEnvPromise: Promise<Record<string, string>> | null = null;

/**
 * Get the user's default shell
 */
export function getDefaultShell(): string {
  return process.env.SHELL || '/bin/zsh';
}

/**
 * Get the shell config file to source based on shell type
 */
export function getShellConfigFile(shell: string): string {
  const shellName = path.basename(shell);
  const home = os.homedir();

  switch (shellName) {
    case 'zsh':
      return `${home}/.zshrc`;
    case 'bash':
      // bash uses .bashrc for interactive, .bash_profile for login
      return `${home}/.bashrc`;
    case 'fish':
      return `${home}/.config/fish/config.fish`;
    default:
      // For unknown shells, try common patterns
      return `${home}/.${shellName}rc`;
  }
}

/**
 * Get the source command for a shell config file
 */
export function getSourceCommand(shell: string): string {
  const configFile = getShellConfigFile(shell);
  const shellName = path.basename(shell);

  if (shellName === 'fish') {
    return `[ -f "${configFile}" ] && source "${configFile}"`;
  }

  // For bash/zsh and others
  return `[ -f "${configFile}" ] && . "${configFile}"`;
}

/**
 * Strip ANSI escape codes from a string
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/**
 * Parse environment variables from shell output
 */
function parseEnv(output: string): Record<string, string> {
  const parts = output.split(DELIMITER);
  const env = parts[1];
  if (!env) {
    return {};
  }

  const result: Record<string, string> = {};

  for (const line of stripAnsi(env).split('\n').filter(Boolean)) {
    const [key, ...values] = line.split('=');
    if (key) {
      result[key] = values.join('=');
    }
  }

  return result;
}

/**
 * Get the minimal environment needed to initialize a shell
 */
export function getMinimalEnv(): Record<string, string> {
  const home = os.homedir();
  return {
    HOME: home,
    USER: process.env.USER || os.userInfo().username,
    SHELL: getDefaultShell(),
    TERM: 'xterm-256color',
    LANG: process.env.LANG || 'en_US.UTF-8',
    PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    // Disable interactive features that cause issues
    DISABLE_AUTO_UPDATE: 'true',
    ZSH_DISABLE_COMPFIX: 'true',
  };
}

/**
 * Get environment variables from the shell by sourcing the config file.
 * This properly initializes version managers like nvm, pyenv, rbenv.
 */
export async function getShellEnv(forceRefresh = false): Promise<Record<string, string>> {
  // Return cached if available
  if (cachedShellEnv && !forceRefresh) {
    return cachedShellEnv;
  }

  // If a capture is already in progress, wait for it (prevents race condition)
  if (pendingShellEnvPromise && !forceRefresh) {
    return pendingShellEnvPromise;
  }

  if (process.platform === 'win32') {
    return process.env as Record<string, string>;
  }

  const shell = getDefaultShell();
  const sourceCmd = getSourceCommand(shell);

  // Source the shell config, then output env between delimiters
  const command = `${sourceCmd} 2>/dev/null; echo -n "${DELIMITER}"; env; echo -n "${DELIMITER}"`;

  console.log(`[shell-env] Capturing env from ${shell}...`);

  // Create and store the promise to prevent concurrent captures
  pendingShellEnvPromise = (async () => {
    try {
      // Use -l (login) and -i (interactive) flags to ensure all shell configs load (especially nvm)
      const { stdout } = await execAsync(`${shell} -l -i -c '${command}'`, {
        env: getMinimalEnv(),
        timeout: 15000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const env = parseEnv(stdout);

      if (env.PATH) {
        console.log(`[shell-env] Captured PATH (first 150 chars): ${env.PATH.substring(0, 150)}...`);
      }

      // Cache it
      cachedShellEnv = env;
      return env;
    } catch (error: any) {
      console.error(`[shell-env] Failed to capture shell env: ${error.message}`);
      // Fall back to process.env
      return process.env as Record<string, string>;
    } finally {
      pendingShellEnvPromise = null;
    }
  })();

  return pendingShellEnvPromise;
}

/**
 * Clear the cached shell environment
 */
export function clearShellEnvCache(): void {
  cachedShellEnv = null;
  pendingShellEnvPromise = null;
  console.log('[shell-env] Cache cleared');
}

/**
 * Spawn a command using the user's shell with full environment.
 * Uses cached shell env for speed - only sources config once at startup.
 *
 * @param command - Either a command string (passed to shell -c) or command name (when args provided)
 * @param options - Spawn options including optional args array for direct spawn (no shell parsing)
 */
export async function spawnWithShellEnv(
  command: string,
  options: {
    cwd: string;
    args?: string[];  // If provided, spawn command directly without shell (safer for complex args)
    stdio?: SpawnOptions['stdio'];
    detached?: boolean;
    extraEnv?: Record<string, string>;
  }
): Promise<ChildProcess> {
  // Get cached shell env (sources config only once)
  const shellEnv = await getShellEnv();
  const shell = shellEnv.SHELL || getDefaultShell();

  const env = {
    ...shellEnv,
    ...options.extraEnv,
  };

  let proc: ChildProcess;

  if (options.args) {
    // Direct spawn without shell - safer for complex arguments (prompts, etc.)
    proc = spawn(command, options.args, {
      cwd: options.cwd,
      stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
      detached: options.detached || false,
      env,
    });
  } else {
    // Shell spawn - for simple commands that need shell features
    proc = spawn(shell, ['-c', command], {
      cwd: options.cwd,
      stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
      detached: options.detached || false,
      env,
    });
  }

  return proc;
}

/**
 * Execute a command and return output using the user's shell environment.
 * Uses cached shell env for speed.
 */
export async function execWithShellEnv(
  command: string,
  options: { cwd: string; timeout?: number }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = await spawnWithShellEnv(command, {
    cwd: options.cwd,
  });

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const timeout = options.timeout || 60000;
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve({ stdout, stderr: stderr + '\nTimeout', exitCode: 124 });
    }, timeout);

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number | null) => {
      clearTimeout(timer);
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1,
      });
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timer);
      resolve({
        stdout: '',
        stderr: String(err),
        exitCode: 1,
      });
    });
  });
}
