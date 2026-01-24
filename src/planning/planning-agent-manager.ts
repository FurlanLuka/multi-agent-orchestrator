import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { Plan, E2EPromptRequest, ContentBlock, ChatStreamEvent, RedistributionContext, TaskVerificationContext, TaskAnalysisResult } from '../types';

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
  devServer: {
    command: string;
    readyPattern: string;
    env: Record<string, string>;
  };
  hasE2E: boolean;
}

export class PlanningAgentManager extends EventEmitter {
  private orchestratorDir: string;
  private conversationHistory: ConversationMessage[] = [];
  private currentProcess: ChildProcess | null = null;
  private readonly MAX_HISTORY = 10; // Keep last 10 exchanges for context
  private projectConfig: Record<string, ProjectConfig> = {};

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

IMPORTANT: The user might ask about features like "comments", "authentication", etc. These features exist in the PROJECT codebases, not in the orchestrator. Always look in the registered project directories.`;

    if (this.conversationHistory.length === 0) {
      return `${systemPrompt}

${newMessage}`;
    }

    // Include recent conversation history for context
    const recentHistory = this.conversationHistory.slice(-this.MAX_HISTORY);
    const historyText = recentHistory
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    return `${systemPrompt}

Previous conversation:
${historyText}

User: ${newMessage}`;
  }

  /**
   * Executes a one-shot Claude call and returns the result
   * Uses spawn with streaming output parsing
   */
  private async executeOneShot(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log(`[PlanningAgent] Executing one-shot (prompt: ${prompt.length} chars)`);

      // Use full path to ensure claude is found
      const claudePath = process.env.HOME + '/.local/bin/claude';
      console.log('[PlanningAgent] Using claude at:', claudePath);
      console.log('[PlanningAgent] CWD:', this.orchestratorDir);

      const proc = spawn(claudePath, [
        '-p', prompt,
        '--output-format', 'stream-json',
        '--verbose',
        '--dangerously-skip-permissions',
        '--no-session-persistence'
      ], {
        cwd: this.orchestratorDir,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe']  // ignore stdin, pipe stdout/stderr
      });

      this.currentProcess = proc;
      console.log('[PlanningAgent] Process spawned, PID:', proc.pid);

      let responseBuffer = '';
      let resultText = '';
      let lineCount = 0;
      let partialLine = ''; // Buffer for incomplete lines
      const contentBlocks: ContentBlock[] = []; // Collect all content blocks for persistence

      // Generate unique message ID for this response
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Emit message start for streaming UI
      const startEvent: ChatStreamEvent = {
        type: 'message_start',
        messageId
      };
      this.emit('stream', startEvent);

      // Process stdout data as it arrives
      proc.stdout.on('data', (chunk: Buffer) => {
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
                    } else if (block.type === 'tool_use' && block.id && block.name) {
                      contentBlock = {
                        type: 'tool_use',
                        id: block.id,
                        name: block.name,
                        input: block.input || {}
                      };
                    } else if (block.type === 'tool_result' && block.tool_use_id) {
                      contentBlock = {
                        type: 'tool_result',
                        tool_use_id: block.tool_use_id,
                        content: block.content || '',
                        is_error: block.is_error
                      };
                    } else if (block.type === 'thinking' && block.thinking) {
                      contentBlock = { type: 'thinking', thinking: block.thinking };
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

      proc.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        console.error('[PlanningAgent] STDERR:', text.substring(0, 200));
      });

      proc.on('error', (err) => {
        console.error('[PlanningAgent] Process error:', err);
        this.currentProcess = null;
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

          // Also emit legacy chat event for backwards compatibility
          if (finalResult.trim()) {
            this.emit('chat', finalResult);
          }
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
          console.error('[PlanningAgent] Timeout - killing process');
          this.currentProcess.kill('SIGKILL');
          this.currentProcess = null;
          reject(new Error('Planning Agent timeout'));
        }
      }, 300000); // 5 minute timeout for complex tasks

      proc.on('exit', () => clearTimeout(timeout));
    });
  }

  /**
   * Handles output and extracts plans
   */
  private processOutput(output: string): void {
    // Check for plan JSON in output
    const planMatch = output.match(/```json\s*(\{[\s\S]*?"feature"[\s\S]*?"tasks"[\s\S]*?\})\s*```/);
    if (planMatch) {
      try {
        const plan: Plan = JSON.parse(planMatch[1]);
        console.log('[PlanningAgent] Detected plan proposal');
        this.emit('planProposal', plan);
      } catch (err) {
        console.error('[PlanningAgent] Failed to parse plan JSON:', err);
      }
    }
  }

  /**
   * Sends a chat message and waits for response
   */
  async sendChat(message: string): Promise<string> {
    console.log(`[PlanningAgent] Sending: ${message.substring(0, 100)}...`);

    // Build prompt with context BEFORE adding to history (to avoid duplication)
    const contextPrompt = this.buildContextPrompt(message);

    // Add user message to history AFTER building prompt
    this.conversationHistory.push({ role: 'user', content: message });

    try {
      // Execute one-shot
      const result = await this.executeOneShot(contextPrompt);

      // Add assistant response to history
      this.conversationHistory.push({ role: 'assistant', content: result });

      // Trim history if too long
      if (this.conversationHistory.length > this.MAX_HISTORY * 2) {
        this.conversationHistory = this.conversationHistory.slice(-this.MAX_HISTORY * 2);
      }

      return result;
    } catch (err) {
      console.error('[PlanningAgent] Error in sendChat:', err);
      throw err;
    }
  }

  /**
   * Requests the Planning Agent to create a plan for a feature
   */
  async requestPlan(feature: string, projects: string[], projectPaths?: Record<string, string>): Promise<void> {
    // Build project paths info if available
    let projectInfo = `Available projects: ${projects.join(', ')}`;
    if (projectPaths) {
      const pathList = projects.map(p => `- ${p}: ${projectPaths[p] || 'unknown'}`).join('\n');
      projectInfo = `Available projects and their paths:\n${pathList}`;
    }

    // Identify projects with E2E testing disabled
    const projectsWithoutE2E = projects.filter(p => {
      const config = this.projectConfig[p];
      return config && config.hasE2E === false;
    });

    const e2eExclusionNote = projectsWithoutE2E.length > 0
      ? `\n\nE2E TESTING EXCLUSIONS:
The following projects have E2E testing DISABLED (hasE2E: false in config):
${projectsWithoutE2E.map(p => `- ${p}`).join('\n')}

DO NOT include these projects in the "testPlan" section. Only include projects that have E2E testing enabled.`
      : '';

    const prompt = `Create a detailed implementation plan for this feature:

Feature: ${feature}

${projectInfo}${e2eExclusionNote}

IMPORTANT: Before creating the plan, you MUST:
1. Read projects.config.json to understand project configurations
2. Explore each project directory to understand its structure:
   - Read package.json to see dependencies and scripts
   - Look at the src/ directory structure
   - Check for existing patterns, components, services, etc.
   - Review any existing .claude/skills/ files for context
3. Based on your exploration, create tasks that fit the existing codebase patterns

CRITICAL RULES FOR TASKS:
- Tasks should be IMPLEMENTATION ONLY - write the actual feature code
- DO NOT include any unit tests, Jest tests, or test file creation in tasks
- DO NOT tell agents to "write tests" or "add test coverage"
- DO NOT tell agents to start dev servers, run npm start, or run npm run dev - the orchestrator already manages dev servers
- Testing is handled SEPARATELY via E2E testing after implementation completes
- The "testPlan" section is for E2E test scenarios only (run via Playwright), NOT unit tests
- DO NOT include projects with hasE2E: false in the testPlan section

After exploring, create a plan in this JSON format:
\`\`\`json
{
  "feature": "Feature name",
  "description": "Brief description",
  "tasks": [
    {
      "project": "backend",
      "name": "Auth API",
      "task": "Create /auth/register and /auth/login endpoints...",
      "dependencies": []
    },
    {
      "project": "backend",
      "name": "User API",
      "task": "Add /users/profile endpoint with auth middleware...",
      "dependencies": [0]
    },
    {
      "project": "frontend",
      "name": "Auth components",
      "task": "Create LoginForm and RegisterForm components...",
      "dependencies": []
    },
    {
      "project": "frontend",
      "name": "API integration",
      "task": "Connect auth forms to backend API...",
      "dependencies": [0, 2]
    }
  ],
  "testPlan": {
    "backend": ["Register new user returns 201", "Login returns JWT token"],
    "frontend": ["User can register and login", "Profile page shows user data"]
  }
}
\`\`\`

TASK FORMAT RULES:
- "name": Short, action-oriented title (3-6 words) shown in collapsed view
- "task": Full detailed description with markdown formatting, file paths, and implementation details
- "dependencies": Array of TASK INDICES (numbers, not names) that THIS task depends on
  - Example: [0, 2] means this task depends on tasks at index 0 and 2
  - Tasks with empty dependencies [] start immediately in parallel
  - Use dependencies when a task needs another task's output (e.g., frontend needs backend API)

E2E TESTING:
- E2E tests run automatically AFTER all tasks for a project complete
- E2E tests for dependent projects (e.g., frontend) wait for dependency projects (e.g., backend) to complete E2E first
- testPlan defines what scenarios to test for each project

Start by exploring the project directories, then create the plan.`;

    await this.sendChat(prompt);
  }

  /**
   * Requests E2E test prompt for a project
   */
  async requestE2EPrompt(request: E2EPromptRequest): Promise<string> {
    const prompt = `Project "${request.project}" has completed its task and is ready for E2E testing.

Task completed: ${request.taskSummary}

Dev server URL: ${request.devServerUrl || 'http://localhost:5173'}

Test scenarios to verify:
${request.testScenarios.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Generate an E2E test prompt that instructs the agent to:

**CRITICAL RULES - THE AGENT MUST FOLLOW THESE:**
- DO NOT start, build, or restart any servers - the orchestrator manages all servers
- DO NOT run npm install, npm run build, npm run dev, or similar commands
- The dev server is ALREADY RUNNING at the URL above - just run tests against it
- If the server is not responding, FAIL the tests and report the error - DO NOT try to fix it
- The agent's ONLY job is to run E2E tests and report results

1. READ the project's E2E testing skill at: ~/${request.project}/.claude/skills/e2e-testing.md
   - This skill contains project-specific testing instructions (Playwright MCP for frontend, curl for backend, etc.)
   - Follow the testing methodology described in that skill file

2. OUTPUT TEST STATUS MARKERS for real-time UI tracking. For EACH test scenario:
   - Before running: [TEST_STATUS] {"scenario": "exact scenario text from list above", "status": "running"}
   - After passing: [TEST_STATUS] {"scenario": "exact scenario text from list above", "status": "passed"}
   - After failing: [TEST_STATUS] {"scenario": "exact scenario text from list above", "status": "failed", "error": "brief error message"}

3. If required tools are NOT AVAILABLE (e.g., Playwright MCP tools for frontend):
   - DO NOT attempt to analyze code as a workaround
   - Immediately fail all tests with error explaining the missing tools
   - Output: [TEST_STATUS] {"scenario": "ALL", "status": "failed", "error": "Required testing tools not available"}

4. If the server is NOT RESPONDING:
   - DO NOT try to start or fix the server
   - Immediately fail all tests with error explaining the server is not available
   - Output: [TEST_STATUS] {"scenario": "ALL", "status": "failed", "error": "Dev server not responding at ${request.devServerUrl || 'http://localhost:5173'}"}

5. If ANY tests fail, ANALYZE the codebase to understand WHY:
   - Trace the failing scenario to the relevant code
   - Identify what the code is trying to do and where it fails
   - Determine if the issue is in THIS project or another

6. Return a structured response at the END:

\`\`\`json
{
  "allPassed": true/false,
  "failures": [
    {
      "test": "test name",
      "error": "actual error message",
      "codeAnalysis": "What I found: ComponentX.tsx:45 calls POST /api/endpoint which returns 404",
      "suspectedProject": "frontend" | "backend" | "both" | "this"
    }
  ],
  "overallAnalysis": "Summary of what went wrong and which project(s) likely need fixes"
}
\`\`\`

Output the E2E prompt that should be sent to the agent.`;

    return await this.sendChat(prompt);
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

    return await this.sendChat(prompt);
  }

  /**
   * Analyzes task execution results to determine if task completed successfully.
   * Uses intelligent analysis of build output, dev server logs, and health check.
   * Returns pass/fail decision with context-aware fix prompt if needed.
   */
  async analyzeTaskResult(context: TaskVerificationContext): Promise<TaskAnalysisResult> {
    const prompt = `## TASK VERIFICATION ANALYSIS

You are analyzing whether a task completed successfully. Review ALL the context below and make an intelligent decision.

**Project:** ${context.project}
**Task:** ${context.taskName}

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
` : '**BUILD:** No build command configured'}

---
**DEV SERVER LOGS (recent):**
\`\`\`
${context.devServerLogs ? context.devServerLogs.slice(-3000) : 'No logs available'}
\`\`\`

---
**HEALTH CHECK:** ${context.healthCheck?.healthy ? '✅ PASSED - Server responding' : `❌ FAILED: ${context.healthCheck?.error || 'Unknown error'}`}

---

## YOUR ANALYSIS

Consider carefully:
1. **Build errors**: Type errors, missing imports, syntax errors, compilation failures
2. **Runtime errors**: Check dev server logs for crashes, Prisma errors, module not found, unhandled exceptions
3. **Health check context**: Is it failing due to code issues or just timing? Check if dev server logs show the app started successfully
4. **Hidden issues**: Warnings that might cause problems, deprecated APIs, potential runtime issues

Be intelligent - a passing build with runtime errors in logs should FAIL. A health check that fails but logs show app running might just need more time.

**RESPOND WITH ONLY THIS JSON (no other text):**
{
  "passed": true or false,
  "analysis": "1-2 sentence explanation of what you found",
  "fixPrompt": "If failed: detailed, specific instructions for the agent to fix the issue. Include file names, line numbers from errors, and exact steps. If passed: omit this field.",
  "suggestedAction": "retry" or "escalate" or "skip"
}`;

    console.log(`[PlanningAgent] Analyzing task result for ${context.project}:${context.taskName}`);

    try {
      const response = await this.sendChat(prompt);

      // Parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*?"passed"\s*:[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]) as TaskAnalysisResult;
          console.log(`[PlanningAgent] Analysis result: passed=${result.passed}, action=${result.suggestedAction}`);
          return result;
        } catch (parseErr) {
          console.error('[PlanningAgent] Failed to parse analysis JSON:', parseErr);
        }
      }

      // Fallback: if we can't parse, assume failure and use raw response as fix prompt
      console.log('[PlanningAgent] Could not parse structured response, using fallback');
      return {
        passed: false,
        analysis: 'Failed to parse analysis response - treating as failure',
        fixPrompt: response,
        suggestedAction: 'retry'
      };
    } catch (err) {
      console.error('[PlanningAgent] Error analyzing task result:', err);
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

IMPORTANT: Return ONLY the JSON object, no other text.`;

    try {
      const result = await this.sendChat(prompt);

      // Extract JSON from response
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

    // Try to extract the agent's self-analysis JSON from the output
    const agentAnalysisMatch = e2eOutput.match(/```json\s*(\{[\s\S]*?"allPassed"[\s\S]*?\})\s*```/);
    const agentAnalysisSection = agentAnalysisMatch
      ? `\nAgent's Self-Analysis (the agent analyzed its own codebase):
\`\`\`json
${agentAnalysisMatch[1]}
\`\`\`
This analysis was done BY the agent that ran the tests - it traced failures through its own code.
Use this to make informed decisions about which project(s) need fixes.
`
      : '';

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
   - "backend" or "this" (if this is backend) → send fix to backend
   - "frontend" or "this" (if this is frontend) → send fix to frontend
   - "both" → send coordinated fixes to both
${projectList}

IMPORTANT: Respond with ONLY a JSON object in this exact format:
{
  "passed": true or false,
  "analysis": "Brief summary of test results",
  "fixes": [
    { "project": "project_name", "prompt": "Specific fix instructions for this project" }
  ]
}

The "fixes" array should contain an entry for EACH project that needs changes. Use the agent's codeAnalysis to provide specific, actionable fix instructions.`;

    try {
      const result = await this.sendChat(prompt);

      // Extract JSON from response - handle nested objects with fixes array
      const jsonMatch = result.match(/\{[\s\S]*?"passed"\s*:\s*(true|false)[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);

          // Handle new format with fixes array
          if (parsed.fixes && Array.isArray(parsed.fixes)) {
            return {
              passed: !!parsed.passed,
              analysis: parsed.analysis || 'No analysis provided',
              fixes: parsed.fixes.filter((f: any) => f.project && f.prompt)
            };
          }

          // Legacy format with fixPrompt
          return {
            passed: !!parsed.passed,
            analysis: parsed.analysis || 'No analysis provided',
            fixPrompt: parsed.fixPrompt
          };
        } catch {
          // Fall through to default
        }
      }

      // If we can't parse, assume failure and use the raw response
      console.warn('[PlanningAgent] Could not parse E2E analysis JSON, checking for failure patterns');
      const hasFailure = /fail|error|assert|timeout|expected/i.test(e2eOutput);
      const testsNotExecuted = /not executed|weren't executed|weren't run|not run|no tests ran|mcp.*unavailable|playwright.*not.*installed|cannot.*run.*tests/i.test(e2eOutput);

      // If tests weren't executed at all, that's a failure
      if (testsNotExecuted) {
        return {
          passed: false,
          analysis: 'E2E tests were NOT executed - infrastructure issue (missing Playwright MCP or similar)',
          fixPrompt: 'E2E tests could not be executed. Ensure Playwright MCP tools are available and properly configured.'
        };
      }

      return {
        passed: !hasFailure,
        analysis: result.slice(0, 500),
        fixPrompt: hasFailure ? result : undefined
      };
    } catch (err) {
      console.error('[PlanningAgent] Error analyzing E2E result:', err);
      // On error, check output for obvious failures
      const hasFailure = /fail|error|assert|timeout|expected/i.test(e2eOutput);
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
    return this.currentProcess !== null;
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

    await this.sendChat(prompt);
  }
}
