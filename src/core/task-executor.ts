import { EventEmitter } from 'events';
import { TaskDefinition, TaskVerificationContext, Config } from '../types';
import { ProcessManager } from './process-manager';
import { StatusMonitor } from './status-monitor';
import { StateMachine } from './state-machine';
import { LogAggregator } from './log-aggregator';
import { ProjectManager } from './project-manager';
import { PlanningAgentManager } from '../planning/planning-agent-manager';

export interface TaskExecutorConfig {
  processManager: ProcessManager;
  statusMonitor: StatusMonitor;
  stateMachine: StateMachine;
  logAggregator: LogAggregator;
  projectManager: ProjectManager;
  planningAgent: PlanningAgentManager;
  config: Config;
  getSessionDir: (project: string) => string | null;
  getDevServerUrl: (project: string) => string;
}

export interface TaskResult {
  success: boolean;
  taskIndex: number;
  project: string;
  message: string;
}

/**
 * TaskExecutor handles the execution of individual tasks with verification loops.
 * It runs agents, collects verification context, and coordinates with the Planning Agent
 * to determine if tasks pass or need fixes.
 */
export class TaskExecutor extends EventEmitter {
  private readonly MAX_FIX_ATTEMPTS = 3;
  private processManager: ProcessManager;
  private statusMonitor: StatusMonitor;
  private stateMachine: StateMachine;
  private logAggregator: LogAggregator;
  private projectManager: ProjectManager;
  private planningAgent: PlanningAgentManager;
  private config: Config;
  private getSessionDir: (project: string) => string | null;
  private getDevServerUrl: (project: string) => string;

  constructor(deps: TaskExecutorConfig) {
    super();
    this.processManager = deps.processManager;
    this.statusMonitor = deps.statusMonitor;
    this.stateMachine = deps.stateMachine;
    this.logAggregator = deps.logAggregator;
    this.projectManager = deps.projectManager;
    this.planningAgent = deps.planningAgent;
    this.config = deps.config;
    this.getSessionDir = deps.getSessionDir;
    this.getDevServerUrl = deps.getDevServerUrl;
  }

  /**
   * Executes a task with verification loop.
   * Runs agent → collects context → Planning Agent analyzes → fixes if needed
   */
  async executeTask(task: TaskDefinition, taskIndex: number): Promise<TaskResult> {
    const sessionDir = this.getSessionDir(task.project);
    if (!sessionDir) {
      return {
        success: false,
        taskIndex,
        project: task.project,
        message: 'No session directory available'
      };
    }

    const devServerUrl = this.getDevServerUrl(task.project);
    let fixAttempts = 0;
    let taskCompleted = false;

    let currentPrompt = this.buildTaskPrompt(task.task, devServerUrl);
    const originalTaskDescription = task.task;

    this.statusMonitor.updateStatus(task.project, 'WORKING', 'Starting agent task...');
    this.stateMachine.markAgentActive(task.project);

    try {
      // Verification loop: run agent → verify → fix if needed
      while (fixAttempts < this.MAX_FIX_ATTEMPTS && !taskCompleted) {
        // Update status based on whether this is initial run or fix attempt
        if (fixAttempts === 0) {
          this.statusMonitor.updateTaskStatus(taskIndex, 'working', 'Agent implementing...');
        } else {
          this.statusMonitor.updateTaskStatus(taskIndex, 'fixing',
            `Fixing errors (attempt ${fixAttempts}/${this.MAX_FIX_ATTEMPTS})`);
        }

        // Run the agent
        try {
          await this.processManager.startAgent(task.project, sessionDir, currentPrompt);
        } catch (agentErr) {
          console.error(`[TaskExecutor] Agent error for task #${taskIndex}:`, agentErr);
          throw agentErr;
        }

        // Agent completed - collect verification context and let Planning Agent analyze
        this.statusMonitor.updateTaskStatus(taskIndex, 'verifying', 'Collecting context for analysis...');
        console.log(`[TaskExecutor] Task #${taskIndex} agent done, collecting verification context...`);

        // Collect all context: deps, build output, dev server logs, health check
        const verificationContext = await this.collectVerificationContext(
          task.project,
          task.name,
          originalTaskDescription
        );

        // Let Planning Agent intelligently analyze all context
        this.statusMonitor.updateTaskStatus(taskIndex, 'verifying', 'Planning Agent analyzing results...');
        console.log(`[TaskExecutor] Task #${taskIndex} sending context to Planning Agent for analysis...`);
        const analysis = await this.planningAgent.analyzeTaskResult(verificationContext);

        if (analysis.passed) {
          console.log(`[TaskExecutor] Task #${taskIndex} PASSED: ${analysis.analysis}`);
          taskCompleted = true;
          break;
        }

        // Planning Agent determined task needs fixes
        fixAttempts++;
        console.log(`[TaskExecutor] Task #${taskIndex} FAILED: ${analysis.analysis}`);
        console.log(`[TaskExecutor] Suggested action: ${analysis.suggestedAction}`);

        if (fixAttempts >= this.MAX_FIX_ATTEMPTS || analysis.suggestedAction === 'escalate') {
          console.error(`[TaskExecutor] Task #${taskIndex} failed after ${fixAttempts} attempts - requires user intervention`);
          this.statusMonitor.updateTaskStatus(taskIndex, 'failed', analysis.analysis);
          // Use FAILED status to indicate user intervention required
          this.statusMonitor.updateStatus(task.project, 'FAILED', `Task failed: ${analysis.analysis}. User intervention required.`);
          this.emit('taskFailed', { taskIndex, project: task.project, error: analysis.analysis, requiresUserAction: true });
          return {
            success: false,
            taskIndex,
            project: task.project,
            message: analysis.analysis
          };
        }

        if (analysis.suggestedAction === 'skip') {
          console.log(`[TaskExecutor] Task #${taskIndex} - Planning Agent suggests skipping issue`);
          taskCompleted = true;
          break;
        }

        // Use Planning Agent's intelligent fix prompt
        this.statusMonitor.updateTaskStatus(taskIndex, 'fixing', `Fix attempt ${fixAttempts}/${this.MAX_FIX_ATTEMPTS}`);
        currentPrompt = this.buildFixPrompt(task.name, analysis.analysis, originalTaskDescription, analysis.fixPrompt);
        console.log(`[TaskExecutor] Asking agent to fix (attempt ${fixAttempts}/${this.MAX_FIX_ATTEMPTS})`);
      }

      if (taskCompleted) {
        this.statusMonitor.updateTaskStatus(taskIndex, 'completed', 'Task completed and verified');
        this.emit('taskCompleted', { taskIndex, project: task.project });
        return {
          success: true,
          taskIndex,
          project: task.project,
          message: 'Task completed and verified'
        };
      }

      return {
        success: false,
        taskIndex,
        project: task.project,
        message: 'Task did not complete'
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[TaskExecutor] Task #${taskIndex} (${task.project}) failed:`, err);
      this.statusMonitor.updateTaskStatus(taskIndex, 'failed', `Task failed: ${errorMsg}`);
      // Use FAILED status to indicate user intervention required
      this.statusMonitor.updateStatus(task.project, 'FAILED', `Task failed: ${errorMsg}. User intervention required.`);
      this.emit('taskFailed', { taskIndex, project: task.project, error: errorMsg, requiresUserAction: true });
      return {
        success: false,
        taskIndex,
        project: task.project,
        message: errorMsg
      };
    } finally {
      this.stateMachine.markAgentIdle(task.project);
    }
  }

  /**
   * Builds the initial task prompt with critical instructions.
   */
  private buildTaskPrompt(taskDescription: string, devServerUrl: string): string {
    let prompt = taskDescription;

    // Add dev server URL info
    prompt += `\n\n**DEV SERVER**: The dev server for this project is running at: ${devServerUrl}`;

    // Add critical rules that agents must follow
    prompt += `\n\n**CRITICAL RULES - YOU MUST FOLLOW THESE**:
1. DO NOT write any tests (unit tests, Jest tests, integration tests, etc.) - testing is handled separately by the orchestrator
2. DO NOT start dev servers (npm start, npm run dev, etc.) - the orchestrator already manages dev servers
3. DO NOT run npm install - the orchestrator handles dependency installation
4. DO NOT use browser automation tools (Playwright, browser_*, mcp__playwright__*) to test or verify your work - the orchestrator handles all testing
5. Focus ONLY on implementing the feature code - write the code and nothing else`;

    return prompt;
  }

  /**
   * Builds a fix prompt for when a task needs corrections.
   */
  private buildFixPrompt(taskName: string, analysis: string, originalDescription: string, fixPrompt?: string): string {
    if (fixPrompt) {
      return fixPrompt;
    }

    return `## FIX REQUIRED

Your previous implementation for task "${taskName}" has issues.

**Problem:** ${analysis}

**Original Task:**
${originalDescription}

Please fix the issue and try again.`;
  }

  /**
   * Collects all verification context for Planning Agent intelligent analysis.
   */
  private async collectVerificationContext(
    project: string,
    taskName: string,
    taskDescription: string
  ): Promise<TaskVerificationContext> {
    const context: TaskVerificationContext = {
      project,
      taskName,
      taskDescription
    };

    const projectConfig = this.config.projects[project];

    // Step 1: Install dependencies
    console.log(`[TaskExecutor] [Context] Installing dependencies for ${project}...`);
    this.statusMonitor.updateStatus(project, 'WORKING', 'Installing dependencies...');
    try {
      await this.projectManager.installDependencies(project);
    } catch (err) {
      console.log(`[TaskExecutor] [Context] Dependency install failed: ${err}`);
      // Continue to collect more context even if deps fail
    }

    // Step 2: Run build and capture full output
    if (projectConfig?.buildCommand) {
      console.log(`[TaskExecutor] [Context] Running build for ${project}...`);
      this.statusMonitor.updateStatus(project, 'WORKING', 'Running build...');
      const buildResult = await this.runBuildCommand(project, projectConfig.buildCommand);
      context.buildOutput = {
        stdout: buildResult.stdout,
        stderr: buildResult.stderr,
        exitCode: buildResult.exitCode
      };
    }

    // Step 3: Restart dev server
    console.log(`[TaskExecutor] [Context] Restarting dev server for ${project}...`);
    this.statusMonitor.updateStatus(project, 'WORKING', 'Restarting dev server...');
    try {
      await this.processManager.restartDevServer(project);
    } catch (err) {
      console.log(`[TaskExecutor] [Context] Dev server restart failed: ${err}`);
    }

    // Step 4: Collect dev server logs (recent output)
    const devLogs = this.logAggregator.getLogsByType(project, 'devServer', 100);
    context.devServerLogs = devLogs.map(l => l.text).join('\n');

    // Step 5: Health check
    console.log(`[TaskExecutor] [Context] Health check for ${project}...`);
    this.statusMonitor.updateStatus(project, 'WORKING', 'Checking dev server health...');
    const health = await this.processManager.checkDevServerHealthWithRetry(project, 5, 2000);
    context.healthCheck = {
      healthy: health.healthy,
      error: health.error
    };

    console.log(`[TaskExecutor] [Context] Collection complete for ${project}. Health: ${health.healthy ? 'OK' : 'FAILED'}`);
    return context;
  }

  /**
   * Runs a build command and captures output.
   */
  private runBuildCommand(project: string, command: string): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    error?: string;
  }> {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');

      // Expand ~ to home directory
      let projectPath = this.config.projects[project].path;
      if (projectPath.startsWith('~')) {
        projectPath = projectPath.replace('~', process.env.HOME || '');
      }

      // Parse command into cmd + args
      const parts = command.split(' ');
      const cmd = parts[0];
      const args = parts.slice(1);

      console.log(`[TaskExecutor] Running build: ${command} in ${projectPath}`);

      const child = spawn(cmd, args, {
        cwd: projectPath,
        shell: true,
        env: process.env
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
        this.logAggregator.addLog({
          project,
          type: 'agent',
          stream: 'stdout',
          text: data.toString(),
          timestamp: Date.now()
        });
      });

      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        this.logAggregator.addLog({
          project,
          type: 'agent',
          stream: 'stderr',
          text: data.toString(),
          timestamp: Date.now()
        });
      });

      child.on('close', (code: number | null) => {
        const exitCode = code ?? 1;
        if (exitCode === 0) {
          console.log(`[TaskExecutor] Build succeeded for ${project}`);
          resolve({ success: true, stdout, stderr, exitCode });
        } else {
          const errorMsg = stderr || stdout || `Build exited with code ${exitCode}`;
          console.log(`[TaskExecutor] Build failed for ${project}: ${errorMsg}`);
          resolve({ success: false, stdout, stderr, exitCode, error: errorMsg });
        }
      });

      child.on('error', (err: Error) => {
        console.error(`[TaskExecutor] Build spawn error for ${project}:`, err);
        resolve({ success: false, stdout, stderr, exitCode: 1, error: String(err) });
      });
    });
  }
}
