import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { Plan, E2EPromptRequest, ContentBlock, ChatStreamEvent, RedistributionContext, TaskVerificationContext, TaskAnalysisResult, OrchestratorState, AgentStatus, PlanningPhase, PlanningStatusEvent, AnalysisResultEvent, ExplorationAnalysisResult, SessionProjectConfig, PlanningSessionState, PlanningStage, PLANNING_STAGE_NAMES } from '@orchy/types';
import { parseMarkedResponse, extractJSON, extractE2EResult, MARKERS } from './response-parser';
import { spawnWithShellEnv } from '../utils/shell-env';
import { getCacheDir, ensureMcpServerExtracted } from '../config/paths';

// Full stream-json message types from Claude CLI
interface StreamJsonContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

interface StreamJsonMessage {
  type: 'system' | 'assistant' | 'result' | 'error';
  subtype?: string;
  message?: {
    id?: string;
    content?: StreamJsonContentBlock[];
  };
  result?: string;
  is_error?: boolean;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ProjectConfig {
  path: string;
  devServerEnabled?: boolean;
  devServer?: {
    command: string;
    readyPattern: string;
    env: Record<string, string>;
  };
  buildEnabled?: boolean;
  buildCommand?: string;
  installEnabled?: boolean;
  installCommand?: string;
  hasE2E: boolean;
  attachedDesign?: string;
}


export class PlanningAgentManager extends EventEmitter {
  private orchestratorDir: string;
  private conversationHistory: ConversationMessage[] = [];
  private currentProcess: ChildProcess | null = null;
  private readonly MAX_HISTORY = 10; // Keep last 10 exchanges for context
  private projectConfig: Record<string, ProjectConfig> = {};

  // State tracking for user action requests
  private orchestratorState: OrchestratorState = 'IDLE';
  private projectStatuses: Record<string, { status: AgentStatus; message: string }> = {};

  // Planning status tracking for UX feedback
  private currentPlanningPhase: PlanningPhase = 'exploring';
  private isPlanningRequest: boolean = false;

  // Planning context for multi-stage workflow (used by startPlanningWorkflow)
  private pendingPlanContext: {
    feature: string;
    projects: string[];
    projectPaths?: Record<string, string>;
    sessionProjectConfigs?: SessionProjectConfig[];
    flowId: string;
  } | null = null;

  // Request queue for serializing Claude calls (prevents race conditions)
  private readonly MAX_QUEUE_SIZE = 10;
  private requestQueue: Array<{
    prompt: string;
    timeout: number;
    resolve: (result: string) => void;
    reject: (error: Error) => void;
  }> = [];
  private isExecuting: boolean = false;

  // Per-method timeouts (ms)
  private static readonly TIMEOUTS = {
    CHAT: 600000,           // 2 min - general chat responses
    PLAN_CREATION: 1200000 * 3,  // 20 min - explores codebase extensively
    TASK_ANALYSIS: 1200000,  // 3 min - analyzing task results
    E2E_PROMPT: 1200000,     // 3 min - generating E2E prompts
    E2E_ANALYSIS: 1200000,   // 5 min - analyzing E2E results
    FAILURE_ANALYSIS: 1200000, // 3 min - analyzing failures
  };

  constructor(orchestratorDir: string) {
    super();
    this.orchestratorDir = orchestratorDir;
  }

  /**
   * Sets the project configuration for context
   */
  setProjectConfig(config: Record<string, ProjectConfig>): void {
    this.projectConfig = config;
  }

  /**
   * Sets the current orchestrator state (IDLE, RUNNING, PAUSED, etc.)
   */
  setOrchestratorState(state: OrchestratorState): void {
    this.orchestratorState = state;
  }

  /**
   * Sets the current project statuses
   */
  setProjectStatuses(statuses: Record<string, { status: AgentStatus; message: string }>): void {
    this.projectStatuses = statuses;
  }

  /**
   * Builds a human-readable state context for the Planning Agent
   */
  private buildStateContext(): string {
    const lines: string[] = [];

    // Orchestrator state
    lines.push(`Orchestrator State: ${this.orchestratorState}`);

    // Project statuses
    if (Object.keys(this.projectStatuses).length > 0) {
      lines.push('\nProject Statuses:');
      for (const [project, info] of Object.entries(this.projectStatuses)) {
        lines.push(`- ${project}: ${info.status}${info.message ? ` (${info.message})` : ''}`);
      }
    }

    // Queue status note
    if (this.orchestratorState === 'RUNNING') {
      lines.push('\nNote: The orchestrator is currently running tasks. User-requested actions will go through the event queue.');
    }

    return lines.join('\n');
  }

  /**
   * Starts the Planning Agent (no-op in one-shot mode, always ready)
   */
  async start(): Promise<void> {
    // Create planning agent session directory
    const sessionDir = path.join(this.orchestratorDir, '.planning-agent');
    fs.mkdirSync(path.join(sessionDir, 'outbox'), { recursive: true });

    console.log('[PlanningAgent] Ready (one-shot mode)');
    this.emit('ready');
  }

  /**
   * Builds a prompt with conversation context
   */
  private buildContextPrompt(newMessage: string): string {
    // Build project list for context
    let projectsSection = '';
    if (Object.keys(this.projectConfig).length > 0) {
      const projectList = Object.entries(this.projectConfig)
        .map(([name, config]) => `- **${name}**: ${config.path}`)
        .join('\n');
      projectsSection = `
## REGISTERED PROJECTS

These are the projects you coordinate. Work ONLY on these directories:
${projectList}

When the user asks to implement a feature, explore THESE project directories (not the orchestrator directory).`;
    }

    const systemPrompt = `You are the Planning Agent for a multi-agent orchestrator system.

## YOUR ROLE: COORDINATOR & ANALYST ONLY

You are a COORDINATOR, not a coder. Your role is to:
- Create detailed implementation plans for features
- DELEGATE all coding work to project worker agents
- Analyze events from worker agents and decide on next actions
- Help debug issues by analyzing logs and providing guidance

## CRITICAL RULES

1. **NEVER WRITE CODE YOURSELF** - You analyze and delegate, not implement
2. **NEVER MODIFY FILES** - Do not use Edit, Write, or any file modification tools
3. **NEVER RUN BASH COMMANDS THAT MODIFY STATE** - No npm install, git commit, etc.
4. **NEVER WORK IN THE ORCHESTRATOR DIRECTORY** - The current directory (${this.orchestratorDir}) is the orchestrator system itself, NOT a project you manage. Never explore, read, or modify files here.
${projectsSection}

## WHAT YOU CAN DO

- **Read files** in PROJECT directories to understand structure and gather context
- **Search codebases** using Grep/Glob to analyze project code
- **Create plans** that describe what worker agents should implement
- **Respond to events** from worker agents (status updates, errors, completion)
- **Ask clarifying questions** to the user

## RESPONDING TO USER REQUESTS

When a user asks you to implement a feature:
1. First, explore the RELEVANT PROJECT codebases (the paths listed above, NOT the orchestrator directory) to understand the current state
2. Create a structured plan with tasks for each affected project
3. Present the plan for approval
4. Never start implementing yourself - worker agents will do the actual coding

IMPORTANT: The user might ask about features like "comments", "authentication", etc. These features exist in the PROJECT codebases, not in the orchestrator. Always look in the registered project directories.

## USER ACTION REQUESTS

Users may ask you to perform actions like:
- "restart <project> server"
- "send a prompt to <project> agent"
- "run e2e tests on <project>"
- "skip e2e tests for <project>" / "mark <project> as complete"
- "retry e2e tests for <project>"

### Available Actions
- {"type": "restart_server", "project": "projectName"} - Always allowed
- {"type": "send_to_agent", "project": "projectName", "prompt": "..."} - Only when FAILED or IDLE
- {"type": "send_e2e", "project": "projectName", "prompt": "..."} - Only when FAILED or IDLE
- {"type": "skip_e2e", "project": "projectName", "reason": "..."} - Only when FATAL_DEBUGGING, BLOCKED, or FAILED
- {"type": "retry_e2e", "project": "projectName"} - Only when FATAL_DEBUGGING or FAILED (NOT BLOCKED)

### Skip E2E and Retry E2E Actions

**skip_e2e** - Available when FATAL_DEBUGGING, BLOCKED, or FAILED:
- Marks the project as complete (IDLE) without running E2E tests
- Unblocks any dependent projects waiting for this one
- Use when E2E tests are too difficult to run or not critical

**retry_e2e** - Available when FATAL_DEBUGGING or FAILED (NOT when BLOCKED):
- Re-runs the E2E tests from scratch
- Use when the underlying issue has been fixed and tests should pass now
- NOT available when BLOCKED because that means waiting for dependencies - retrying won't help

### CRITICAL: When Can You Send Prompts to Agents?

**ONLY send prompts to project agents (send_to_agent, send_e2e) when:**
- Project status is **FAILED** - Task failed, user is providing a fix
- Project status is **IDLE** - All tasks complete, user wants refinements

**NEVER send prompts when project is:**
- **WORKING** - Automatic task execution in progress
- **E2E** - E2E tests running
- **E2E_FIXING** - Automatic E2E fix in progress
- **PENDING** - Not started yet

If user asks to send a prompt during automatic execution, explain:
"The [project] agent is currently executing a task automatically. Please wait for it to complete or fail before sending instructions."

### Response Format
When executing an action, respond with BOTH:
1. A brief explanation of what you're doing
2. The action JSON on its own line with the [ACTION] marker:
   [ACTION] {"type": "restart_server", "project": "<project-name>"}
   [ACTION] {"type": "skip_e2e", "project": "<project-name>", "reason": "E2E tests too complex to automate"}
   [ACTION] {"type": "retry_e2e", "project": "<project-name>"}

When NOT executing (refusing):
- Explain why based on the current project status
- Tell user what status would allow the action`;

    // Build state context for user action requests
    const stateContext = this.buildStateContext();

    if (this.conversationHistory.length === 0) {
      return `${systemPrompt}

## Current Orchestrator State
${stateContext}

User: ${newMessage}`;
    }

    // Include recent conversation history for context
    const recentHistory = this.conversationHistory.slice(-this.MAX_HISTORY);
    const historyText = recentHistory
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    return `${systemPrompt}

## Current Orchestrator State
${stateContext}

Previous conversation:
${historyText}

User: ${newMessage}`;
  }

  /**
   * Executes a one-shot Claude call and returns the result
   * Uses spawn with streaming output parsing
   * @param prompt The prompt to send
   * @param timeoutMs Timeout in milliseconds (defaults to CHAT timeout)
   */
  private async executeOneShot(prompt: string, timeoutMs: number = PlanningAgentManager.TIMEOUTS.CHAT): Promise<string> {
    console.log(`[PlanningAgent] Executing one-shot (prompt: ${prompt.length} chars, timeout: ${timeoutMs}ms)`);

    // Generate MCP config with permission tool
    const mcpConfigPath = this.generatePlanningMcpConfig();

    // Planner permissions are now handled via ~/.orchy-config/planner-permissions.json
    // The permission server checks this config when project === 'planner'

    // Spawn claude directly with args array (no shell escaping needed)
    const args = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--no-session-persistence',
      '--mcp-config', mcpConfigPath,
      '--permission-prompt-tool', 'mcp__orchestrator-permission__orchestrator_permission',
    ];

    // Restrict agent to only access project directories for the CURRENT session
    // Use pendingPlanContext.projectPaths (session-specific) not this.projectConfig (all projects)
    const sessionProjectPaths = this.pendingPlanContext?.projectPaths
      ? Object.values(this.pendingPlanContext.projectPaths).filter(Boolean)
      : [];
    if (sessionProjectPaths.length > 0) {
      args.push('--add-dir', ...sessionProjectPaths);
      console.log(`[PlanningAgent] Allowed directories: ${sessionProjectPaths.join(', ')}`);
    }

    const extraEnv = {
      ORCHESTRATOR_URL: 'http://localhost:3456',
      ORCHESTRATOR_PROJECT: 'planner',
    };

    const proc = await spawnWithShellEnv('claude', {
      cwd: this.orchestratorDir,
      args: args,
      extraEnv: extraEnv,
    });

    this.currentProcess = proc;
    console.log('[PlanningAgent] Process spawned, PID:', proc.pid);

    return new Promise((resolve, reject) => {

      let responseBuffer = '';
      let resultText = '';
      let lineCount = 0;
      let partialLine = ''; // Buffer for incomplete lines
      const contentBlocks: ContentBlock[] = []; // Collect all content blocks for persistence

      // Generate unique message ID for this response
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Emit message start for streaming UI
      // Include isPlanningRequest so UI knows whether to show flow or planningStatus
      const startEvent: ChatStreamEvent = {
        type: 'message_start',
        messageId,
        isPlanningRequest: this.isPlanningRequest
      };
      this.emit('stream', startEvent);

      // Process stdout data as it arrives
      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = partialLine + chunk.toString();
        const lines = text.split('\n');

        // Last element might be incomplete - save it for next chunk
        partialLine = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          lineCount++;

          try {
            const msg: StreamJsonMessage = JSON.parse(line);
            console.log(`[PlanningAgent] [${lineCount}] type=${msg.type} subtype=${msg.subtype || '-'}`);

            switch (msg.type) {
              case 'system':
                if (msg.subtype === 'init') {
                  console.log('[PlanningAgent] Process initialized');
                }
                break;

              case 'assistant':
                // Extract and emit all content blocks
                if (msg.message?.content) {
                  for (const block of msg.message.content) {
                    // Convert to our ContentBlock type
                    let contentBlock: ContentBlock | null = null;

                    if (block.type === 'text' && block.text) {
                      responseBuffer += block.text;
                      contentBlock = { type: 'text', text: block.text };
                      this.emit('output', block.text);

                      // Parse [PLANNER_STATUS] messages for real-time status updates (match all occurrences)
                      const statusMatches = block.text.matchAll(/\[PLANNER_STATUS\]\s*(\{[^}]+\})/g);
                      for (const statusMatch of statusMatches) {
                        try {
                          const statusData = JSON.parse(statusMatch[1]);
                          if (statusData.message) {
                            // Use phase from JSON if provided, otherwise use current phase
                            const phase = statusData.phase || this.currentPlanningPhase || 'exploring';
                            this.currentPlanningPhase = phase; // Update current phase
                            console.log(`[PlanningAgent] Status (${phase}): ${statusData.message}`);
                            const statusEvent: PlanningStatusEvent = {
                              phase,
                              message: statusData.message
                            };
                            this.emit('planningStatus', statusEvent);
                          }
                        } catch {
                          // Ignore JSON parse errors
                        }
                      }

                      // Detect plan JSON appearing = generating phase
                      if (this.isPlanningRequest && block.text.includes('"tasks"') && this.currentPlanningPhase !== 'generating') {
                        this.currentPlanningPhase = 'generating';
                        console.log(`[PlanningAgent] Status: Generating plan...`);
                        const statusEvent: PlanningStatusEvent = { phase: 'generating', message: 'Generating plan...' };
                        this.emit('planningStatus', statusEvent);
                      }
                    } else if (block.type === 'tool_use' && block.id && block.name) {
                      contentBlock = {
                        type: 'tool_use',
                        id: block.id,
                        name: block.name,
                        input: block.input || {}
                      };

                      // File/code reading tools = exploring phase - emit specific status
                      if (this.isPlanningRequest && ['Read', 'Glob', 'Grep', 'Task'].includes(block.name)) {
                        this.currentPlanningPhase = 'exploring';
                        let statusMessage = 'Exploring codebase...';

                        // Generate specific status based on tool and input
                        if (block.name === 'Read' && block.input?.file_path) {
                          const filePath = String(block.input.file_path);
                          const fileName = filePath.split('/').pop() || filePath;
                          statusMessage = `Reading ${fileName}`;
                        } else if (block.name === 'Glob' && block.input?.pattern) {
                          statusMessage = `Searching for ${block.input.pattern}`;
                        } else if (block.name === 'Grep' && block.input?.pattern) {
                          statusMessage = `Searching for "${block.input.pattern}"`;
                        } else if (block.name === 'Task' && block.input?.description) {
                          statusMessage = `${block.input.description}`;
                        }

                        console.log(`[PlanningAgent] Status: ${statusMessage}`);
                        const statusEvent: PlanningStatusEvent = { phase: 'exploring', message: statusMessage };
                        this.emit('planningStatus', statusEvent);
                      }
                    } else if (block.type === 'tool_result' && block.tool_use_id) {
                      contentBlock = {
                        type: 'tool_result',
                        tool_use_id: block.tool_use_id,
                        content: block.content || '',
                        is_error: block.is_error
                      };
                    } else if (block.type === 'thinking' && block.thinking) {
                      contentBlock = { type: 'thinking', thinking: block.thinking };

                      // Thinking blocks = analyzing phase (after exploring)
                      if (this.isPlanningRequest && this.currentPlanningPhase === 'exploring') {
                        this.currentPlanningPhase = 'analyzing';
                        console.log(`[PlanningAgent] Status: Analyzing requirements...`);
                        const statusEvent: PlanningStatusEvent = { phase: 'analyzing', message: 'Analyzing requirements...' };
                        this.emit('planningStatus', statusEvent);
                      }
                    }

                    // Emit content block for streaming UI and collect for persistence
                    if (contentBlock) {
                      contentBlocks.push(contentBlock);
                      const blockEvent: ChatStreamEvent = {
                        type: 'content_block',
                        messageId,
                        block: contentBlock
                      };
                      this.emit('stream', blockEvent);
                    }
                  }
                }
                break;

              case 'result':
                // Final result
                resultText = msg.result || responseBuffer;
                console.log(`[PlanningAgent] Got result (${resultText.length} chars)`);
                break;

              case 'error':
                console.error('[PlanningAgent] Error from Claude:', msg);
                const errorEvent: ChatStreamEvent = {
                  type: 'error',
                  messageId,
                  error: 'Claude error'
                };
                this.emit('stream', errorEvent);
                break;
            }
          } catch (err) {
            // Not JSON - skip
            if (line.length > 10) {
              console.warn('[PlanningAgent] Non-JSON line:', line.substring(0, 80));
            }
          }
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        console.error('[PlanningAgent] STDERR:', text.substring(0, 200));
      });

      proc.on('error', (err) => {
        console.error('[PlanningAgent] Process error:', err);
        this.currentProcess = null;
        this.emit('free'); // Signal that PA is available for new requests
        const errorEvent: ChatStreamEvent = {
          type: 'error',
          messageId,
          error: err.message
        };
        this.emit('stream', errorEvent);
        reject(err);
      });

      proc.on('exit', (code, signal) => {
        // Process any remaining partial line
        if (partialLine.trim()) {
          try {
            const msg: StreamJsonMessage = JSON.parse(partialLine);
            if (msg.type === 'result') {
              resultText = msg.result || responseBuffer;
              console.log(`[PlanningAgent] Got final result from partial line (${resultText.length} chars)`);
            }
          } catch {
            // Ignore parse errors on final partial line
          }
        }

        console.log(`[PlanningAgent] Process exited (code: ${code}, signal: ${signal}, lines: ${lineCount})`);
        this.currentProcess = null;
        this.emit('free'); // Signal that PA is available for new requests

        const finalResult = resultText || responseBuffer;
        if (code === 0 || finalResult) {
          this.processOutput(finalResult);

          // Emit message complete for streaming UI with all content blocks
          const completeEvent: ChatStreamEvent = {
            type: 'message_complete',
            messageId,
            content: contentBlocks
          };
          this.emit('stream', completeEvent);
          resolve(finalResult);
        } else {
          const errorEvent: ChatStreamEvent = {
            type: 'error',
            messageId,
            error: `Process exited with code ${code}`
          };
          this.emit('stream', errorEvent);
          reject(new Error(`Process exited with code ${code}`));
        }
      });

      // Set timeout for the entire operation
      const timeout = setTimeout(() => {
        if (this.currentProcess) {
          console.error(`[PlanningAgent] Timeout after ${timeoutMs}ms - killing process`);
          this.currentProcess.kill('SIGKILL');
          this.currentProcess = null;
          this.emit('free'); // Signal that PA is available for new requests
          reject(new Error(`Planning Agent timeout after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      proc.on('exit', () => clearTimeout(timeout));
    });
  }

  /**
   * Queues a request and ensures only one executes at a time.
   * This prevents race conditions where multiple Claude processes spawn simultaneously.
   */
  private async queuedExecute(prompt: string, timeout: number): Promise<string> {
    // Reject if queue is full to prevent resource exhaustion
    if (this.requestQueue.length >= this.MAX_QUEUE_SIZE) {
      throw new Error('Planning Agent queue full - too many concurrent requests');
    }

    return new Promise((resolve, reject) => {
      this.requestQueue.push({ prompt, timeout, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Processes the request queue sequentially.
   * Only one request executes at a time; others wait in queue.
   */
  private async processQueue(): Promise<void> {
    if (this.isExecuting || this.requestQueue.length === 0) return;

    this.isExecuting = true;
    const request = this.requestQueue.shift()!;

    try {
      const result = await this.executeOneShot(request.prompt, request.timeout);
      request.resolve(result);
    } catch (err) {
      request.reject(err as Error);
    } finally {
      this.isExecuting = false;
      // Process next item in queue (if any)
      this.processQueue();
    }
  }

  /**
   * Generates MCP config file for planning agent with:
   * - orchestrator-planning: ask_planning_question and stage submission tools
   * - orchestrator-permission: permission prompt tool for live approval
   * Uses ensureMcpServerExtracted() to ensure the MCP server is always up-to-date.
   */
  private generatePlanningMcpConfig(): string {
    const cacheDir = getCacheDir();
    const configPath = path.join(cacheDir, 'planning-mcp-config.json');

    // Use the extracted MCP server path (ensures it's always up-to-date)
    const mcpServerPath = ensureMcpServerExtracted();

    const config = {
      mcpServers: {
        'orchestrator-planning': {
          command: 'node',
          args: [mcpServerPath]
        },
        'orchestrator-permission': {
          command: 'node',
          args: [mcpServerPath]
        }
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return configPath;
  }

  /**
   * Emits flow events for UI feedback
   */
  private emitFlowStart(flowId: string): void {
    this.emit('flowStart', {
      id: flowId,
      type: 'planning',
      status: 'in_progress',
      startedAt: Date.now(),
      steps: []
    });
  }

  private emitFlowStep(flowId: string, stepId: string, status: 'active' | 'completed' | 'failed', message: string): void {
    this.emit('flowStep', {
      flowId,
      step: {
        id: stepId,
        status,
        message,
        timestamp: Date.now()
      }
    });
  }

  private emitFlowComplete(flowId: string, status: 'completed' | 'failed', result?: { passed: boolean; summary?: string; details?: string }): void {
    console.log(`[PlanningAgent] Emitting flowComplete: flowId=${flowId}, status=${status}`);
    this.emit('flowComplete', {
      flowId,
      status,
      result,
      timestamp: Date.now()
    });
  }

  private handlePhaseError(flowId: string, phaseName: string, err: unknown): void {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[PlanningAgent] ${phaseName} failed:`, errorMessage);

    this.emitFlowComplete(flowId, 'failed', {
      passed: false,
      summary: `${phaseName} failed`,
      details: errorMessage
    });

    const errorStatus: PlanningStatusEvent = {
      phase: 'error',
      message: `${phaseName} failed`,
      errorDetails: errorMessage
    };
    this.emit('planningStatus', errorStatus);
    this.isPlanningRequest = false;
  }

  /**
   * Clears planning status when planning request completes.
   */
  private processOutput(_output: string): void {
    if (this.isPlanningRequest) {
      const statusEvent: PlanningStatusEvent = { phase: 'complete', message: 'Response complete' };
      this.emit('planningStatus', statusEvent);
      this.isPlanningRequest = false;
    }
  }

  /**
   * Sends a chat message and waits for response
   * @param message The message to send
   * @param timeoutMs Optional custom timeout (defaults to CHAT timeout)
   */
  async sendChat(message: string, timeoutMs: number = PlanningAgentManager.TIMEOUTS.CHAT): Promise<string> {
    console.log(`[PlanningAgent] Sending: ${message.substring(0, 100)}...`);

    // Build prompt with context BEFORE adding to history (to avoid duplication)
    const contextPrompt = this.buildContextPrompt(message);

    // Add user message to history AFTER building prompt
    this.conversationHistory.push({ role: 'user', content: message });

    try {
      // Execute through queue to prevent race conditions
      const result = await this.queuedExecute(contextPrompt, timeoutMs);

      // Add assistant response to history
      this.conversationHistory.push({ role: 'assistant', content: result });

      // Trim history if too long
      if (this.conversationHistory.length > this.MAX_HISTORY * 2) {
        this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY * 2);
      }

      return result;
    } catch (err) {
      console.error('[PlanningAgent] Error in sendChat:', err);

      // Emit error status if this was a planning request
      if (this.isPlanningRequest) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorStatus: PlanningStatusEvent = {
          phase: 'error',
          message: 'Planning failed',
          errorDetails: errorMessage
        };
        this.emit('planningStatus', errorStatus);
        this.isPlanningRequest = false;
      }

      throw err;
    }
  }

  /**
   * Sends an isolated analysis request without conversation history.
   * Used for independent analyses (task verification, E2E analysis) that
   * should not share context with other concurrent requests.
   */
  private async sendIsolatedAnalysis(prompt: string, timeoutMs: number): Promise<string> {
    console.log(`[PlanningAgent] Isolated analysis: ${prompt.substring(0, 80)}...`);

    // Build minimal context (system prompt + state, no conversation history)
    const systemPrompt = `You are the Planning Agent for a multi-project orchestrator.
You analyze task results and E2E test outputs to determine pass/fail status.
Respond ONLY with the requested JSON marker format.`;

    const stateContext = this.buildStateContext();

    const fullPrompt = `${systemPrompt}

## Current Orchestrator State
${stateContext}

${prompt}`;

    try {
      // Execute through queue (serialized) but don't accumulate history
      const result = await this.queuedExecute(fullPrompt, timeoutMs);
      return result;
    } catch (err) {
      console.error('[PlanningAgent] Error in sendIsolatedAnalysis:', err);
      throw err;
    }
  }

  /**
   * Starts the new 6-stage planning workflow with approval loops at each stage.
   * Stages:
   * 1. Feature Refinement - Read CLAUDE.md/skills FIRST, then Socratic Q&A
   * 2. Sub-feature Breakdown - Split into manageable product chunks
   * 3. Sub-feature Refinement - Refine each chunk with approval loop
   * 4. Project Exploration - Deep codebase exploration for technical planning
   * 5. Technical Planning - Define API contracts, architecture
   * 6. Task Generation - Create implementation tasks & E2E tests
   *
   * @param feature Initial feature description
   * @param projects List of project names
   * @param projectPaths Map of project names to paths
   * @param sessionProjectConfigs Optional session project configs
   */
  async startPlanningWorkflow(
    feature: string,
    projects: string[],
    projectPaths?: Record<string, string>,
    sessionProjectConfigs?: SessionProjectConfig[]
  ): Promise<void> {
    const flowId = `planning_workflow_${Date.now()}`;

    this.isPlanningRequest = true;
    this.currentPlanningPhase = 'exploring';

    // Store context for later stages
    this.pendingPlanContext = { feature, projects, projectPaths, sessionProjectConfigs, flowId };

    // Emit flow start for UI tracking
    this.emitFlowStart(flowId);
    this.emitFlowStep(flowId, 'stage1', 'active', 'Feature Refinement');

    const initialStatus: PlanningStatusEvent = { phase: 'exploring', message: 'Starting feature refinement...' };
    this.emit('planningStatus', initialStatus);

    try {
      // Build Stage 1 prompt (Feature Refinement with Socratic Q&A)
      const stage1Prompt = this.buildFeatureRefinementPrompt(feature, projects, projectPaths || {});

      // Run the planning agent with MCP tools enabled
      // Agent will call submit_refined_feature when done with Q&A
      // That tool blocks for user approval
      // If approved, returns { status: "approved" } and agent proceeds
      // If refine, returns { status: "refine", feedback: "..." } and agent revises
      const result = await this.executeOneShot(
        stage1Prompt,
        PlanningAgentManager.TIMEOUTS.PLAN_CREATION
      );

      console.log(`[PlanningAgent] Planning workflow completed, result length: ${result.length}`);
      this.processOutput(result);

      this.emitFlowStep(flowId, 'complete', 'completed', 'Planning complete');
    } catch (err) {
      this.emitFlowComplete(flowId, 'failed', {
        passed: false,
        summary: 'Planning workflow failed',
        details: String(err)
      });
      throw err;
    } finally {
      this.isPlanningRequest = false;
      this.pendingPlanContext = null;
    }
  }

  /**
   * Builds the Stage 1 prompt for Feature Refinement.
   * Agent conducts Socratic Q&A then calls submit_refined_feature.
   */
  private buildFeatureRefinementPrompt(
    feature: string,
    projects: string[],
    projectPaths: Record<string, string>
  ): string {
    // Build project list with design info
    const projectList = projects.map(p => {
      const config = this.projectConfig[p];
      const designInfo = config?.attachedDesign
        ? ` (has design: "${config.attachedDesign}" - see ui_mockup/ folder)`
        : '';
      return `- ${p}: ${projectPaths[p] || 'unknown'}${designInfo}`;
    }).join('\n');

    // Check if any project has a design attached
    const projectsWithDesign = projects.filter(p => this.projectConfig[p]?.attachedDesign);
    const designSection = projectsWithDesign.length > 0 ? `
## Design System Available

The following projects have design mockups attached:
${projectsWithDesign.map(p => `- **${p}**: Design "${this.projectConfig[p]?.attachedDesign}" is in \`${projectPaths[p]}/ui_mockup/\``).join('\n')}

**IMPORTANT**: Before asking about visual style or UI preferences, READ the design files in ui_mockup/ folders.
The design system already defines colors, typography, components, and layouts. Use what's there.
` : '';

    return `You are a planning agent conducting Stage 1: Feature Refinement.

This is **PRODUCT** refinement - focus on user needs, not technical implementation.

## Initial Feature Request
${feature}

## Projects
${projectList}
${designSection}
## Your Task: Understand the Product Need

### Step 1: FIRST, Analyze What Already Exists (REQUIRED)

Before asking ANY questions, you MUST understand each project. For EACH project, read:

1. **CLAUDE.md** - Project overview, conventions, what already exists
   - Path: \`{projectPath}/CLAUDE.md\`

2. **Skills folder** - Available capabilities and patterns
   - Path: \`{projectPath}/.claude/skills/\`
   - Read any .md files in this folder

3. **Design mockups** (if attached)
   - Path: \`{projectPath}/ui_mockup/\`
   - Read design files to understand the visual direction

This tells you:
- What the project already does
- What conventions to follow
- What components/patterns already exist
- What the design system looks like

#### PARALLEL ANALYSIS (Recommended for Multiple Projects)

For faster analysis, spawn multiple subagents to explore different projects simultaneously:

**How to use:**
1. Use the Task tool with \`subagent_type="Explore"\`
2. Launch multiple agents in a SINGLE message (multiple Task tool calls)
3. Each agent explores a different project
4. Wait for all agents, then synthesize findings

**Example - Parallel project exploration:**
\`\`\`
Agent 1: "Read CLAUDE.md and .claude/skills/ in {frontend-path}. Summarize what exists."
Agent 2: "Read CLAUDE.md and .claude/skills/ in {backend-path}. Summarize what exists."
Agent 3: "Read ui_mockup/ in {frontend-path}. Describe the design system."
\`\`\`

**Tips:**
- Use "quick" thoroughness for initial CLAUDE.md/skills reads
- Be specific in each agent's task to avoid duplicate work
- Combine findings from all agents before asking questions

### Step 2: Ask Informed Questions

Now that you understand what exists, ask clarifying questions:
- Focus on PRODUCT requirements (what users need)
- Skip questions about things you already learned from the files
- Skip design questions if you read the ui_mockup/ folder
- Typically 1-3 questions for simple features, 3-5 for complex ones

Use \`mcp__orchestrator-planning__ask_planning_question\` to ask questions.

### Step 3: Synthesize

After the Q&A dialogue, synthesize what you learned into:
- A refined feature description (1-2 paragraphs) - what the USER gets
- Key product requirements (user-facing outcomes) - as many as needed, typically 2-6

Call \`mcp__orchestrator-planning__submit_refined_feature\` with:
- refinedDescription: Your synthesized description
- keyRequirements: Array of requirement strings

The tool returns JSON with:
- status: "approved" or "refine"
- feedback: (if refine) What to change
- nextPrompt: (if approved) Instructions for exploring the codebase

**IMPORTANT:** If status is "approved", the response includes a \`nextPrompt\` field with instructions for Project Exploration.
You MUST follow the instructions in nextPrompt to explore the codebase and understand how to implement this feature.
Do NOT invent your own exploration behavior - use the provided prompt exactly.

If status is "refine", revise based on feedback and resubmit.

## Status Reporting
[PLANNER_STATUS] {"phase": "exploring", "message": "Analyzing projects..."}

**START by reading CLAUDE.md and skills for each project. Then ask informed questions.**`;
  }

  /**
   * Generates the Stage 2 prompt for Exploration & Planning.
   * Called when submit_refined_feature is approved.
   * Combines exploration and technical planning into a single stage.
   */
  generateExplorationPlanningPrompt(refinedDescription: string, requirements: string[]): string {
    return `## Stage 2: Exploration & Planning

You have a refined understanding of the feature:

**Description:**
${refinedDescription}

**Requirements:**
${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

## Your Task

Now explore the codebase to understand HOW to implement this, then define the technical approach.

### Step 1: Explore the Codebase

Use the Task tool with subagent_type="Explore" to analyze the codebase:

**Launch exploration agents in a SINGLE message:**
1. "Explore for existing API patterns, database models, and authentication"
2. "Explore for frontend components, state management, and routing patterns"
3. "Search for similar features already implemented that we can learn from"

### What to Discover

- Existing code patterns and conventions
- Database schema and models
- API endpoint patterns
- Frontend component structure
- Authentication/authorization patterns
- Testing patterns

### Step 2: Define Technical Approach

Based on your exploration, define:

1. **API Contracts** - For each endpoint needed:
   - endpoint: The path (e.g., "/api/users")
   - method: HTTP method
   - request: Request body fields and types
   - response: Response body fields and types
   - providedBy: Which project implements this
   - consumedBy: Which projects call this

2. **Architecture Decisions** - Key technical choices (keep it brief, 2-5 decisions)

3. **Execution Order** - Which projects to implement first and dependencies

### Submit for Approval

Call \`mcp__orchestrator-planning__submit_technical_spec\` with:
- apiContracts: Array of contract objects
- architectureDecisions: Array of decision strings
- executionOrder: Array of { project, dependsOn: string[] }

The tool returns JSON with:
- status: "approved" or "refine"
- feedback: (if refine) What to change
- instructions: (if approved) Next steps for task generation

**IMPORTANT:** If status is "approved", follow the \`instructions\` field for Task Generation.

If status is "refine", update based on feedback and resubmit.

## Status Reporting
[PLANNER_STATUS] {"phase": "exploring", "message": "Exploring codebase..."}`;
  }

  /**
   * Requests E2E test prompt for a project
   */
  async requestE2EPrompt(request: E2EPromptRequest): Promise<string> {
    const passedNote = request.passedCount && request.passedCount > 0
      ? `\n\nNote: ${request.passedCount} tests have already passed and are being skipped. Only the remaining tests need to be run.`
      : '';

    const prompt = `Project "${request.project}" has completed its task and is ready for E2E testing.

Task completed: ${request.taskSummary}

${request.devServerUrl ? `Dev server URL: ${request.devServerUrl}` : ''}

Test scenarios to verify:
${request.testScenarios.map((s, i) => `${i + 1}. ${s}`).join('\n')}${passedNote}

Generate an E2E test prompt that instructs the agent to:

**CRITICAL RULES - THE AGENT MUST FOLLOW THESE:**
- DO NOT start, build, or restart any servers - the orchestrator manages all servers
- DO NOT run npm install, npm run build, npm run dev, or similar commands
- The dev server is ALREADY RUNNING at the URL above - just run tests against it
- If the server is not responding, FAIL the tests and report the error - DO NOT try to fix it
- The agent's ONLY job is to run E2E tests and report results
- **FAIL FAST**: Stop immediately after the FIRST test failure - do not continue to other tests
- **When setting environment variables for commands, ALWAYS use the \`env\` command** - e.g. \`env NODE_ENV=test npx prisma migrate\` instead of \`NODE_ENV=test npx prisma migrate\`

1. READ the project's E2E testing skill if it exists: Check for .claude/skills/e2e-testing.md in the project directory
   - If the skill file exists, follow its testing methodology exactly
   - If no skill file exists, determine the appropriate testing approach based on the project type:
     * For web UIs: Use browser automation (Playwright MCP tools) to interact with the UI
     * For APIs/backends: Use HTTP requests (curl or similar) to test endpoints
   - The skill file takes precedence over generic approaches

2. OUTPUT TEST STATUS MARKERS for real-time UI tracking. For EACH test scenario:
   - Before running: [TEST_STATUS] {"scenario": "exact scenario text from list above", "status": "running"}
   - After passing: [TEST_STATUS] {"scenario": "exact scenario text from list above", "status": "passed"}
   - After failing: [TEST_STATUS] {"scenario": "exact scenario text from list above", "status": "failed", "error": "brief error message"}

3. **FAIL FAST BEHAVIOR**: When a test FAILS:
   - STOP immediately - do not run any more tests
   - Output the TEST_STATUS marker with status "failed"
   - Proceed directly to step 5 (analysis) and step 6 (structured response)
   - The orchestrator will handle fixing the failure before continuing

4. If required tools are NOT AVAILABLE (e.g., Playwright MCP tools for frontend):
   - DO NOT attempt to analyze code as a workaround
   - Immediately fail all tests with error explaining the missing tools
   - Output: [TEST_STATUS] {"scenario": "ALL", "status": "failed", "error": "Required testing tools not available"}

5. If the server is NOT RESPONDING:
   - DO NOT try to start or fix the server
   - Immediately fail all tests with error explaining the server is not available
   - Output: [TEST_STATUS] {"scenario": "ALL", "status": "failed", "error": "Dev server not responding${request.devServerUrl ? ` at ${request.devServerUrl}` : ''}"}

6. If ANY tests fail, ANALYZE the codebase to understand WHY:
   - Trace the failing scenario to the relevant code
   - Identify what the code is trying to do and where it fails
   - Determine if the issue is in THIS project or another

7. Return a structured response at the END using the [E2E_RESULTS] marker on a SINGLE LINE:

[E2E_RESULTS] {"allPassed": true/false, "failures": [{"test": "name", "error": "msg", "codeAnalysis": "analysis", "suspectedProject": "<project-name>|this|unknown"}], "overallAnalysis": "summary"}

IMPORTANT: The [E2E_RESULTS] marker and JSON MUST be on ONE LINE. This marker is REQUIRED - the orchestrator uses it to parse results.

Example success:
[E2E_RESULTS] {"allPassed": true, "failures": [], "overallAnalysis": "All tests passed"}

Example failure:
[E2E_RESULTS] {"allPassed": false, "failures": [{"test": "Create post", "error": "Failed to fetch", "codeAnalysis": "CORS error when calling API", "suspectedProject": "api-server"}], "overallAnalysis": "API server needs CORS configuration"}

Output the E2E prompt that should be sent to the agent.`;

    return await this.sendChat(prompt, PlanningAgentManager.TIMEOUTS.E2E_PROMPT);
  }

  /**
   * Asks the Planning Agent to analyze a failure
   */
  async analyzeFailure(project: string, error: string, context: string[]): Promise<string> {
    const prompt = `The "${project}" agent encountered an error and needs debugging guidance.

Error: ${error}

Recent logs:
${context.slice(-20).join('\n')}

Please analyze the error and provide specific guidance for fixing it.
Focus on:
1. What likely caused the error
2. Specific steps to fix it
3. How to prevent it in the future`;

    return await this.sendChat(prompt, PlanningAgentManager.TIMEOUTS.FAILURE_ANALYSIS);
  }

  /**
   * Analyzes task execution results to determine if task completed successfully.
   * Uses intelligent analysis of build output, dev server logs, and health check.
   * Returns pass/fail decision with context-aware fix prompt if needed.
   */
  async analyzeTaskResult(context: TaskVerificationContext, _taskIndex?: number): Promise<TaskAnalysisResult> {
    // Get project config to show which verification features are enabled
    const projectConfig = this.projectConfig[context.project];
    const installEnabled = projectConfig?.installEnabled ?? false;
    const buildEnabled = projectConfig?.buildEnabled ?? !!projectConfig?.buildCommand;
    const devServerEnabled = projectConfig?.devServerEnabled ?? true;

    const prompt = `## TASK VERIFICATION ANALYSIS

You are analyzing whether a task completed successfully. Review ALL the context below and make an intelligent decision.

**Project:** ${context.project}
**Task:** ${context.taskName}

**Verification Configuration:**
- Install packages: ${installEnabled ? '✅ Enabled' : '❌ Disabled'}
- Build: ${buildEnabled ? '✅ Enabled' : '❌ Disabled'}
- Dev server: ${devServerEnabled ? '✅ Enabled' : '❌ Disabled'}

**Task Description:**
${context.taskDescription}

${context.buildOutput ? `
---
**BUILD RESULT:**
- Exit code: ${context.buildOutput.exitCode}
${context.buildOutput.stdout ? `- Stdout (last 2000 chars):
\`\`\`
${context.buildOutput.stdout.slice(-2000)}
\`\`\`` : ''}
${context.buildOutput.stderr ? `- Stderr (last 2000 chars):
\`\`\`
${context.buildOutput.stderr.slice(-2000)}
\`\`\`` : ''}
` : '**BUILD:** Not configured or disabled'}

---
**DEV SERVER LOGS (recent):**
\`\`\`
${context.devServerLogs ? context.devServerLogs.slice(-3000) : 'Dev server disabled or no logs available'}
\`\`\`

---
**HEALTH CHECK:** ${context.healthCheck?.healthy ? '✅ PASSED - Server responding' : context.healthCheck?.error ? `❌ FAILED: ${context.healthCheck.error}` : 'N/A - Dev server disabled'}

---

## YOUR ANALYSIS

Consider carefully:
1. **Build errors**: Type errors, missing imports, syntax errors, compilation failures
2. **Runtime errors**: Check dev server logs for crashes, Prisma errors, module not found, unhandled exceptions
3. **Health check context**: Is it failing due to code issues or just timing? Check if dev server logs show the app started successfully
4. **Hidden issues**: Warnings that might cause problems, deprecated APIs, potential runtime issues

Be intelligent - a passing build with runtime errors in logs should FAIL. A health check that fails but logs show app running might just need more time.

## SUGGESTED ACTIONS (choose one)

- **retry**: Use when there are fixable errors - whether introduced by this task OR pre-existing but easy to fix. Examples:
  - Wrong imports, missing exports, type errors in code
  - Missing dependencies that can be installed (npm install @types/react, etc.)
  - Simple config fixes (tsconfig adjustments, etc.)
  The agent should fix whatever it can to make the build pass.

- **escalate**: Use ONLY for truly unfixable issues requiring human decisions:
  - Architectural problems or major refactoring needed
  - Conflicting requirements or unclear specifications
  - Issues requiring access/permissions the agent doesn't have
  - Complex problems beyond simple code/dependency fixes

## RESPONSE FORMAT (REQUIRED)

You may add brief explanation text before the marker, but you MUST end with:

[TASK_RESULT] {"passed": true/false, "analysis": "1-2 sentence explanation", "fixPrompt": "If failed: specific fix instructions for the agent", "suggestedAction": "retry/escalate/skip"}

The [TASK_RESULT] marker followed by JSON is REQUIRED. This is how the orchestrator parses your response.`;

    console.log(`[PlanningAgent] Analyzing task result for ${context.project}:${context.taskName}`);

    try {
      // Use isolated analysis to prevent context bleeding between concurrent task analyses
      const response = await this.sendIsolatedAnalysis(prompt, PlanningAgentManager.TIMEOUTS.TASK_ANALYSIS);

      // Try marker-based parsing first
      const parsed = parseMarkedResponse<TaskAnalysisResult>(response, MARKERS.TASK_RESULT, ['passed']);

      let result: TaskAnalysisResult | null = null;

      if (parsed.success && parsed.data) {
        result = parsed.data;
        console.log(`[PlanningAgent] Parsed via [TASK_RESULT] marker`);
      } else {
        // Fallback to legacy JSON extraction
        console.log(`[PlanningAgent] Marker not found, falling back to extractJSON: ${parsed.error}`);
        result = extractJSON<TaskAnalysisResult>(response, ['passed']);
      }

      if (result) {
        console.log(`[PlanningAgent] Analysis result: passed=${result.passed}, action=${result.suggestedAction}`);

        // Emit analysis result event for UI
        const analysisEvent: AnalysisResultEvent = {
          type: 'task',
          project: context.project,
          taskName: context.taskName,
          passed: result.passed,
          summary: result.passed ? 'Task verified successfully' : (result.analysis || '').slice(0, 100),
          details: result.analysis,
          fixPrompt: result.fixPrompt
        };
        this.emit('analysisResult', analysisEvent);

        return result;
      }

      // Fallback: check for explicit "passed": false/true in raw text
      console.log('[PlanningAgent] Could not parse structured response, checking for patterns');
      console.log('[PlanningAgent] Raw response (first 500 chars):', response.slice(0, 500));

      // Simple fallback: check for "passed": false in raw text
      if (/"passed"\s*:\s*false/i.test(response)) {
        console.log('[PlanningAgent] Found "passed": false pattern in raw response');
        const fallbackResult = {
          passed: false,
          analysis: 'Parse failed but found failure indicator',
          fixPrompt: response,
          suggestedAction: 'retry' as const
        };

        // Emit fallback analysis result
        const analysisEvent: AnalysisResultEvent = {
          type: 'task',
          project: context.project,
          taskName: context.taskName,
          passed: false,
          summary: 'Task failed (from pattern match)',
          details: fallbackResult.analysis,
          fixPrompt: response
        };
        this.emit('analysisResult', analysisEvent);

        return fallbackResult;
      }

      // Default: treat as failure
      const fallbackResult = {
        passed: false,
        analysis: 'Could not parse response - treating as failure',
        fixPrompt: response,
        suggestedAction: 'retry' as const
      };

      // Emit fallback analysis result
      const analysisEvent: AnalysisResultEvent = {
        type: 'task',
        project: context.project,
        taskName: context.taskName,
        passed: false,
        summary: 'Failed to parse analysis response',
        details: fallbackResult.analysis,
        fixPrompt: response
      };
      this.emit('analysisResult', analysisEvent);

      return fallbackResult;
    } catch (err) {
      console.error('[PlanningAgent] Error analyzing task result:', err);

      // Emit error analysis result
      const analysisEvent: AnalysisResultEvent = {
        type: 'task',
        project: context.project,
        taskName: context.taskName,
        passed: false,
        summary: `Analysis failed: ${err}`,
        details: String(err)
      };
      this.emit('analysisResult', analysisEvent);

      return {
        passed: false,
        analysis: `Analysis failed: ${err}`,
        suggestedAction: 'escalate'
      };
    }
  }

  /**
   * Sends coordination message between agents
   */
  async coordinateAgents(message: string): Promise<string> {
    const prompt = `Coordination needed between agents:

${message}

Please provide guidance on how to handle this coordination.`;

    return await this.sendChat(prompt);
  }

  /**
   * Analyzes an event and returns an action
   */
  async analyzeEvent(eventJson: string): Promise<string> {
    const prompt = `Analyze this event and return a JSON action:

${eventJson}

Return one of these action types as JSON:
- {"type": "chat_response", "message": "..."}
- {"type": "send_to_agent", "project": "...", "prompt": "..."}
- {"type": "send_e2e", "project": "...", "prompt": "..."}
- {"type": "restart_server", "project": "..."}
- {"type": "complete", "summary": "..."}
- {"type": "noop"}

## RESPONSE FORMAT (REQUIRED)

You may add brief explanation text before the marker, but you MUST end with:

[EVENT_ACTION] {"type": "...", ...}

The [EVENT_ACTION] marker followed by JSON is REQUIRED.`;

    try {
      const result = await this.sendChat(prompt);

      // Try marker-based parsing first
      const parsed = parseMarkedResponse<{ type: string }>(result, MARKERS.EVENT_ACTION, ['type']);
      if (parsed.success && parsed.data) {
        console.log(`[PlanningAgent] Parsed event action via [EVENT_ACTION] marker`);
        return JSON.stringify(parsed.data);
      }

      // Fallback: Extract JSON from response (legacy format)
      console.log(`[PlanningAgent] Event action marker not found, falling back to regex: ${parsed.error}`);
      const jsonMatch = result.match(/\{[\s\S]*?"type"\s*:\s*"[^"]+"[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          JSON.parse(jsonMatch[0]);
          return jsonMatch[0];
        } catch {
          // Fall through
        }
      }
      return '{"type": "noop"}';
    } catch (err) {
      console.error('[PlanningAgent] Error analyzing event:', err);
      return '{"type": "noop"}';
    }
  }

  /**
   * Analyzes E2E test results and determines if tests passed or need fixes
   * Returns: { passed: boolean, analysis: string, fixes?: Array<{project, prompt}> }
   */
  async analyzeE2EResult(project: string, e2eOutput: string, testScenarios: string[], devServerLogs?: string, allProjects?: string[]): Promise<{
    passed: boolean;
    analysis: string;
    fixPrompt?: string;  // Legacy: fix for the originating project
    fixes?: Array<{ project: string; prompt: string }>;  // New: targeted fixes per project
    isInfrastructureFailure?: boolean;  // If true, go straight to FATAL - not fixable by code
  }> {
    const devServerSection = devServerLogs?.trim()
      ? `\nDev Server Logs (stdout/stderr - includes request logs, errors, exceptions):
\`\`\`
${devServerLogs.slice(-3000)}
\`\`\`
`
      : '';

    const projectList = allProjects && allProjects.length > 1
      ? `\nAvailable projects that can receive fixes: ${allProjects.join(', ')}`
      : '';

    // Try to extract the agent's self-analysis JSON from the output using robust parser
    const agentE2EResult = extractE2EResult(e2eOutput);
    const agentAnalysisSection = agentE2EResult
      ? `\nAgent's Self-Analysis (the agent analyzed its own codebase):
\`\`\`json
${JSON.stringify(agentE2EResult, null, 2)}
\`\`\`
This analysis was done BY the agent that ran the tests - it traced failures through its own code.
allPassed: ${agentE2EResult.allPassed}
Use this to make informed decisions about which project(s) need fixes.
`
      : '';

    // Log what we extracted for debugging
    if (agentE2EResult) {
      console.log(`[PlanningAgent] Extracted E2E result from agent output: allPassed=${agentE2EResult.allPassed}`);
    } else {
      console.log(`[PlanningAgent] Could not extract E2E result from agent output (length=${e2eOutput.length})`);
    }

    const prompt = `Analyze the E2E test results for project "${project}".

Test scenarios that were being verified:
${testScenarios.map((s, i) => `${i + 1}. ${s}`).join('\n')}

E2E Test Output:
\`\`\`
${e2eOutput.slice(-5000)}
\`\`\`
${devServerSection}${agentAnalysisSection}
Analyze the output and determine:
1. Did ALL tests pass? Look for "allPassed": true in the agent's analysis, or check for FAIL/Error patterns.
2. CRITICAL: If tests were NOT EXECUTED (e.g., "Playwright MCP tools unavailable", "no access to browser automation", "tests weren't run"), this is a FAILURE. Set passed: false.
3. If tests failed, use the agent's codeAnalysis and suspectedProject fields to understand the root cause.
4. Check the dev server logs for runtime errors (500s, exceptions, missing routes).
5. IMPORTANT: Based on the agent's analysis (especially "suspectedProject" field), determine which project(s) need fixes:
   - If suspectedProject matches a project name → send fix to that project
   - If "this" → send fix to the project being tested
   - If "both" or multiple projects → send coordinated fixes to affected projects
${projectList}

## RESPONSE FORMAT (REQUIRED)

You may add brief explanation text before the marker, but you MUST end with:

[E2E_RESULT] {"passed": true/false, "analysis": "Brief summary", "isInfrastructureFailure": false, "fixes": [{"project": "name", "prompt": "fix instructions"}]}

The [E2E_RESULT] marker followed by JSON is REQUIRED. This is how the orchestrator parses your response.

Rules:
- Set "isInfrastructureFailure": true if tests COULD NOT RUN (missing tools, no browser automation)
- "fixes" array: one entry per project that needs changes, using the agent's codeAnalysis`;

    try {
      // Use isolated analysis to prevent context bleeding between concurrent E2E analyses
      const response = await this.sendIsolatedAnalysis(prompt, PlanningAgentManager.TIMEOUTS.E2E_ANALYSIS);

      // Type for E2E analysis result
      type E2EParseResult = {
        passed: boolean;
        analysis?: string;
        isInfrastructureFailure?: boolean;
        fixes?: Array<{ project: string; prompt: string }>;
        fixPrompt?: string;
      };

      // Try marker-based parsing first
      const markerResult = parseMarkedResponse<E2EParseResult>(response, MARKERS.E2E_RESULT, ['passed']);

      let parsed: E2EParseResult | null = null;

      if (markerResult.success && markerResult.data) {
        parsed = markerResult.data;
        console.log(`[PlanningAgent] Parsed via [E2E_RESULT] marker`);
      } else {
        // Fallback to legacy JSON extraction
        console.log(`[PlanningAgent] Marker not found, falling back to extractJSON: ${markerResult.error}`);
        parsed = extractJSON<E2EParseResult>(response, ['passed']);
      }

      if (parsed) {
        console.log(`[PlanningAgent] Parsed E2E analysis: passed=${parsed.passed}, isInfrastructureFailure=${parsed.isInfrastructureFailure}, fixes=${JSON.stringify(parsed.fixes)}`);

        // Emit analysis result event for UI
        const analysisEvent: AnalysisResultEvent = {
          type: 'e2e',
          project,
          passed: !!parsed.passed,
          summary: parsed.passed ? 'E2E tests passed' : (parsed.analysis || 'E2E tests failed').slice(0, 100),
          details: parsed.analysis || 'No analysis provided'
        };
        this.emit('analysisResult', analysisEvent);

        // Check for infrastructure failure first
        if (parsed.isInfrastructureFailure) {
          console.log(`[PlanningAgent] Infrastructure failure detected - E2E tools unavailable`);
          return {
            passed: false,
            analysis: parsed.analysis || 'E2E infrastructure failure',
            isInfrastructureFailure: true
          };
        }

        // Handle new format with fixes array
        if (parsed.fixes && Array.isArray(parsed.fixes)) {
          const validFixes = parsed.fixes.filter((f: any) => f.project && f.prompt);
          console.log(`[PlanningAgent] Valid fixes after filtering: ${validFixes.map((f: any) => f.project).join(', ')}`);
          return {
            passed: !!parsed.passed,
            analysis: parsed.analysis || 'No analysis provided',
            fixes: validFixes
          };
        }

        // Fallback format: single-project fix or no fixes needed
        console.log(`[PlanningAgent] Using fallback format (fixPrompt instead of fixes array)`);
        return {
          passed: !!parsed.passed,
          analysis: parsed.analysis || 'No analysis provided',
          fixPrompt: parsed.fixPrompt
        };
      }

      // If we can't parse, check for explicit "passed" value in raw response first
      console.warn('[PlanningAgent] Could not parse E2E analysis JSON, checking for failure patterns');

      // CRITICAL FIX: Check PA's response for explicit "passed": false/true
      const hasExplicitFalse = /"passed"\s*:\s*false/i.test(response);
      const hasExplicitTrue = /"passed"\s*:\s*true/i.test(response);

      if (hasExplicitFalse) {
        console.log('[PlanningAgent] Found "passed": false in raw response - treating as failure');
        const analysisEvent: AnalysisResultEvent = {
          type: 'e2e',
          project,
          passed: false,
          summary: 'E2E tests failed (from raw response)',
          details: response.slice(0, 500)
        };
        this.emit('analysisResult', analysisEvent);
        return {
          passed: false,
          analysis: response.slice(0, 500),
          fixPrompt: response
        };
      }

      if (hasExplicitTrue) {
        console.log('[PlanningAgent] Found "passed": true in raw response - treating as success');
        const analysisEvent: AnalysisResultEvent = {
          type: 'e2e',
          project,
          passed: true,
          summary: 'E2E tests passed (from raw response)',
          details: response.slice(0, 500)
        };
        this.emit('analysisResult', analysisEvent);
        return {
          passed: true,
          analysis: response.slice(0, 500)
        };
      }

      // Fallback to pattern matching on agent output
      // Check for EXPLICIT pass indicators first
      const hasExplicitPass = /\ball(?:Passed|tests passed)\s*[:\s]*true\b|all.*tests.*passed|tests.*completed.*successfully|e2e.*passed/i.test(e2eOutput);

      // Use word boundaries and context for failures
      const failurePatterns = [
        /\bfail(ed|ure|ing)?\b/i,
        /\berror(s)?\b(?!.*expected)/i,
        /\bassert(ion)?\s*(fail|error)/i,
        /\btimeout\b/i,
        /\bexpected\s+.+\s+but\s+(got|received|was)\b/i,
        /\btest(s)?\s+(did not|didn't)\s+pass/i,
      ];

      const hasFailure = !hasExplicitPass && failurePatterns.some(pattern => pattern.test(e2eOutput));
      const testsNotExecuted = /not executed|weren't executed|weren't run|not run|no tests ran|mcp.*unavailable|playwright.*not.*installed|cannot.*run.*tests/i.test(e2eOutput);

      // If tests weren't executed at all, that's an infrastructure failure - not fixable by code changes
      if (testsNotExecuted) {
        const analysisEvent: AnalysisResultEvent = {
          type: 'e2e',
          project,
          passed: false,
          summary: 'E2E tests could not be executed',
          details: 'Testing tools or infrastructure unavailable. This requires manual intervention.'
        };
        this.emit('analysisResult', analysisEvent);

        return {
          passed: false,
          analysis: 'E2E tests could not be executed - testing infrastructure unavailable',
          isInfrastructureFailure: true  // Signal to orchestrator to go to FATAL, not retry
        };
      }

      // Emit generic analysis result
      const analysisEvent: AnalysisResultEvent = {
        type: 'e2e',
        project,
        passed: !hasFailure,
        summary: hasFailure ? 'E2E tests failed' : 'E2E tests passed',
        details: response.slice(0, 500)
      };
      this.emit('analysisResult', analysisEvent);

      return {
        passed: !hasFailure,
        analysis: response.slice(0, 500),
        fixPrompt: hasFailure ? response : undefined
      };
    } catch (err) {
      console.error('[PlanningAgent] Error analyzing E2E result:', err);

      // Emit error analysis result
      const analysisEvent: AnalysisResultEvent = {
        type: 'e2e',
        project,
        passed: false,
        summary: 'Could not analyze E2E results',
        details: String(err)
      };
      this.emit('analysisResult', analysisEvent);

      // On error, check output for obvious failures using robust patterns
      const hasExplicitPassCatch = /\ball(?:Passed|tests passed)\s*[:\s]*true\b|all.*tests.*passed|tests.*completed.*successfully|e2e.*passed/i.test(e2eOutput);
      const failurePatternsCatch = [
        /\bfail(ed|ure|ing)?\b/i,
        /\berror(s)?\b(?!.*expected)/i,
        /\bassert(ion)?\s*(fail|error)/i,
        /\btimeout\b/i,
        /\bexpected\s+.+\s+but\s+(got|received|was)\b/i,
        /\btest(s)?\s+(did not|didn't)\s+pass/i,
      ];
      const hasFailure = !hasExplicitPassCatch && failurePatternsCatch.some(pattern => pattern.test(e2eOutput));
      const testsNotExecuted = /not executed|weren't executed|weren't run|not run|no tests ran|mcp.*unavailable|playwright.*not.*installed|cannot.*run.*tests/i.test(e2eOutput);

      // If tests weren't executed at all, that's a failure
      if (testsNotExecuted) {
        return {
          passed: false,
          analysis: 'E2E tests were NOT executed - infrastructure issue',
          fixPrompt: 'E2E tests could not be executed. Ensure testing infrastructure is properly configured.'
        };
      }

      return {
        passed: !hasFailure,
        analysis: 'Could not analyze E2E results',
        fixPrompt: hasFailure ? 'Please review the test failures and fix the issues.' : undefined
      };
    }
  }

  /**
   * Checks if the Planning Agent is running (always true in one-shot mode)
   */
  isRunning(): boolean {
    return true; // Always ready in one-shot mode
  }

  /**
   * Checks if the Planning Agent is currently busy processing a request
   */
  isBusy(): boolean {
    return this.isExecuting || this.requestQueue.length > 0;
  }

  /**
   * Stops the Planning Agent
   */
  stop(): void {
    console.log('[PlanningAgent] Stopping...');

    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      setTimeout(() => {
        if (this.currentProcess) {
          this.currentProcess.kill('SIGKILL');
          this.currentProcess = null;
        }
      }, 5000);
    }

    this.conversationHistory = [];
  }

  /**
   * Restarts the Planning Agent (clears history in one-shot mode)
   */
  async restart(): Promise<void> {
    this.stop();
    this.conversationHistory = [];
    await this.start();
  }

  /**
   * Clears conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
    console.log('[PlanningAgent] Conversation history cleared');
  }

  /**
   * Requests a redistribution plan when execution is stuck
   * This happens when tasks fail and other tasks are blocked
   */
  async requestRedistribution(context: RedistributionContext): Promise<void> {
    const completedSection = context.completedWork.length > 0
      ? `## Completed Work (DO NOT REDO - these are done)\n${context.completedWork.map(w =>
          `- Task #${w.index} [${w.task.project}]: ${w.task.name}\n  Status: ${w.status}`
        ).join('\n')}`
      : '## Completed Work\nNo tasks completed yet.';

    const failedSection = context.failedWork.length > 0
      ? `## Failed Work (NEEDS FIXING)\n${context.failedWork.map(w =>
          `- Task #${w.index} [${w.task.project}]: ${w.task.name}\n  Error: ${w.error || 'Unknown error'}\n  Original task: ${w.task.task.slice(0, 200)}...`
        ).join('\n\n')}`
      : '## Failed Work\nNo tasks failed.';

    const pendingSection = context.pendingWork.length > 0
      ? `## Pending Work (BLOCKED)\n${context.pendingWork.map(w =>
          `- Task #${w.index} [${w.task.project}]: ${w.task.name}\n  Blocked by tasks: ${w.blockedBy?.join(', ') || 'unknown'}`
        ).join('\n')}`
      : '## Pending Work\nNo tasks pending.';

    const prompt = `# EXECUTION STUCK - REDISTRIBUTION NEEDED

The current execution is STUCK and cannot continue. Please analyze and create a NEW plan.

## Original Feature
${context.feature}

${completedSection}

${failedSection}

${pendingSection}

## Your Task

1. **EXPLORE** the current state of the codebase to see what was actually implemented
   - Check the projects to see what code exists
   - Look at error logs, build output, etc.

2. **ANALYZE** why tasks failed
   - Check build errors, missing dependencies, incorrect code
   - Understand what went wrong

3. **CREATE A NEW PLAN** that:
   - Does NOT redo completed work (assume it's correct)
   - Fixes the issues in failed tasks (create new fix tasks)
   - May reorganize pending tasks if dependencies changed
   - May add new tasks to address discovered issues

4. **Use the same JSON format** as before with task indices

IMPORTANT:
- Task indices in the new plan start fresh (0, 1, 2...) - don't reference old indices
- If a completed task is broken, create a FIX task that patches it
- Be specific about what went wrong and how to fix it

Start by exploring the current state, then create the new plan.`;

    await this.sendChat(prompt, PlanningAgentManager.TIMEOUTS.PLAN_CREATION);
  }
}
