import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { Plan, E2EPromptRequest } from '../types';

interface StreamJsonMessage {
  type: 'system' | 'assistant' | 'result' | 'error';
  subtype?: string;
  message?: {
    content?: Array<{ type: string; text?: string }>;
  };
  result?: string;
  is_error?: boolean;
}

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class PlanningAgentManager extends EventEmitter {
  private orchestratorDir: string;
  private conversationHistory: ConversationMessage[] = [];
  private currentProcess: ChildProcess | null = null;
  private readonly MAX_HISTORY = 10; // Keep last 10 exchanges for context

  constructor(orchestratorDir: string) {
    super();
    this.orchestratorDir = orchestratorDir;
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
    const systemPrompt = `You are the Planning Agent for a multi-agent orchestrator system.
Your role is to:
- Create detailed implementation plans for features
- Coordinate work between multiple project agents
- Analyze events and decide on actions
- Help debug issues when agents encounter errors

You have access to all Claude tools (Bash, Read, Edit, etc.) to explore codebases and gather information.`;

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
        '--dangerously-skip-permissions'
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
                // Extract text content from assistant message
                if (msg.message?.content) {
                  for (const block of msg.message.content) {
                    if (block.type === 'text' && block.text) {
                      responseBuffer += block.text;
                      this.emit('output', block.text);
                      // Note: Chat emission moved to exit handler to emit complete response
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
          // Emit complete response as single chat message
          if (finalResult.trim()) {
            this.emit('chat', finalResult);
          }
          resolve(finalResult);
        } else {
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

    const prompt = `Create a detailed implementation plan for this feature:

Feature: ${feature}

${projectInfo}

IMPORTANT: Before creating the plan, you MUST:
1. Read projects.config.json to understand project configurations
2. Explore each project directory to understand its structure:
   - Read package.json to see dependencies and scripts
   - Look at the src/ directory structure
   - Check for existing patterns, components, services, etc.
   - Review any existing .claude/skills/ files for context
3. Based on your exploration, create tasks that fit the existing codebase patterns

After exploring, create a plan in this JSON format:
\`\`\`json
{
  "feature": "Feature name",
  "description": "Brief description",
  "tasks": [
    {
      "project": "project_name",
      "task": "Detailed task description for the agent that references specific files/patterns found",
      "dependencies": []
    }
  ],
  "testPlan": {
    "project_name": ["Test scenario 1", "Test scenario 2"]
  }
}
\`\`\`

Start by exploring the project directories, then create the plan.`;

    await this.sendChat(prompt);
  }

  /**
   * Requests E2E test prompt for a project
   */
  async requestE2EPrompt(request: E2EPromptRequest): Promise<string> {
    const prompt = `Project "${request.project}" has completed its task and is ready for E2E testing.

Task completed: ${request.taskSummary}

Test scenarios to verify:
${request.testScenarios.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Please read the project's E2E testing skill at:
~/${request.project}/.claude/skills/e2e-testing.md

Then generate a specific E2E test prompt that:
1. Uses the project's testing framework and conventions
2. Tests all the scenarios listed above
3. Includes clear pass/fail criteria

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
   * Checks if the Planning Agent is running (always true in one-shot mode)
   */
  isRunning(): boolean {
    return true; // Always ready in one-shot mode
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
}
