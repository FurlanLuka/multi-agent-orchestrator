import { EventEmitter } from 'events';
import { TaskDefinition, TaskVerificationContext, TaskAnalysisResult, Config, UserActionRequiredEvent, TaskCompleteRequest, TaskCompleteResponse } from '@aio/types';
import { ProcessManager } from './process-manager';
import { StatusMonitor } from './status-monitor';
import { StateMachine } from './state-machine';
import { LogAggregator } from './log-aggregator';
import { ProjectManager } from './project-manager';
import { PlanningAgentManager } from '../planning/planning-agent-manager';
import { GitManager } from './git-manager';
import { SessionLogger } from './session-logger';
import { spawnWithShellEnv } from '../utils/shell-env';
import * as fs from 'fs';
import * as path from 'path';

export interface TaskExecutorConfig {
  processManager: ProcessManager;
  statusMonitor: StatusMonitor;
  stateMachine: StateMachine;
  logAggregator: LogAggregator;
  projectManager: ProjectManager;
  planningAgent: PlanningAgentManager;
  config: Config;
  getSessionDir: (project: string) => string | null;
  getDevServerUrl: (project: string) => string | null;
  gitManager?: GitManager;
  getGitBranch?: (project: string) => string | undefined;
  io?: any;  // Socket.io instance for flow events
  sessionLogger?: SessionLogger;  // Optional session logger for debugging
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
  private getDevServerUrl: (project: string) => string | null;
  private gitManager?: GitManager;
  private getGitBranch?: (project: string) => string | undefined;
  private io?: any;  // Socket.io instance for flow events
  private sessionLogger?: SessionLogger;  // Optional session logger for debugging
  private activeTaskFlows: Map<number, string> = new Map(); // taskIndex -> flowId

  // Pending user input promises - resolved when user submits values
  private pendingUserInputs: Map<number, {
    resolve: (values: Record<string, string>) => void;
    reject: (reason: Error) => void;
  }> = new Map();

  // Persistent session state - tracks fix attempts per task
  private fixAttemptsPerTask: Map<number, number> = new Map();

  // Pending task complete requests - resolved when verification response is ready
  private pendingTaskComplete: Map<string, {
    resolve: (response: TaskCompleteResponse) => void;
  }> = new Map();

  // Task summaries per project - provides context for subsequent tasks
  // Key: project name, Value: array of completed task summaries
  private taskSummaries: Map<string, Array<{ taskName: string; summary: string }>> = new Map();

  /**
   * Clears task summaries for all projects (call when starting a new session)
   */
  clearTaskSummaries(): void {
    this.taskSummaries.clear();
    console.log(`[TaskExecutor] Cleared task summaries for new session`);
  }

  /**
   * Clears task summaries for a specific project
   */
  clearProjectSummaries(project: string): void {
    this.taskSummaries.delete(project);
    console.log(`[TaskExecutor] Cleared task summaries for ${project}`);
  }

  /**
   * Gets task summaries for a project (useful for debugging/display)
   */
  getTaskSummaries(project: string): Array<{ taskName: string; summary: string }> {
    return this.taskSummaries.get(project) || [];
  }

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
    this.gitManager = deps.gitManager;
    this.getGitBranch = deps.getGitBranch;
    this.io = deps.io;
    this.sessionLogger = deps.sessionLogger;
  }

  /**
   * Executes a task with verification loop.
   * Runs agent → collects context → Planning Agent analyzes → fixes if needed
   */
  async executeTask(task: TaskDefinition, taskIndex: number): Promise<TaskResult> {
    // Handle user_action tasks differently - they require user input before proceeding
    if (task.type === 'user_action') {
      return this.handleUserActionTask(task, taskIndex);
    }

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

    let currentPrompt = this.buildTaskPrompt(task.task, devServerUrl, task.project, task.name);
    const originalTaskDescription = task.task;

    this.statusMonitor.updateStatus(task.project, 'WORKING', 'Starting agent task...');
    this.stateMachine.markAgentActive(task.project);

    // Create task flow ONCE before the verification loop - start tracking from beginning
    const flowId = `task_${task.project}_${taskIndex}_${Date.now()}`;
    const isFixTask = task.type === 'e2e_fix';
    if (this.io) {
      this.activeTaskFlows.set(taskIndex, flowId);
      // Start flow immediately with "Working" step
      (this.io as any).emitFlowStart({
        id: flowId,
        type: isFixTask ? 'fix' : 'task',
        project: task.project,
        taskName: task.name,
        status: 'in_progress',
        startedAt: Date.now(),
        steps: [{ id: 'working', status: 'active', message: isFixTask ? 'Applying fix' : 'Working on task', timestamp: Date.now() }]
      });
    }

    try {
      // Verification loop: run agent → verify → fix if needed
      while (fixAttempts < this.MAX_FIX_ATTEMPTS && !taskCompleted) {
        // Update status based on whether this is initial run or fix attempt
        if (fixAttempts === 0) {
          this.statusMonitor.updateTaskStatus(taskIndex, 'working', 'Agent implementing...');
        } else {
          this.statusMonitor.updateTaskStatus(taskIndex, 'fixing',
            `Fixing errors (attempt ${fixAttempts}/${this.MAX_FIX_ATTEMPTS})`);
          // Update flow with fixing step
          if (this.io) {
            (this.io as any).emitFlowStep(flowId, {
              id: `fixing_${fixAttempts}`,
              status: 'active',
              message: `Fixing (attempt ${fixAttempts}/${this.MAX_FIX_ATTEMPTS})`,
              timestamp: Date.now()
            });
          }
        }

        // Run the agent and capture output
        let agentOutput = '';
        try {
          agentOutput = await this.processManager.sendToAgent(task.project, currentPrompt, taskIndex);
        } catch (agentErr) {
          console.error(`[TaskExecutor] Agent error for task #${taskIndex}:`, agentErr);
          throw agentErr;
        }

        // Extract task summary from agent output (if present)
        const summaryMatch = agentOutput.match(/\[TASK_SUMMARY\]\s*(\{[^}]+\})/);
        if (summaryMatch) {
          try {
            const summaryJson = JSON.parse(summaryMatch[1]);
            if (summaryJson.summary) {
              // Store summary for context in subsequent tasks
              if (!this.taskSummaries.has(task.project)) {
                this.taskSummaries.set(task.project, []);
              }
              this.taskSummaries.get(task.project)!.push({
                taskName: task.name,
                summary: summaryJson.summary
              });
              console.log(`[TaskExecutor] Captured task summary for ${task.project}: ${summaryJson.summary.substring(0, 100)}...`);
            }
          } catch (parseErr) {
            console.warn(`[TaskExecutor] Failed to parse task summary:`, parseErr);
          }
        }

        // Agent completed - collect verification context and let Planning Agent analyze
        this.statusMonitor.updateTaskStatus(taskIndex, 'verifying', 'Collecting context for analysis...');
        console.log(`[TaskExecutor] Task #${taskIndex} agent done, collecting verification context...`);

        // Update flow to verifying step
        if (this.io) {
          (this.io as any).emitFlowStep(flowId, {
            id: fixAttempts === 0 ? 'verify' : `reverify_${fixAttempts}`,
            status: 'active',
            message: fixAttempts === 0 ? 'Verifying task' : 'Re-verifying after fix',
            timestamp: Date.now()
          });
        }

        // Collect all context: deps, build output, dev server logs, health check
        const verificationContext = await this.collectVerificationContext(
          task.project,
          task.name,
          originalTaskDescription,
          flowId
        );

        // Quick pass check: if build passed and health check passed, skip PA analysis
        const buildPassed = !verificationContext.buildOutput || verificationContext.buildOutput.exitCode === 0;
        const healthPassed = !verificationContext.healthCheck || verificationContext.healthCheck.healthy;

        let analysis: TaskAnalysisResult;

        if (buildPassed && healthPassed) {
          // All automated checks passed - skip expensive PA analysis
          console.log(`[TaskExecutor] Task #${taskIndex} auto-passed (build: ${buildPassed ? 'OK' : 'N/A'}, health: ${healthPassed ? 'OK' : 'N/A'})`);
          analysis = {
            passed: true,
            analysis: 'All verification checks passed'
          };
        } else {
          // Something failed - need PA to analyze and potentially generate fix
          this.statusMonitor.updateTaskStatus(taskIndex, 'verifying', 'Planning Agent analyzing results...');
          console.log(`[TaskExecutor] Task #${taskIndex} sending context to Planning Agent for analysis...`);
          analysis = await this.planningAgent.analyzeTaskResult(verificationContext);
        }

        if (analysis.passed) {
          console.log(`[TaskExecutor] Task #${taskIndex} PASSED: ${analysis.analysis}`);
          // Complete the verification flow
          const taskFlowId = this.activeTaskFlows.get(taskIndex);
          if (this.io && taskFlowId) {
            (this.io as any).emitFlowComplete(taskFlowId, 'completed', {
              passed: true,
              summary: 'Task verified successfully'
            });
            this.activeTaskFlows.delete(taskIndex);
          }
          taskCompleted = true;
          break;
        }

        // Planning Agent determined task needs fixes
        console.log(`[TaskExecutor] Task #${taskIndex} FAILED: ${analysis.analysis}`);
        console.log(`[TaskExecutor] Suggested action: ${analysis.suggestedAction}`);

        // Handle escalation (pre-existing issues the agent can't fix)
        if (analysis.suggestedAction === 'escalate') {
          console.error(`[TaskExecutor] Task #${taskIndex} escalated - pre-existing issues require user intervention`);
          // 1. Complete flow as failed
          const taskFlowId = this.activeTaskFlows.get(taskIndex);
          if (this.io && taskFlowId) {
            (this.io as any).emitFlowComplete(taskFlowId, 'failed', {
              passed: false,
              summary: 'Escalated - pre-existing issues',
              details: analysis.analysis
            });
            this.activeTaskFlows.delete(taskIndex);
          }
          // 2. Update task status to failed
          this.statusMonitor.updateTaskStatus(taskIndex, 'failed', analysis.analysis);
          // 3. Kill any running worker for this project
          await this.processManager.stopAgent(task.project);
          // 4. Update project status to FAILED
          this.statusMonitor.updateStatus(task.project, 'FAILED', `Task failed: ${analysis.analysis}. User intervention required.`);
          this.emit('taskFailed', { taskIndex, project: task.project, error: analysis.analysis, requiresUserAction: true });
          return {
            success: false,
            taskIndex,
            project: task.project,
            message: analysis.analysis
          };
        }

        // Handle retry (agent introduced fixable errors)
        fixAttempts++;
        if (fixAttempts >= this.MAX_FIX_ATTEMPTS) {
          console.error(`[TaskExecutor] Task #${taskIndex} failed after ${fixAttempts} fix attempts - requires user intervention`);
          // 1. Complete flow as failed
          const taskFlowId = this.activeTaskFlows.get(taskIndex);
          if (this.io && taskFlowId) {
            (this.io as any).emitFlowComplete(taskFlowId, 'failed', {
              passed: false,
              summary: `Failed after ${fixAttempts} fix attempts`,
              details: analysis.analysis
            });
            this.activeTaskFlows.delete(taskIndex);
          }
          // 2. Update task status to failed
          this.statusMonitor.updateTaskStatus(taskIndex, 'failed', analysis.analysis);
          // 3. Kill any running worker for this project
          await this.processManager.stopAgent(task.project);
          // 4. Update project status to FAILED
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
          // Complete the verification flow as skipped
          const taskFlowId = this.activeTaskFlows.get(taskIndex);
          if (this.io && taskFlowId) {
            (this.io as any).emitFlowComplete(taskFlowId, 'completed', {
              passed: true,
              summary: 'Issue skipped per Planning Agent recommendation'
            });
            this.activeTaskFlows.delete(taskIndex);
          }
          taskCompleted = true;
          break;
        }

        // Use Planning Agent's intelligent fix prompt
        this.statusMonitor.updateTaskStatus(taskIndex, 'fixing', `Fix attempt ${fixAttempts}/${this.MAX_FIX_ATTEMPTS}`);
        // Update flow with fixing step
        const taskFlowId = this.activeTaskFlows.get(taskIndex);
        if (this.io && taskFlowId) {
          (this.io as any).emitFlowStep(taskFlowId, {
            id: `fix_${fixAttempts}`,
            status: 'active',
            message: `Fix attempt ${fixAttempts}/${this.MAX_FIX_ATTEMPTS}`,
            timestamp: Date.now()
          });
        }
        currentPrompt = this.buildFixPrompt(task.name, analysis.analysis, originalTaskDescription, analysis.fixPrompt);
        console.log(`[TaskExecutor] Asking agent to fix (attempt ${fixAttempts}/${this.MAX_FIX_ATTEMPTS})`);
      }

      if (taskCompleted) {
        // Auto-commit for git-enabled projects
        const projectConfig = this.config.projects[task.project];
        if (projectConfig?.gitEnabled && this.gitManager) {
          try {
            let projectPath = projectConfig.path;
            if (projectPath.startsWith('~')) {
              projectPath = projectPath.replace('~', process.env.HOME || '');
            }

            const commitMessage = `feat: ${task.name}`;
            const commitResult = await this.gitManager.commit(projectPath, commitMessage);
            if (commitResult.success && commitResult.commitHash) {
              console.log(`[TaskExecutor] Git commit created for ${task.project}: ${commitResult.commitHash}`);
            } else {
              console.log(`[TaskExecutor] Git commit for ${task.project}: ${commitResult.message}`);
            }
          } catch (err) {
            console.warn(`[TaskExecutor] Git commit failed for ${task.project}:`, err);
            // Don't fail the task if commit fails
          }
        }

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
      // 1. Complete flow as failed
      const taskFlowId = this.activeTaskFlows.get(taskIndex);
      if (this.io && taskFlowId) {
        (this.io as any).emitFlowComplete(taskFlowId, 'failed', {
          passed: false,
          summary: 'Task failed with error',
          details: errorMsg
        });
        this.activeTaskFlows.delete(taskIndex);
      }
      // 2. Update task status to failed
      this.statusMonitor.updateTaskStatus(taskIndex, 'failed', `Task failed: ${errorMsg}`);
      // 3. Kill any running worker for this project
      try {
        await this.processManager.stopAgent(task.project);
      } catch (stopErr) {
        console.error(`[TaskExecutor] Error stopping agent:`, stopErr);
      }
      // 4. Update project status to FAILED
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
  private buildTaskPrompt(taskDescription: string, devServerUrl: string | null, project: string, taskName: string): string {
    let prompt = '';

    // Add context from previous completed tasks on this project
    const previousSummaries = this.taskSummaries.get(project) || [];
    if (previousSummaries.length > 0) {
      prompt += `**CONTEXT FROM PREVIOUS TASKS ON THIS PROJECT:**
The following tasks have already been completed. Use this context to understand what exists and avoid re-checking or re-doing work.

`;
      for (const { taskName: prevTaskName, summary } of previousSummaries) {
        prompt += `✓ **${prevTaskName}**: ${summary}\n`;
      }
      prompt += `\n---\n\n`;
    }

    // Add current task
    prompt += `**CURRENT TASK: ${taskName}**\n\n${taskDescription}`;

    // Add dev server URL info (only if configured)
    if (devServerUrl) {
      prompt += `\n\n**DEV SERVER**: The dev server for this project is running at: ${devServerUrl}`;
    }

    // Add critical rules that agents must follow
    prompt += `\n\n**CRITICAL RULES - YOU MUST FOLLOW THESE**:
1. DO NOT write any tests (unit tests, Jest tests, integration tests, etc.) - testing is handled separately by the orchestrator
2. DO NOT start dev servers (npm start, npm run dev, etc.) - the orchestrator already manages dev servers
3. DO NOT run npm install - the orchestrator handles dependency installation
4. DO NOT run full project builds (npm run build, tsc on whole project, etc.) - the orchestrator runs full builds for verification
5. DO NOT use browser automation tools (Playwright, browser_*, mcp__playwright__*) to test or verify your work - the orchestrator handles all testing
6. Focus ONLY on implementing the feature code - write the code and nothing else
7. Trust the context above - if a previous task created something, it EXISTS. Don't re-check or validate it.
8. If you need to verify your changes compile, only type-check the specific files you modified (e.g., \`tsc --noEmit path/to/file.ts\`), never the whole project`;

    // Add status reporting instructions
    prompt += `\n\n**STATUS REPORTING**:
As you work, output status markers to show what you're doing:
[WORKER_STATUS] {"message": "Brief description of current step"}

Examples:
[WORKER_STATUS] {"message": "Reading existing code structure"}
[WORKER_STATUS] {"message": "Creating auth controller"}
[WORKER_STATUS] {"message": "Adding login endpoint"}
[WORKER_STATUS] {"message": "Writing DTO classes"}

Output a status marker before starting each significant step.`;

    // Add task summary instructions
    prompt += `\n\n**TASK SUMMARY (REQUIRED)**:
When you complete the task, output ONLY this marker with no additional text after it:
[TASK_SUMMARY] {"summary": "Detailed summary including: files created/modified, key functions/classes added, important implementation details"}

Include in your summary:
- File paths that were created or modified
- Names of key functions, classes, types, or exports added
- Any important implementation details the next task might need to know
- Dependencies or relationships with other parts of the codebase

Example:
[TASK_SUMMARY] {"summary": "Added getLevelMetrics service function to src/modules/userDashboard/userDashboardMetrics.service.ts. The function takes userId and locale params, calls getCurrentUserLevel from userLevel module, calculates overall progress as average percentage across all requirements, and returns LevelMetricsResponse with currentLevel details (id, value, title, motivationalQuote, color, iconUrl, smallIconUrl), requirements array, overallProgress percentage, and isMaxLevel boolean. Added LevelMetricsResponse type import and getCurrentUserLevel import at top of file."}

IMPORTANT: The [TASK_SUMMARY] marker must be your FINAL output. Do not add any explanation, confirmation, or additional text after it.`;

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
   * Only runs steps for features that are enabled in project config.
   */
  private async collectVerificationContext(
    project: string,
    taskName: string,
    taskDescription: string,
    flowId?: string
  ): Promise<TaskVerificationContext> {
    const context: TaskVerificationContext = {
      project,
      taskName,
      taskDescription
    };

    const projectConfig = this.config.projects[project];

    // Step 1: Install packages (only if enabled)
    const installEnabled = projectConfig?.installEnabled ?? false;
    const installCommand = projectConfig?.installCommand;
    if (installEnabled && installCommand) {
      console.log(`[TaskExecutor] [Context] Running install command for ${project}: ${installCommand}...`);
      this.statusMonitor.updateStatus(project, 'WORKING', 'Installing packages...');
      if (this.io && flowId) {
        (this.io as any).emitFlowStep(flowId, { id: 'deps', status: 'active', message: 'Installing packages', timestamp: Date.now() });
      }
      try {
        await this.runInstallCommand(project, installCommand);
      } catch (err) {
        console.log(`[TaskExecutor] [Context] Install command failed: ${err}`);
        // Continue to collect more context even if install fails
      }
    } else {
      console.log(`[TaskExecutor] [Context] Install packages disabled for ${project}, skipping`);
    }

    // Step 2: Run build and capture full output (only if enabled)
    const buildEnabled = projectConfig?.buildEnabled ?? !!projectConfig?.buildCommand;
    let buildFailed = false;
    if (buildEnabled && projectConfig?.buildCommand) {
      console.log(`[TaskExecutor] [Context] Running build for ${project}...`);
      this.statusMonitor.updateStatus(project, 'WORKING', 'Running build...');
      if (this.io && flowId) {
        (this.io as any).emitFlowStep(flowId, { id: 'build', status: 'active', message: 'Running build', timestamp: Date.now() });
      }
      const buildResult = await this.runBuildCommand(project, projectConfig.buildCommand);
      context.buildOutput = {
        stdout: buildResult.stdout,
        stderr: buildResult.stderr,
        exitCode: buildResult.exitCode
      };
      buildFailed = buildResult.exitCode !== 0;
      if (buildFailed) {
        console.log(`[TaskExecutor] Build failed for ${project}, skipping dev server restart`);
      }
    } else {
      console.log(`[TaskExecutor] [Context] Build disabled for ${project}, skipping`);
    }

    // Step 3: Restart dev server (only if enabled, and skip if build failed)
    const devServerEnabled = projectConfig?.devServerEnabled ?? true;
    if (devServerEnabled && !buildFailed) {
      console.log(`[TaskExecutor] [Context] Restarting dev server for ${project}...`);
      this.statusMonitor.updateStatus(project, 'WORKING', 'Restarting dev server...');
      if (this.io && flowId) {
        (this.io as any).emitFlowStep(flowId, { id: 'restart', status: 'active', message: 'Restarting dev server', timestamp: Date.now() });
      }
      try {
        await this.processManager.restartDevServer(project);
      } catch (err) {
        console.log(`[TaskExecutor] [Context] Dev server restart failed: ${err}`);
      }
    } else if (!devServerEnabled) {
      console.log(`[TaskExecutor] [Context] Dev server disabled for ${project}, skipping restart`);
    }

    // Step 4: Collect dev server logs (only if dev server is enabled)
    if (devServerEnabled) {
      const devLogs = this.logAggregator.getLogsByType(project, 'devServer', 100);
      context.devServerLogs = devLogs.map(l => l.text).join('\n');
    }

    // Step 5: Health check (only if dev server is enabled and build didn't fail)
    if (devServerEnabled && !buildFailed) {
      console.log(`[TaskExecutor] [Context] Health check for ${project}...`);
      this.statusMonitor.updateStatus(project, 'WORKING', 'Checking dev server health...');
      if (this.io && flowId) {
        (this.io as any).emitFlowStep(flowId, { id: 'health', status: 'active', message: 'Health check', timestamp: Date.now() });
      }
      const health = await this.processManager.checkDevServerHealthWithRetry(project, 5, 2000);
      context.healthCheck = {
        healthy: health.healthy,
        error: health.error
      };
    } else if (buildFailed) {
      console.log(`[TaskExecutor] [Context] Skipping health check (build failed)`);
      context.healthCheck = {
        healthy: false,
        error: 'Build failed - server not started'
      };
    } else {
      console.log(`[TaskExecutor] [Context] Skipping health check (dev server disabled)`);
    }

    console.log(`[TaskExecutor] [Context] Collection complete for ${project}. Health: ${context.healthCheck?.healthy ? 'OK' : 'N/A'}`);
    return context;
  }

  /**
   * Runs an install command (e.g., npm install, pip install).
   */
  private async runInstallCommand(project: string, command: string): Promise<void> {
    let projectPath = this.config.projects[project].path;
    if (projectPath.startsWith('~')) {
      projectPath = projectPath.replace('~', process.env.HOME || '');
    }

    console.log(`[TaskExecutor] Running install: ${command} in ${projectPath}`);

    const child = await spawnWithShellEnv(command, {
      cwd: projectPath,
    });

    return new Promise((resolve, reject) => {
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        this.logAggregator.addLog({
          project,
          type: 'agent',
          stream: 'stdout',
          text: data.toString(),
          timestamp: Date.now()
        });
      });

      child.stderr?.on('data', (data: Buffer) => {
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
        if (code === 0) {
          console.log(`[TaskExecutor] Install succeeded for ${project}`);
          resolve();
        } else {
          console.log(`[TaskExecutor] Install failed for ${project}: ${stderr}`);
          reject(new Error(`Install command failed with code ${code}`));
        }
      });

      child.on('error', (err: Error) => {
        console.error(`[TaskExecutor] Install spawn error for ${project}:`, err);
        reject(err);
      });
    });
  }

  /**
   * Runs a build command and captures output.
   */
  private async runBuildCommand(project: string, command: string): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    error?: string;
  }> {
    // Expand ~ to home directory
    let projectPath = this.config.projects[project].path;
    if (projectPath.startsWith('~')) {
      projectPath = projectPath.replace('~', process.env.HOME || '');
    }

    console.log(`[TaskExecutor] Running build: ${command} in ${projectPath}`);

    const child = await spawnWithShellEnv(command, {
      cwd: projectPath,
    });

    return new Promise((resolve) => {

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
        this.logAggregator.addLog({
          project,
          type: 'agent',
          stream: 'stdout',
          text: data.toString(),
          timestamp: Date.now()
        });
      });

      child.stderr?.on('data', (data: Buffer) => {
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

  /**
   * Handles user_action tasks that require user input before proceeding.
   * Sets status to awaiting_input, emits event requesting input, waits for response.
   */
  private async handleUserActionTask(task: TaskDefinition, taskIndex: number): Promise<TaskResult> {
    if (!task.userAction) {
      return {
        success: false,
        taskIndex,
        project: task.project,
        message: 'User action task missing userAction configuration'
      };
    }

    console.log(`[TaskExecutor] Task #${taskIndex} is user_action - waiting for user input...`);

    // 1. Set status to awaiting_input
    this.statusMonitor.updateTaskStatus(taskIndex, 'awaiting_input', 'Waiting for user input...');

    // 2. Emit event requesting input from UI
    const event: UserActionRequiredEvent = {
      taskIndex,
      project: task.project,
      taskName: task.name,
      userAction: task.userAction
    };
    this.emit('userActionRequired', event);

    try {
      // 3. Wait for user input
      const userInput = await this.waitForUserInput(taskIndex);

      // 4. Write values to .env file
      await this.writeToEnvFile(task.project, userInput);

      // 5. Mark task complete
      this.statusMonitor.updateTaskStatus(taskIndex, 'completed', 'Credentials configured');
      this.emit('taskCompleted', { taskIndex, project: task.project });

      console.log(`[TaskExecutor] Task #${taskIndex} user_action completed - credentials written to .env`);

      return {
        success: true,
        taskIndex,
        project: task.project,
        message: 'Credentials configured successfully'
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[TaskExecutor] Task #${taskIndex} user_action failed:`, err);
      this.statusMonitor.updateTaskStatus(taskIndex, 'failed', `Failed: ${errorMsg}`);
      this.emit('taskFailed', { taskIndex, project: task.project, error: errorMsg });

      return {
        success: false,
        taskIndex,
        project: task.project,
        message: errorMsg
      };
    }
  }

  /**
   * Creates a promise that waits for user input for a specific task.
   * The promise is resolved when handleUserActionResponse is called with matching taskIndex.
   */
  private waitForUserInput(taskIndex: number): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      // Store the resolve/reject callbacks so they can be called when response arrives
      this.pendingUserInputs.set(taskIndex, { resolve, reject });
    });
  }

  /**
   * Called by the orchestrator when user submits values for a user_action task.
   * Resolves the pending promise and allows the task to continue.
   */
  handleUserActionResponse(taskIndex: number, values: Record<string, string>): void {
    const pending = this.pendingUserInputs.get(taskIndex);
    if (pending) {
      console.log(`[TaskExecutor] Received user action response for task #${taskIndex}`);
      this.pendingUserInputs.delete(taskIndex);
      pending.resolve(values);
    } else {
      console.warn(`[TaskExecutor] Received user action response for unknown task #${taskIndex}`);
    }
  }

  /**
   * Writes user-provided values to the project's .env file.
   * Appends to existing .env or creates a new one if it doesn't exist.
   */
  private async writeToEnvFile(project: string, values: Record<string, string>): Promise<void> {
    const projectConfig = this.config.projects[project];
    if (!projectConfig) {
      throw new Error(`Project ${project} not found in config`);
    }

    // Expand ~ to home directory
    let projectPath = projectConfig.path;
    if (projectPath.startsWith('~')) {
      projectPath = projectPath.replace('~', process.env.HOME || '');
    }

    const envFilePath = path.join(projectPath, '.env');

    // Read existing .env content (if any)
    let existingContent = '';
    try {
      existingContent = fs.readFileSync(envFilePath, 'utf-8');
    } catch {
      // File doesn't exist - will create new
    }

    // Parse existing env vars to avoid duplicates
    const existingVars = new Set<string>();
    existingContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=/);
      if (match) existingVars.add(match[1]);
    });

    // Build new entries
    const newEntries: string[] = [];
    for (const [key, value] of Object.entries(values)) {
      if (!existingVars.has(key)) {
        // Escape any quotes in the value
        const escapedValue = value.replace(/"/g, '\\"');
        newEntries.push(`${key}="${escapedValue}"`);
      } else {
        // Update existing variable - rewrite the whole file with updated value
        const regex = new RegExp(`^${key}=.*$`, 'm');
        const escapedValue = value.replace(/"/g, '\\"');
        existingContent = existingContent.replace(regex, `${key}="${escapedValue}"`);
      }
    }

    // Write back to file
    let finalContent = existingContent.trim();
    if (newEntries.length > 0) {
      if (finalContent) {
        finalContent += '\n';
      }
      finalContent += newEntries.join('\n');
    }
    finalContent += '\n';

    fs.writeFileSync(envFilePath, finalContent, 'utf-8');
    console.log(`[TaskExecutor] Wrote ${Object.keys(values).length} env vars to ${envFilePath}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // Persistent Session Execution (single agent handles all tasks)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Executes all tasks for a project using a single persistent agent.
   * The agent uses the task_complete MCP tool to signal completion and receive
   * verification results or next tasks.
   *
   * @param project The project name
   * @param tasks All tasks for this project
   * @returns Promise that resolves when all tasks are complete or agent escalates
   */
  async executePersistentSession(
    project: string,
    tasks: Array<{ task: TaskDefinition; taskIndex: number }>
  ): Promise<{ success: boolean; completedTasks: number[]; failedTasks: number[] }> {
    const sessionDir = this.getSessionDir(project);
    if (!sessionDir) {
      return { success: false, completedTasks: [], failedTasks: tasks.map(t => t.taskIndex) };
    }

    const devServerUrl = this.getDevServerUrl(project);
    const completedTasks: number[] = [];
    const failedTasks: number[] = [];

    // Reset fix attempts tracking
    this.fixAttemptsPerTask.clear();

    console.log(`[TaskExecutor] Starting persistent session for ${project} with ${tasks.length} tasks`);

    // Build initial prompt with ALL tasks
    const initialPrompt = this.buildPersistentSessionPrompt(project, tasks, devServerUrl);

    // Mark project as working and first task as working
    this.statusMonitor.updateStatus(project, 'WORKING', 'Starting persistent session...');
    if (tasks.length > 0) {
      this.statusMonitor.updateTaskStatus(tasks[0].taskIndex, 'working', 'Agent implementing...');
      this.stateMachine.markAgentActive(project);

      // Create task flow for first task
      const flowId = `task_${project}_${tasks[0].taskIndex}_${Date.now()}`;
      this.activeTaskFlows.set(tasks[0].taskIndex, flowId);
      if (this.io) {
        (this.io as any).emitFlowStart({
          id: flowId,
          type: 'task',
          project,
          taskName: tasks[0].task.name,
          status: 'in_progress',
          startedAt: Date.now(),
          steps: [{ id: 'working', status: 'active', message: 'Working on task', timestamp: Date.now() }]
        });
      }
    }

    try {
      // Run agent with all tasks in one prompt
      // Agent uses task_complete MCP tool after each task, which blocks and waits for our response
      // This keeps the agent alive with context preserved across all tasks
      await this.processManager.runPersistentAgent(project, initialPrompt, tasks[0]?.taskIndex);

      // Determine final results from task statuses
      for (const { taskIndex } of tasks) {
        const taskState = this.statusMonitor.getTaskState(taskIndex);
        if (taskState?.status === 'completed') {
          completedTasks.push(taskIndex);
        } else {
          failedTasks.push(taskIndex);
        }
      }

      return { success: failedTasks.length === 0, completedTasks, failedTasks };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[TaskExecutor] Persistent session failed for ${project}:`, err);

      // Mark remaining tasks as failed
      for (const { taskIndex } of tasks) {
        const taskState = this.statusMonitor.getTaskState(taskIndex);
        if (taskState?.status !== 'completed') {
          this.statusMonitor.updateTaskStatus(taskIndex, 'failed', errorMsg);
          failedTasks.push(taskIndex);
        }
      }

      return { success: false, completedTasks, failedTasks };
    } finally {
      this.stateMachine.markAgentIdle(project);
    }
  }

  /**
   * Handles a task_complete request from the persistent agent.
   * Runs verification, analyzes results, and returns the appropriate response.
   */
  async handleTaskCompleteRequest(
    request: TaskCompleteRequest,
    allTasks: Array<{ task: TaskDefinition; taskIndex: number }>
  ): Promise<TaskCompleteResponse> {
    const { project, taskIndex, summary } = request;

    console.log(`[TaskExecutor] Handling task_complete for ${project} task #${taskIndex}`);

    // Find the task
    const taskEntry = allTasks.find(t => t.taskIndex === taskIndex);
    if (!taskEntry) {
      return {
        status: 'escalate',
        escalationReason: `Task #${taskIndex} not found`
      };
    }

    const { task } = taskEntry;

    // Store summary for context
    if (!this.taskSummaries.has(project)) {
      this.taskSummaries.set(project, []);
    }
    this.taskSummaries.get(project)!.push({ taskName: task.name, summary });

    // Update flow to verifying
    const flowId = this.activeTaskFlows.get(taskIndex);
    if (this.io && flowId) {
      (this.io as any).emitFlowStep(flowId, {
        id: 'verify',
        status: 'active',
        message: 'Verifying task',
        timestamp: Date.now()
      });
    }

    // Collect verification context
    this.statusMonitor.updateTaskStatus(taskIndex, 'verifying', 'Running verification...');
    const verificationContext = await this.collectVerificationContext(
      project,
      task.name,
      task.task,
      flowId
    );

    // Check if build and health passed
    const buildPassed = !verificationContext.buildOutput || verificationContext.buildOutput.exitCode === 0;
    const healthPassed = !verificationContext.healthCheck || verificationContext.healthCheck.healthy;

    let analysis: TaskAnalysisResult;

    if (buildPassed && healthPassed) {
      // Auto-pass
      console.log(`[TaskExecutor] Task #${taskIndex} auto-passed (build: OK, health: OK)`);
      analysis = { passed: true, analysis: 'All verification checks passed' };
    } else {
      // Need Planning Agent analysis
      this.statusMonitor.updateTaskStatus(taskIndex, 'verifying', 'Analyzing results...');
      analysis = await this.planningAgent.analyzeTaskResult(verificationContext);
    }

    // Log task completion to session logger
    if (this.sessionLogger) {
      this.sessionLogger.agentTask(project, `Task #${taskIndex}: ${task.name}`);
      this.sessionLogger.agentResult(project, `${analysis.passed ? 'PASSED' : 'FAILED'}: ${summary}`);
    }

    if (analysis.passed) {
      // Task passed - complete it and return next task
      console.log(`[TaskExecutor] Task #${taskIndex} PASSED`);

      // Complete flow
      if (this.io && flowId) {
        (this.io as any).emitFlowComplete(flowId, 'completed', {
          passed: true,
          summary: 'Task verified successfully'
        });
        this.activeTaskFlows.delete(taskIndex);
      }

      // Git commit if enabled
      const projectConfig = this.config.projects[project];
      if (projectConfig?.gitEnabled && this.gitManager) {
        try {
          let projectPath = projectConfig.path;
          if (projectPath.startsWith('~')) {
            projectPath = projectPath.replace('~', process.env.HOME || '');
          }
          const commitMessage = `feat: ${task.name}`;
          const commitResult = await this.gitManager.commit(projectPath, commitMessage);
          if (commitResult.success && commitResult.commitHash) {
            console.log(`[TaskExecutor] Git commit: ${commitResult.commitHash}`);
          }
        } catch (err) {
          console.warn(`[TaskExecutor] Git commit failed:`, err);
        }
      }

      this.statusMonitor.updateTaskStatus(taskIndex, 'completed', 'Task completed and verified');
      this.emit('taskCompleted', { taskIndex, project });

      // Find next task for this project
      const currentIdx = allTasks.findIndex(t => t.taskIndex === taskIndex);
      const nextTaskEntry = allTasks.slice(currentIdx + 1).find(t => t.task.project === project);

      if (nextTaskEntry) {
        // More tasks - return next task
        this.statusMonitor.updateTaskStatus(nextTaskEntry.taskIndex, 'working', 'Agent implementing...');

        // Create flow for next task
        const nextFlowId = `task_${project}_${nextTaskEntry.taskIndex}_${Date.now()}`;
        this.activeTaskFlows.set(nextTaskEntry.taskIndex, nextFlowId);
        if (this.io) {
          (this.io as any).emitFlowStart({
            id: nextFlowId,
            type: 'task',
            project,
            taskName: nextTaskEntry.task.name,
            status: 'in_progress',
            startedAt: Date.now(),
            steps: [{ id: 'working', status: 'active', message: 'Working on task', timestamp: Date.now() }]
          });
        }

        return {
          status: 'next_task',
          nextTask: {
            index: nextTaskEntry.taskIndex,
            name: nextTaskEntry.task.name,
            description: nextTaskEntry.task.task,
            project
          }
        };
      } else {
        // No more tasks for this project
        this.statusMonitor.updateStatus(project, 'READY', 'All tasks completed');
        return { status: 'all_complete' };
      }
    }

    // Task failed - check fix attempts
    const attempts = (this.fixAttemptsPerTask.get(taskIndex) || 0) + 1;
    this.fixAttemptsPerTask.set(taskIndex, attempts);

    console.log(`[TaskExecutor] Task #${taskIndex} FAILED (attempt ${attempts}/${this.MAX_FIX_ATTEMPTS})`);

    if (analysis.suggestedAction === 'escalate' || attempts >= this.MAX_FIX_ATTEMPTS) {
      // Escalate - too many failures or pre-existing issues
      const reason = analysis.suggestedAction === 'escalate'
        ? analysis.analysis
        : `Failed after ${attempts} attempts: ${analysis.analysis}`;

      // Complete flow as failed
      if (this.io && flowId) {
        (this.io as any).emitFlowComplete(flowId, 'failed', {
          passed: false,
          summary: 'Escalated',
          details: reason
        });
        this.activeTaskFlows.delete(taskIndex);
      }

      this.statusMonitor.updateTaskStatus(taskIndex, 'failed', reason);
      this.statusMonitor.updateStatus(project, 'FAILED', reason);
      this.emit('taskFailed', { taskIndex, project, error: reason, requiresUserAction: true });

      return {
        status: 'escalate',
        escalationReason: reason,
        attemptNumber: attempts,
        maxAttempts: this.MAX_FIX_ATTEMPTS
      };
    }

    // Return fix required
    this.statusMonitor.updateTaskStatus(taskIndex, 'fixing', `Fix attempt ${attempts}/${this.MAX_FIX_ATTEMPTS}`);

    // Update flow with fixing step
    if (this.io && flowId) {
      (this.io as any).emitFlowStep(flowId, {
        id: `fix_${attempts}`,
        status: 'active',
        message: `Fix attempt ${attempts}/${this.MAX_FIX_ATTEMPTS}`,
        timestamp: Date.now()
      });
    }

    const fixPrompt = analysis.fixPrompt || this.buildFixPrompt(
      task.name,
      analysis.analysis,
      task.task,
      undefined
    );

    return {
      status: 'fix_required',
      fixPrompt,
      verificationError: analysis.analysis,
      attemptNumber: attempts,
      maxAttempts: this.MAX_FIX_ATTEMPTS
    };
  }

  /**
   * Builds the initial prompt for a persistent session with all tasks.
   */
  private buildPersistentSessionPrompt(
    project: string,
    tasks: Array<{ task: TaskDefinition; taskIndex: number }>,
    devServerUrl: string | null
  ): string {
    let prompt = `# Implementation Session for ${project}

You are implementing a feature across multiple tasks. Complete each task in order, calling the \`task_complete\` tool after each one.

## Your Tasks

`;

    for (const { task, taskIndex } of tasks) {
      prompt += `### Task ${taskIndex}: ${task.name}
${task.task}

---

`;
    }

    if (devServerUrl) {
      prompt += `\n**DEV SERVER**: Running at ${devServerUrl}\n`;
    }

    prompt += `
## Workflow

1. Implement the current task's requirements
2. Call the \`task_complete\` MCP tool with:
   - \`taskIndex\`: The task number you just completed
   - \`summary\`: Brief description of what you implemented (files changed, key functions, etc.)
3. Based on the response:
   - \`next_task\`: Proceed to the next task provided
   - \`fix_required\`: Fix the issues described in \`fixPrompt\`, then call \`task_complete\` again
   - \`all_complete\`: Session is done, all tasks verified successfully
   - \`escalate\`: Stop working, user intervention is needed

## Critical Rules

1. **DO NOT skip calling task_complete** - the orchestrator needs it to verify your work
2. **DO NOT start the next task** until you receive a \`next_task\` response
3. **DO NOT write tests** - testing is handled separately
4. **DO NOT start dev servers** - the orchestrator manages dev servers
5. **DO NOT run npm install** - the orchestrator handles dependencies
6. **DO NOT use browser automation tools** to test your work
7. Focus ONLY on implementing the feature code

## Status Reporting

As you work, output status markers:
\`[WORKER_STATUS] {"message": "Brief description of current step"}\`

## Start Now

Begin with Task ${tasks[0]?.taskIndex ?? 0}: ${tasks[0]?.task.name ?? 'First task'}
`;

    return prompt;
  }
}
