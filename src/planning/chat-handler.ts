import { EventEmitter } from 'events';
import { PlanningAgentManager } from './planning-agent-manager';
import { Plan, ChatEvent, ChatStreamEvent } from '../types';

interface ChatMessage {
  id: string;
  from: 'user' | 'planning' | 'system';
  message: string;
  timestamp: number;
}

export class ChatHandler extends EventEmitter {
  private planningAgent: PlanningAgentManager;
  private history: ChatMessage[] = [];
  private pendingPlan: Plan | null = null;
  private readonly MAX_HISTORY = 100;

  constructor(planningAgent: PlanningAgentManager) {
    super();
    this.planningAgent = planningAgent;
    this.setupListeners();
  }

  /**
   * Sets up listeners for Planning Agent events
   */
  private setupListeners(): void {
    // Handle chat output from Planning Agent (streaming)
    this.planningAgent.on('chat', (message: string) => {
      this.addMessage('planning', message);
    });

    // Handle plan proposals
    this.planningAgent.on('planProposal', (plan: Plan) => {
      this.pendingPlan = plan;
      this.emit('planProposal', { plan, summary: this.generatePlanSummary(plan) });

      // Also add as chat message
      this.addMessage('planning', `I've created a plan for "${plan.feature}". Please review and approve.`);
    });

    // Handle raw output for detailed logging
    this.planningAgent.on('output', (text: string) => {
      this.emit('rawOutput', text);
    });

    // Handle errors
    this.planningAgent.on('error', (error: Error) => {
      this.addMessage('system', `Planning Agent error: ${error.message}`);
    });

    // Forward streaming events for agentic UI
    this.planningAgent.on('stream', (event: ChatStreamEvent) => {
      this.emit('stream', event);
    });
  }

  /**
   * Generates a human-readable summary of a plan
   */
  private generatePlanSummary(plan: Plan): string {
    const taskCount = plan.tasks.length;
    const projects = [...new Set(plan.tasks.map(t => t.project))];
    const testCount = Object.values(plan.testPlan).flat().length;

    return `Plan: ${plan.feature}
- ${taskCount} tasks across ${projects.length} projects (${projects.join(', ')})
- ${testCount} test scenarios defined
- ${plan.description}`;
  }

  /**
   * Adds a message to history and emits event
   */
  private addMessage(from: 'user' | 'planning' | 'system', message: string): void {
    const chatMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      from,
      message,
      timestamp: Date.now()
    };

    this.history.push(chatMessage);

    // Trim history if too long
    if (this.history.length > this.MAX_HISTORY) {
      this.history = this.history.slice(-this.MAX_HISTORY);
    }

    // Emit for UI
    this.emit('message', chatMessage);

    // Also emit as ChatEvent for compatibility
    const event: ChatEvent = {
      from: from === 'system' ? 'planning' : from,
      message,
      timestamp: chatMessage.timestamp
    };
    this.emit('chat', event);
  }

  /**
   * Handles a user chat message
   */
  async handleUserMessage(message: string): Promise<void> {
    // Add to history
    this.addMessage('user', message);

    // Send to Planning Agent (now async)
    try {
      await this.planningAgent.sendChat(message);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.addMessage('system', `Error: ${error.message}`);
    }
  }

  /**
   * Requests a plan for a feature
   */
  async requestPlan(feature: string, projects: string[], projectPaths?: Record<string, string>): Promise<void> {
    this.addMessage('user', `Create a plan for: ${feature}`);
    this.addMessage('system', `Analyzing feature request for projects: ${projects.join(', ')}...`);
    this.addMessage('system', `Exploring project directories to understand codebase structure...`);

    try {
      await this.planningAgent.requestPlan(feature, projects, projectPaths);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.addMessage('system', `Error creating plan: ${error.message}`);
    }
  }

  /**
   * Gets the pending plan (if any)
   */
  getPendingPlan(): Plan | null {
    return this.pendingPlan;
  }

  /**
   * Approves the pending plan
   */
  approvePlan(): Plan | null {
    const plan = this.pendingPlan;
    if (plan) {
      this.addMessage('user', 'Plan approved! Starting execution...');
      this.pendingPlan = null;
      this.emit('planApproved', plan);
    }
    return plan;
  }

  /**
   * Rejects the pending plan with feedback
   */
  async rejectPlan(feedback: string): Promise<void> {
    if (this.pendingPlan) {
      this.addMessage('user', `Plan rejected. Feedback: ${feedback}`);
      this.pendingPlan = null;

      try {
        await this.planningAgent.sendChat(`The plan was rejected with feedback: ${feedback}. Please revise.`);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.addMessage('system', `Error: ${error.message}`);
      }
    }
  }

  /**
   * Requests E2E prompt for a project
   */
  async requestE2EPrompt(project: string, taskSummary: string, testScenarios: string[]): Promise<string> {
    this.addMessage('system', `Generating E2E test prompt for ${project}...`);

    try {
      return await this.planningAgent.requestE2EPrompt({ project, taskSummary, testScenarios });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.addMessage('system', `Error: ${error.message}`);
      return '';
    }
  }

  /**
   * Requests failure analysis
   */
  async requestFailureAnalysis(project: string, error: string, context: string[]): Promise<string> {
    this.addMessage('system', `Analyzing failure in ${project}...`);

    try {
      return await this.planningAgent.analyzeFailure(project, error, context);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.addMessage('system', `Error: ${e.message}`);
      return '';
    }
  }

  /**
   * Analyzes E2E test results and determines next steps
   * Can return fixes for multiple projects (e.g., frontend E2E fails due to backend issue)
   */
  async analyzeE2EResult(project: string, e2eOutput: string, testScenarios: string[], devServerLogs?: string, allProjects?: string[]): Promise<{
    passed: boolean;
    analysis: string;
    fixPrompt?: string;  // Legacy: fix for originating project
    fixes?: Array<{ project: string; prompt: string }>;  // New: targeted fixes per project
  }> {
    this.addMessage('system', `Analyzing E2E test results for ${project}...`);

    try {
      const result = await this.planningAgent.analyzeE2EResult(project, e2eOutput, testScenarios, devServerLogs, allProjects);

      if (result.passed) {
        this.addMessage('system', `✓ E2E tests passed for ${project}: ${result.analysis}`);
      } else {
        const fixTargets = result.fixes?.map(f => f.project).join(', ') || project;
        this.addMessage('system', `✗ E2E tests failed for ${project}: ${result.analysis}. Fixes needed in: ${fixTargets}`);
      }

      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.addMessage('system', `Error analyzing E2E results: ${e.message}`);
      return {
        passed: false,
        analysis: 'Could not analyze E2E results',
        fixPrompt: 'Please review the test output and fix any issues.'
      };
    }
  }

  /**
   * Gets chat history
   */
  getHistory(limit: number = 50): ChatMessage[] {
    return this.history.slice(-limit);
  }

  /**
   * Clears chat history
   */
  clearHistory(): void {
    this.history = [];
    this.pendingPlan = null;
    this.planningAgent.clearHistory();
  }

  /**
   * Adds a system message
   */
  systemMessage(message: string): void {
    this.addMessage('system', message);
  }

  /**
   * Checks if Planning Agent is ready (always true in one-shot mode)
   */
  isReady(): boolean {
    return this.planningAgent.isRunning();
  }
}
