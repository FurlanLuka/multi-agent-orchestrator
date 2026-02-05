import { EventEmitter } from 'events';
import { PlanningAgentManager } from './planning-agent-manager';
import { ChatEvent, ChatStreamEvent, PlanningAction, PlanningStatusEvent, AnalysisResultEvent, RequestFlow, FlowStep, FlowStatus, ExplorationAnalysisResult, SessionProjectConfig, DeploymentState } from '@orchy/types';
import { parseMarkedResponse, MARKERS } from './response-parser';

interface ChatMessage {
  id: string;
  from: 'user' | 'planning' | 'system';
  message: string;
  timestamp: number;
}

export class ChatHandler extends EventEmitter {
  private planningAgent: PlanningAgentManager;
  private history: ChatMessage[] = [];
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

    // Forward planning status events for UX feedback
    this.planningAgent.on('planningStatus', (event: PlanningStatusEvent) => {
      this.emit('planningStatus', event);
    });

    // Forward analysis result events for structured results display
    this.planningAgent.on('analysisResult', (event: AnalysisResultEvent) => {
      this.emit('analysisResult', event);
    });

    // Forward flow events for 2-phase planning UI
    this.planningAgent.on('flowStart', (flow: RequestFlow) => {
      this.emit('flowStart', flow);
    });

    this.planningAgent.on('flowStep', (data: { flowId: string; step: FlowStep }) => {
      this.emit('flowStep', data);
    });

    this.planningAgent.on('flowComplete', (data: { flowId: string; status: FlowStatus; result?: { passed: boolean; summary?: string; details?: string }; timestamp: number }) => {
      this.emit('flowComplete', data);
    });

    // Forward exploration result for session persistence
    this.planningAgent.on('explorationComplete', (result: ExplorationAnalysisResult) => {
      this.emit('explorationComplete', result);
    });
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
      const response = await this.planningAgent.sendChat(message);

      // Check for action marker using unified parser
      const actionParsed = parseMarkedResponse<PlanningAction>(response, MARKERS.ACTION, ['type']);
      if (actionParsed.success && actionParsed.data) {
        console.log('[ChatHandler] User-requested action detected:', actionParsed.data.type);
        this.emit('userAction', actionParsed.data);
      } else if (response.includes('[ACTION]')) {
        console.error('[ChatHandler] Failed to parse action JSON:', actionParsed.error);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.addMessage('system', `Error: ${error.message}`);
    }
  }

  /**
   * Requests a plan for a feature using the new multi-stage planning workflow
   * @param feature Feature description
   * @param projects List of project names
   * @param projectPaths Map of project names to paths
   * @param sessionProjectConfigs Optional session project configs for read-only/design-enabled settings
   */
  async requestPlan(
    feature: string,
    projects: string[],
    projectPaths?: Record<string, string>,
    sessionProjectConfigs?: SessionProjectConfig[]
  ): Promise<void> {
    this.addMessage('user', `Create a plan for: ${feature}`);
    this.addMessage('system', `Starting multi-stage planning workflow for projects: ${projects.join(', ')}...`);

    try {
      // Use the new 6-stage planning workflow
      await this.planningAgent.startPlanningWorkflow(feature, projects, projectPaths, sessionProjectConfigs);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.addMessage('system', `Error in planning workflow: ${error.message}`);
    }
  }

  /**
   * Requests a deployment plan from the planning agent.
   */
  async requestDeploymentPlan(
    description: string,
    provider: string,
    projects: string[],
    projectPaths?: Record<string, string>,
    existingDeployment?: DeploymentState
  ): Promise<void> {
    this.addMessage('user', `Create deployment plan: ${description}`);
    this.addMessage('system', `Starting deployment planning for ${provider}...`);

    try {
      await this.planningAgent.startDeploymentWorkflow(
        description, provider, projects, projectPaths, existingDeployment
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.addMessage('system', `Error in deployment planning: ${error.message}`);
    }
  }

  /**
   * Requests E2E prompt for a project
   */
  async requestE2EPrompt(project: string, taskSummary: string, testScenarios: string[], devServerUrl?: string, passedCount?: number): Promise<string> {
    const skippedNote = passedCount && passedCount > 0 ? ` (${passedCount} already passed, skipped)` : '';
    this.addMessage('system', `Generating E2E test prompt for ${project}...${skippedNote}`);

    try {
      return await this.planningAgent.requestE2EPrompt({ project, taskSummary, testScenarios, devServerUrl, passedCount });
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
    isInfrastructureFailure?: boolean;  // If true, go straight to FATAL - not fixable by code
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

  /**
   * Checks if Planning Agent is currently busy processing a request
   */
  isBusy(): boolean {
    return this.planningAgent.isBusy();
  }
}
