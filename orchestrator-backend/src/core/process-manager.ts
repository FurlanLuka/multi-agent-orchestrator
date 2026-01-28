import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config } from '@aio/types';
import { getCacheDir, ensureMcpServerExtracted } from '../config/paths';
import { spawnWithShellEnv } from '../utils/shell-env';

interface ManagedProcess {
  process: ChildProcess;
  project: string;
  type: 'devServer' | 'agent';
  startedAt: number;
  ready: boolean;
}

interface CrashInfo {
  count: number;
  lastCrash: number;
}

interface StreamJsonMessage {
  type: 'system' | 'assistant' | 'result' | 'error';
  subtype?: string;
  message?: {
    content?: Array<{ type: string; text?: string }>;
  };
  result?: string;
  is_error?: boolean;
}

export class ProcessManager extends EventEmitter {
  private config: Config;
  private processes: Map<string, ManagedProcess> = new Map();
  private crashCounts: Map<string, CrashInfo> = new Map();
  private logBuffer: Map<string, string[]> = new Map();
  private currentAgentProcess: Map<string, ChildProcess> = new Map();
  private readonly LOG_BUFFER_SIZE = 200;
  private orchestratorPort: number = 3456;

  constructor(config: Config) {
    super();
    this.config = config;
  }

  /**
   * Sets the orchestrator port for MCP permission server communication
   */
  setOrchestratorPort(port: number): void {
    this.orchestratorPort = port;
  }

  /**
   * Gets the path to the MCP permission server.
   * Extracts from bundled assets to ~/.aio-config/mcp/ if needed,
   * since pkg bundles can't be accessed by external node processes.
   */
  private getPermissionServerPath(): string {
    return ensureMcpServerExtracted();
  }

  /**
   * Generates a temporary MCP config file with the correct absolute paths
   * Returns the path to the generated config file
   * Config is written to cache dir (writable location)
   */
  private generateMcpConfig(): string {
    const configDir = getCacheDir();
    const configPath = path.join(configDir, 'generated-mcp-config.json');

    const config = {
      mcpServers: {
        'orchestrator-permission': {
          command: 'node',
          args: [this.getPermissionServerPath()]
        }
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return configPath;
  }

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
   * Gets the key for process storage
   */
  private getKey(project: string, type: 'devServer' | 'agent'): string {
    return `${project}-${type}`;
  }

  /**
   * Extracts port number from a URL string
   */
  private getPortFromUrl(url: string | undefined): number | null {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return parsed.port ? parseInt(parsed.port, 10) : null;
    } catch {
      return null;
    }
  }

  /**
   * Stores log lines for a project (for crash context)
   */
  private bufferLog(project: string, line: string): void {
    if (!this.logBuffer.has(project)) {
      this.logBuffer.set(project, []);
    }
    const buffer = this.logBuffer.get(project)!;
    buffer.push(line);
    if (buffer.length > this.LOG_BUFFER_SIZE) {
      buffer.shift();
    }
  }

  /**
   * Gets recent logs for crash context
   */
  getRecentLogs(project: string): string[] {
    return this.logBuffer.get(project) || [];
  }

  /**
   * Starts a dev server for a project
   */
  async startDevServer(project: string): Promise<void> {
    const projectConfig = this.config.projects[project];
    if (!projectConfig) {
      throw new Error(`Unknown project: ${project}`);
    }

    // Check if dev server is enabled (defaults to true for backwards compatibility)
    const devServerEnabled = projectConfig.devServerEnabled ?? true;
    if (!devServerEnabled) {
      console.log(`[ProcessManager] Dev server disabled for ${project}, skipping`);
      return;
    }

    if (!projectConfig.devServer) {
      throw new Error(`No dev server configured for project: ${project}`);
    }

    const key = this.getKey(project, 'devServer');
    if (this.processes.has(key)) {
      console.log(`[ProcessManager] Dev server already running for ${project}`);
      return;
    }

    const projectPath = this.expandPath(projectConfig.path);
    const readyPattern = new RegExp(projectConfig.devServer.readyPattern, 'i');

    console.log(`[ProcessManager] Starting dev server for ${project}: ${projectConfig.devServer.command}`);

    const proc = await spawnWithShellEnv(projectConfig.devServer.command, {
      cwd: projectPath,
      detached: true,
      extraEnv: projectConfig.devServer.env,
    });

    return new Promise((resolve, reject) => {
      const info: ManagedProcess = {
        process: proc,
        project,
        type: 'devServer',
        startedAt: Date.now(),
        ready: false
      };

      this.processes.set(key, info);

      // Capture stderr for error reporting
      let stderrBuffer = '';

      const handleOutput = (stream: 'stdout' | 'stderr') => (data: Buffer) => {
        if (stream === 'stderr') {
          stderrBuffer += data.toString();
        }
        const text = data.toString();
        const lines = text.split('\n').filter(l => l.trim());

        for (const line of lines) {
          this.bufferLog(project, `[${stream}] ${line}`);
          this.emit('log', { project, type: 'devServer', stream, text: line, timestamp: Date.now() });

          // Check for ready signal
          if (!info.ready && readyPattern.test(line)) {
            info.ready = true;
            console.log(`[ProcessManager] Dev server ready for ${project}`);
            this.emit('ready', { project, type: 'devServer' });
            resolve();
          }
        }
      };

      proc.stdout?.on('data', handleOutput('stdout'));
      proc.stderr?.on('data', handleOutput('stderr'));

      proc.on('error', (err) => {
        console.error(`[ProcessManager] Dev server error for ${project}:`, err);
        this.processes.delete(key);
        reject(err);
      });

      proc.on('exit', (code, signal) => {
        const uptime = Date.now() - info.startedAt;
        console.log(`[ProcessManager] Dev server for ${project} exited (code: ${code}, signal: ${signal}, uptime: ${uptime}ms)`);

        // Log stderr if process failed quickly (likely command not found)
        if (code === 127 || (code !== 0 && uptime < 5000)) {
          console.log(`[ProcessManager] Dev server stderr: ${stderrBuffer.trim() || '(empty)'}`);
        }

        this.processes.delete(key);
        this.emit('exit', { project, type: 'devServer', code, signal, uptime });

        // Handle crashes
        if (code !== 0 && code !== null) {
          this.handleCrash(project, 'devServer', code, uptime);
        }
      });

      // Timeout if server doesn't become ready
      const timeout = setTimeout(() => {
        if (!info.ready) {
          console.error(`[ProcessManager] Dev server for ${project} did not become ready in time`);
          proc.kill('SIGTERM');
          reject(new Error(`Dev server for ${project} did not become ready within 60 seconds`));
        }
      }, 60000);

      // Clear timeout on success
      proc.on('exit', () => clearTimeout(timeout));
    });
  }

  /**
   * Handles process crashes with retry logic
   */
  private handleCrash(project: string, type: 'devServer' | 'agent', code: number, uptime: number): void {
    const key = this.getKey(project, type);
    const crashInfo = this.crashCounts.get(key) || { count: 0, lastCrash: 0 };

    // Reset crash count if last crash was more than 5 minutes ago
    if (Date.now() - crashInfo.lastCrash > 300000) {
      crashInfo.count = 0;
    }

    crashInfo.count++;
    crashInfo.lastCrash = Date.now();
    this.crashCounts.set(key, crashInfo);

    const isQuickCrash = uptime < 10000;

    this.emit('crash', {
      project,
      type,
      code,
      uptime,
      crashCount: crashInfo.count,
      isQuickCrash
    });

    if (type === 'devServer') {
      if (isQuickCrash && crashInfo.count < this.config.defaults.maxRestarts) {
        // Quick crash - auto retry with backoff
        const delay = Math.pow(2, crashInfo.count) * 1000; // 2s, 4s, 8s
        console.log(`[ProcessManager] Quick crash for ${project}, retrying in ${delay}ms (attempt ${crashInfo.count}/${this.config.defaults.maxRestarts})`);

        setTimeout(async () => {
          try {
            await this.startDevServer(project);
          } catch (err) {
            console.error(`[ProcessManager] Failed to restart ${project}:`, err);
          }
        }, delay);
      } else if (crashInfo.count >= this.config.defaults.maxRestarts) {
        // Too many crashes - need agent intervention
        console.log(`[ProcessManager] ${project} crashed ${crashInfo.count} times, needs debugging`);
        this.emit('fatalCrash', {
          project,
          type,
          crashCount: crashInfo.count,
          recentLogs: this.getRecentLogs(project)
        });
      }
    }
  }

  /**
   * Sends a prompt to an agent and returns the response.
   * Used for E2E fix tasks that need direct prompting outside persistent sessions.
   * @param project The project name
   * @param prompt The prompt to send
   * @param taskIndex Optional task index for permission tracking
   */
  async sendToAgent(project: string, prompt: string, taskIndex?: number): Promise<string> {
    const projectConfig = this.config.projects[project];
    if (!projectConfig) {
      const availableProjects = Object.keys(this.config.projects).join(', ');
      throw new Error(`Unknown project: "${project}". Available projects: ${availableProjects}`);
    }

    const projectPath = this.expandPath(projectConfig.path);

    // Validate the path exists
    const fs = require('fs');
    if (!fs.existsSync(projectPath)) {
      throw new Error(`Project path does not exist: ${projectPath} (for project "${project}")`);
    }

    // Handle permissions - MCP handles live permission prompts, no need for settings.json
    const useDangerousMode = projectConfig.permissions?.dangerouslyAllowAll === true;

    console.log(`[ProcessManager] Sending to project "${project}" at path: ${projectPath}`);
    console.log(`[ProcessManager] Prompt preview: ${prompt.substring(0, 100)}...`);
    console.log(`[ProcessManager] Permissions mode: ${useDangerousMode ? 'DANGEROUS (skip all)' : 'MCP prompts'}`);

    // Build args
    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--no-session-persistence'
    ];

    if (useDangerousMode) {
      args.push('--dangerously-skip-permissions');
    } else {
      // Use MCP permission tool for live permission approval via UI
      const mcpConfigPath = this.generateMcpConfig();
      args.push('--mcp-config', mcpConfigPath);
      args.push('--permission-prompt-tool', 'mcp__orchestrator-permission__orchestrator_permission');
    }

    // Spawn claude directly with args array (no shell parsing - avoids escaping issues with prompts)
    const proc = await spawnWithShellEnv('claude', {
      cwd: projectPath,
      args: args,  // Pass args directly, no shell escaping needed
      extraEnv: {
        ORCHESTRATOR_URL: `http://localhost:${this.orchestratorPort}`,
        ORCHESTRATOR_PROJECT: project,
        ORCHESTRATOR_TASK_INDEX: String(taskIndex ?? 0),
      },
    });

    this.currentAgentProcess.set(project, proc);
    this.emit('promptSent', { project, length: prompt.length });

    return new Promise((resolve, reject) => {
      let responseBuffer = '';
      let resultText = '';
      let partialLine = ''; // Buffer for incomplete lines

      // Process stdout data as it arrives
      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = partialLine + chunk.toString();
        const lines = text.split('\n');

        // Last element might be incomplete - save it for next chunk
        partialLine = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const msg: StreamJsonMessage = JSON.parse(line);

            switch (msg.type) {
              case 'system':
                if (msg.subtype === 'init') {
                  console.log(`[ProcessManager] Agent ${project} process initialized`);
                }
                break;

              case 'assistant':
                // Extract text content from assistant message
                if (msg.message?.content) {
                  for (const block of msg.message.content) {
                    if (block.type === 'text' && block.text) {
                      responseBuffer += block.text;

                      // Emit for logging
                      const textLines = block.text.split('\n').filter((l: string) => l.trim());
                      for (const textLine of textLines) {
                        this.bufferLog(project, `[agent] ${textLine}`);
                        this.emit('log', { project, type: 'agent', stream: 'stdout', text: textLine, timestamp: Date.now() });

                        // Detect test status markers for real-time tracking
                        // Handle both plain and markdown-formatted output (with backticks)
                        const testStatusMatch = textLine.match(/`?\[TEST_STATUS\]\s*(\{.*\})`?/);
                        if (testStatusMatch) {
                          try {
                            const testStatus = JSON.parse(testStatusMatch[1]);
                            this.emit('testStatus', {
                              project,
                              scenario: testStatus.scenario,
                              status: testStatus.status,
                              error: testStatus.error,
                              timestamp: Date.now()
                            });
                          } catch {
                            // Invalid JSON, ignore
                          }
                        }

                        // Detect worker status markers for real-time project status updates
                        const workerStatusMatch = textLine.match(/`?\[WORKER_STATUS\]\s*(\{.*\})`?/);
                        if (workerStatusMatch) {
                          try {
                            const status = JSON.parse(workerStatusMatch[1]);
                            if (status.message) {
                              this.emit('workerStatus', {
                                project,
                                message: status.message,
                                timestamp: Date.now()
                              });
                            }
                          } catch {
                            // Invalid JSON, ignore
                          }
                        }
                      }
                    }
                  }
                }
                break;

              case 'result':
                // Final result
                resultText = msg.result || responseBuffer;
                console.log(`[ProcessManager] Agent ${project} completed task (${resultText.length} chars)`);
                break;

              case 'error':
                console.error(`[ProcessManager] Agent ${project} error:`, msg);
                break;
            }
          } catch (err) {
            // Not JSON - might be raw output
            this.bufferLog(project, `[agent:raw] ${line}`);
          }
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        // Only log if it's not just progress info
        if (!text.includes('Compiling') && !text.includes('Bundling')) {
          console.error(`[ProcessManager] Agent ${project} stderr:`, text);
          this.bufferLog(project, `[agent:stderr] ${text}`);
        }
      });

      proc.on('error', (err) => {
        console.error(`[ProcessManager] Agent error for ${project}:`, err);
        this.currentAgentProcess.delete(project);
        reject(err);
      });

      proc.on('exit', (code, signal) => {
        // Process any remaining partial line
        if (partialLine.trim()) {
          try {
            const msg: StreamJsonMessage = JSON.parse(partialLine);
            if (msg.type === 'result') {
              resultText = msg.result || responseBuffer;
            }
          } catch {
            // Ignore parse errors on final partial line
          }
        }

        console.log(`[ProcessManager] Agent process for ${project} exited (code: ${code}, signal: ${signal})`);
        this.currentAgentProcess.delete(project);

        if (code === 0 || resultText) {
          this.emit('agentTaskComplete', { project, result: resultText });
          resolve(resultText);
        } else {
          reject(new Error(`Agent process exited with code ${code}`));
        }
      });

      // Set timeout for the entire operation
      const timeout = setTimeout(() => {
        if (this.currentAgentProcess.has(project)) {
          console.error(`[ProcessManager] Agent ${project} timeout - killing process`);
          proc.kill('SIGKILL');
          this.currentAgentProcess.delete(project);
          reject(new Error('Agent timeout'));
        }
      }, 300000 * 3); // 15 minute timeout for agent tasks

      proc.on('exit', () => clearTimeout(timeout));
    });
  }

  /**
   * Runs a persistent agent session that handles multiple tasks via task_complete MCP tool.
   * Similar to sendToAgent but without --no-session-persistence, allowing the agent
   * to maintain context across task_complete calls (which block waiting for our response).
   */
  async runPersistentAgent(project: string, prompt: string, taskIndex?: number): Promise<string> {
    const projectConfig = this.config.projects[project];
    if (!projectConfig) {
      throw new Error(`Unknown project: ${project}`);
    }

    const projectPath = this.expandPath(projectConfig.path);

    const fs = require('fs');
    if (!fs.existsSync(projectPath)) {
      throw new Error(`Project path does not exist: ${projectPath}`);
    }

    const useDangerousMode = projectConfig.permissions?.dangerouslyAllowAll === true;

    console.log(`[ProcessManager] Running persistent agent for "${project}"`);
    console.log(`[ProcessManager] Prompt preview: ${prompt.substring(0, 100)}...`);

    // Build args - note: NO --no-session-persistence to keep context
    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose'
      // Removed: --no-session-persistence (agent keeps context for multi-task sessions)
    ];

    if (useDangerousMode) {
      args.push('--dangerously-skip-permissions');
    } else {
      const mcpConfigPath = this.generateMcpConfig();
      args.push('--mcp-config', mcpConfigPath);
      args.push('--permission-prompt-tool', 'mcp__orchestrator-permission__orchestrator_permission');
    }

    const proc = await spawnWithShellEnv('claude', {
      cwd: projectPath,
      args,
      extraEnv: {
        ORCHESTRATOR_URL: `http://localhost:${this.orchestratorPort}`,
        ORCHESTRATOR_PROJECT: project,
        ORCHESTRATOR_TASK_INDEX: String(taskIndex ?? 0),
      },
    });

    this.currentAgentProcess.set(project, proc);
    this.emit('promptSent', { project, length: prompt.length });

    return new Promise((resolve, reject) => {
      let responseBuffer = '';
      let resultText = '';
      let partialLine = '';

      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = partialLine + chunk.toString();
        const lines = text.split('\n');
        partialLine = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const msg: StreamJsonMessage = JSON.parse(line);

            switch (msg.type) {
              case 'system':
                if (msg.subtype === 'init') {
                  console.log(`[ProcessManager] Persistent agent ${project} initialized`);
                }
                break;

              case 'assistant':
                if (msg.message?.content) {
                  for (const block of msg.message.content) {
                    if (block.type === 'text' && block.text) {
                      responseBuffer += block.text;

                      const textLines = block.text.split('\n').filter((l: string) => l.trim());
                      for (const textLine of textLines) {
                        this.bufferLog(project, `[agent] ${textLine}`);
                        this.emit('log', { project, type: 'agent', stream: 'stdout', text: textLine, timestamp: Date.now() });

                        // Detect worker status markers
                        const workerStatusMatch = textLine.match(/`?\[WORKER_STATUS\]\s*(\{.*\})`?/);
                        if (workerStatusMatch) {
                          try {
                            const status = JSON.parse(workerStatusMatch[1]);
                            if (status.message) {
                              this.emit('workerStatus', { project, message: status.message, timestamp: Date.now() });
                            }
                          } catch {
                            // Ignore
                          }
                        }
                      }
                    }
                  }
                }
                break;

              case 'result':
                resultText = msg.result || responseBuffer;
                console.log(`[ProcessManager] Persistent agent ${project} completed (${resultText.length} chars)`);
                break;

              case 'error':
                console.error(`[ProcessManager] Persistent agent ${project} error:`, msg);
                break;
            }
          } catch {
            this.bufferLog(project, `[agent:raw] ${line}`);
          }
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        if (!text.includes('Compiling') && !text.includes('Bundling')) {
          console.error(`[ProcessManager] Persistent agent ${project} stderr:`, text);
          this.bufferLog(project, `[agent:stderr] ${text}`);
        }
      });

      proc.on('error', (err) => {
        console.error(`[ProcessManager] Persistent agent error for ${project}:`, err);
        this.currentAgentProcess.delete(project);
        reject(err);
      });

      proc.on('exit', (code, signal) => {
        if (partialLine.trim()) {
          try {
            const msg: StreamJsonMessage = JSON.parse(partialLine);
            if (msg.type === 'result') {
              resultText = msg.result || responseBuffer;
            }
          } catch {
            // Ignore
          }
        }

        console.log(`[ProcessManager] Persistent agent ${project} exited (code: ${code}, signal: ${signal})`);
        this.currentAgentProcess.delete(project);

        if (code === 0 || resultText) {
          this.emit('agentTaskComplete', { project, result: resultText });
          resolve(resultText);
        } else {
          // Emit crash event so orchestrator can mark tasks as failed
          this.emit('persistentAgentCrash', {
            project,
            code,
            signal,
            error: `Persistent agent crashed unexpectedly (code: ${code}, signal: ${signal})`
          });
          reject(new Error(`Persistent agent exited with code ${code}`));
        }
      });

      // 30 minute timeout for persistent sessions (handles multiple tasks)
      const timeout = setTimeout(() => {
        if (this.currentAgentProcess.has(project)) {
          console.error(`[ProcessManager] Persistent agent ${project} timeout - killing process`);
          proc.kill('SIGKILL');
          this.currentAgentProcess.delete(project);
          reject(new Error('Persistent agent timeout (30 minutes)'));
        }
      }, 30 * 60 * 1000);

      proc.on('exit', () => clearTimeout(timeout));
    });
  }

  /**
   * Stops an agent if running
   */
  async stopAgent(project: string): Promise<void> {
    const proc = this.currentAgentProcess.get(project);
    if (proc) {
      console.log(`[ProcessManager] Stopping agent for ${project}`);
      proc.kill('SIGTERM');

      // Wait for process to exit
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (!this.currentAgentProcess.has(project)) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        // Force kill after 5 seconds
        setTimeout(() => {
          if (this.currentAgentProcess.has(project)) {
            proc.kill('SIGKILL');
            this.currentAgentProcess.delete(project);
            clearInterval(checkInterval);
            resolve();
          }
        }, 5000);
      });
    }
  }

  /**
   * Kills a process and ALL its child processes (tree kill)
   */
  private async killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
    const { exec } = require('child_process');

    return new Promise((resolve) => {
      // Use pgrep to find all child processes recursively
      exec(`pgrep -P ${pid}`, (error: Error | null, stdout: string) => {
        const childPids = stdout?.trim().split('\n').filter(Boolean).map(p => parseInt(p, 10)) || [];

        // Recursively kill children first
        const killChildren = async () => {
          for (const childPid of childPids) {
            await this.killProcessTree(childPid, signal);
          }
        };

        killChildren().then(() => {
          // Then kill the parent
          try {
            console.log(`[ProcessManager] Killing PID ${pid} with ${signal}`);
            process.kill(pid, signal);
          } catch {
            // Process may already be dead
          }
          resolve();
        });
      });

      // Safety timeout
      setTimeout(resolve, 3000);
    });
  }

  /**
   * Safely kills node/npm processes using a specific port
   * Only kills processes that look like dev servers (node, npm, tsx, ts-node, nest)
   */
  private async killProcessOnPort(port: number): Promise<void> {
    const { exec } = require('child_process');

    return new Promise((resolve) => {
      // Find PIDs on the port and check if they're node-related before killing
      exec(`lsof -ti:${port}`, (error: Error | null, stdout: string) => {
        if (error || !stdout.trim()) {
          resolve();
          return;
        }

        const pids = stdout.trim().split('\n').filter(Boolean);

        // For each PID, check if it's a node-related process before killing
        let checked = 0;
        for (const pid of pids) {
          // Get the command name for this PID
          exec(`ps -p ${pid} -o comm=`, (psError: Error | null, psStdout: string) => {
            checked++;
            const cmd = psStdout?.trim().toLowerCase() || '';

            // Only kill if it looks like a dev server process
            const safeToKill = ['node', 'npm', 'tsx', 'ts-node', 'nest', 'vite', 'esbuild', 'next'].some(
              name => cmd.includes(name)
            );

            if (safeToKill) {
              console.log(`[ProcessManager] Killing ${cmd} (PID ${pid}) on port ${port}`);
              try {
                process.kill(parseInt(pid), 'SIGKILL');
              } catch {
                // Process may already be dead
              }
            } else if (cmd) {
              console.warn(`[ProcessManager] Port ${port} used by "${cmd}" (PID ${pid}) - not killing (not a known dev server)`);
            }

            if (checked === pids.length) {
              resolve();
            }
          });
        }

        // Safety timeout
        setTimeout(resolve, 2000);
      });
    });
  }

  /**
   * Waits for a port to be free
   */
  private async waitForPortFree(port: number, maxWaitMs: number = 10000): Promise<boolean> {
    const net = require('net');
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const isFree = await new Promise<boolean>((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
          server.close();
          resolve(true);
        });
        server.listen(port);
      });

      if (isFree) {
        return true;
      }

      // Wait 200ms before retrying
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return false;
  }

  /**
   * Restarts a dev server
   */
  async restartDevServer(project: string): Promise<void> {
    const projectConfig = this.config.projects[project];

    // Check if dev server is enabled
    const devServerEnabled = projectConfig?.devServerEnabled ?? true;
    if (!devServerEnabled) {
      console.log(`[ProcessManager] Dev server disabled for ${project}, skipping restart`);
      return;
    }

    const key = this.getKey(project, 'devServer');
    const info = this.processes.get(key);
    const port = this.getPortFromUrl(projectConfig?.devServer?.url);

    if (info) {
      const pid = info.process.pid;
      console.log(`[ProcessManager] Stopping dev server for ${project} (PID: ${pid}${port ? `, port: ${port}` : ''})`);

      if (pid) {
        // Kill the entire process tree (npm spawns vite as child)
        await this.killProcessTree(pid, 'SIGTERM');

        // Wait a bit for graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 500));

        // Force kill if still running
        if (this.processes.has(key)) {
          console.log(`[ProcessManager] Force killing dev server tree for ${project}`);
          await this.killProcessTree(pid, 'SIGKILL');
        }
      } else {
        info.process.kill('SIGTERM');
      }

      // Remove from our tracking
      this.processes.delete(key);

      // Give OS time to release resources
      console.log(`[ProcessManager] Process tree killed, waiting for OS cleanup...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Port-based cleanup (only if we know the port from URL)
    if (port) {
      // Kill any lingering processes on the port
      await this.killProcessOnPort(port);

      // Wait for port to be actually free
      console.log(`[ProcessManager] Waiting for port ${port} to be free...`);
      const portFree = await this.waitForPortFree(port, 10000);

      if (!portFree) {
        console.error(`[ProcessManager] Port ${port} still in use after 10s, forcing kill`);
        await this.killProcessOnPort(port);
        // Wait longer after force kill
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Final check
        const finalCheck = await this.waitForPortFree(port, 3000);
        if (!finalCheck) {
          console.error(`[ProcessManager] WARNING: Port ${port} may still be in use, proceeding anyway`);
        }
      }
    }

    // Reset crash count for clean restart
    this.crashCounts.delete(key);

    console.log(`[ProcessManager] Starting dev server for ${project}`);
    await this.startDevServer(project);
  }

  /**
   * Stops all processes
   */
  async stopAll(): Promise<void> {
    console.log(`[ProcessManager] Stopping all processes`);

    // Kill all tracked dev server processes using tree kill
    const killPromises: Promise<void>[] = [];

    for (const [key, info] of this.processes) {
      const pid = info.process.pid;
      console.log(`[ProcessManager] Stopping ${key} (PID: ${pid})`);
      if (pid) {
        killPromises.push(this.killProcessTree(pid, 'SIGTERM'));
      } else {
        info.process.kill('SIGTERM');
      }
    }

    for (const [project, proc] of this.currentAgentProcess) {
      const pid = proc.pid;
      console.log(`[ProcessManager] Stopping agent ${project} (PID: ${pid})`);
      if (pid) {
        killPromises.push(this.killProcessTree(pid, 'SIGTERM'));
      } else {
        proc.kill('SIGTERM');
      }
    }

    // Wait for graceful kills
    await Promise.all(killPromises);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Force kill anything remaining
    for (const [, info] of this.processes) {
      const pid = info.process.pid;
      if (pid) {
        await this.killProcessTree(pid, 'SIGKILL');
      }
    }

    for (const [, proc] of this.currentAgentProcess) {
      const pid = proc.pid;
      if (pid) {
        await this.killProcessTree(pid, 'SIGKILL');
      }
    }

    // Clear maps
    this.processes.clear();
    this.currentAgentProcess.clear();
  }

  /**
   * Checks if a process is running
   */
  isRunning(project: string, type: 'devServer' | 'agent'): boolean {
    if (type === 'agent') {
      return this.currentAgentProcess.has(project);
    }
    return this.processes.has(this.getKey(project, type));
  }

  /**
   * Gets process info
   */
  getProcessInfo(project: string, type: 'devServer' | 'agent'): ManagedProcess | undefined {
    return this.processes.get(this.getKey(project, type));
  }

  /**
   * Lists all running processes
   */
  listProcesses(): Array<{ project: string; type: string; pid: number; uptime: number }> {
    const result: Array<{ project: string; type: string; pid: number; uptime: number }> = [];

    for (const [, info] of this.processes) {
      result.push({
        project: info.project,
        type: info.type,
        pid: info.process.pid || 0,
        uptime: Date.now() - info.startedAt
      });
    }

    for (const [project, proc] of this.currentAgentProcess) {
      result.push({
        project,
        type: 'agent',
        pid: proc.pid || 0,
        uptime: 0 // One-shot agents don't track uptime
      });
    }

    return result;
  }

  /**
   * Checks if dev server is responding (health check)
   * Returns healthy: true if server responds to HTTP request
   */
  async checkDevServerHealth(project: string): Promise<{ healthy: boolean; error?: string }> {
    const key = this.getKey(project, 'devServer');
    const proc = this.processes.get(key);

    if (!proc || !proc.ready) {
      return { healthy: false, error: 'Dev server not running' };
    }

    const projectConfig = this.config.projects[project];
    if (!projectConfig) {
      return { healthy: false, error: 'Project not configured' };
    }

    if (!projectConfig.devServer) {
      return { healthy: false, error: 'No dev server configured' };
    }

    // URL must be explicitly configured for health check
    const url = projectConfig.devServer.url;
    if (!url) {
      // No URL configured - skip health check (can't verify, assume healthy)
      console.log(`[ProcessManager] Health check for ${project}: SKIPPED (no URL configured)`);
      return { healthy: true };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Any response (even 404) means server is up
      console.log(`[ProcessManager] Health check for ${project}: OK (status ${response.status})`);
      return { healthy: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.log(`[ProcessManager] Health check for ${project}: FAILED (${errorMessage})`);
      return { healthy: false, error: errorMessage };
    }
  }

  /**
   * Performs health check with retry logic
   * Attempts health check multiple times before declaring unhealthy
   */
  async checkDevServerHealthWithRetry(
    project: string,
    maxRetries: number = 3,
    delayMs: number = 2000
  ): Promise<{ healthy: boolean; error?: string }> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.checkDevServerHealth(project);
      if (result.healthy) {
        return result;
      }

      if (attempt < maxRetries) {
        console.log(`[ProcessManager] Health check retry ${attempt}/${maxRetries} for ${project} in ${delayMs}ms`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return { healthy: false, error: `Health check failed after ${maxRetries} attempts` };
  }
}
