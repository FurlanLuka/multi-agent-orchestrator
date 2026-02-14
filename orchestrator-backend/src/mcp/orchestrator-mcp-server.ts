import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TaskCompleteRequest, TaskCompleteResponse, Plan, UserInputResponse } from '@orchy/types';

/**
 * Dependencies injected from the Express server.
 * These mirror the callbacks used by the HTTP endpoints in server.ts.
 */
export interface OrchestratorMcpDeps {
  onPermissionPrompt: (project: string, toolName: string, toolInput: Record<string, unknown>) => Promise<string>;
  onTaskComplete: (request: TaskCompleteRequest) => Promise<TaskCompleteResponse>;
  onPlanApproval: (plan: Plan) => Promise<{ status: 'approved' } | { status: 'refine'; feedback: string }>;
  onPlanningQuestions: (project: string, questions: Array<{ question: string; context?: string; type?: string; options?: string[] }>) => Promise<string>;
  onUserInput: (project: string, inputs: any[]) => Promise<{ isConfirmation: boolean; isGitHubSecret: boolean; response: any }>;
  onExplorationComplete: (project: string, summary: string) => Promise<string>;
  onSubmitRefinedFeature: (refinedDescription: string, keyRequirements: string[]) => Promise<any>;
  onSubmitTechnicalSpec: (apiContracts: any[], architectureDecisions: string[], executionOrder: any[]) => Promise<any>;
  onCheckDeploymentAvailable: (project: string) => any;
  onListDeploymentProviders: () => any;
  onGetProviderRequirements: (providerId: string) => any;
  onSaveDeploymentState: (state: any) => any;
}

/**
 * Creates a configured McpServer for orchestrator tools.
 * The returned server has all 12 tools registered, with handlers
 * that call the injected deps directly (no HTTP round-trip).
 */
export function createOrchestratorMcpServer(
  deps: OrchestratorMcpDeps,
  project: string,
  serverName: string = 'orchestrator-permission'
): McpServer {
  const server = new McpServer({
    name: serverName,
    version: '1.0.0',
  });

  // Tool 1: orchestrator_permission
  server.registerTool(
    'orchestrator_permission',
    {
      description: 'Handle permission prompts by forwarding to orchestrator UI',
      inputSchema: {
        tool_name: z.string().describe('The tool requesting permission'),
        input: z.record(z.string(), z.unknown()).optional().describe('The tool input'),
      },
    },
    async ({ tool_name, input }) => {
      const toolInput = (input || {}) as Record<string, unknown>;
      const result = await deps.onPermissionPrompt(project, tool_name, toolInput);
      const response = result === 'allow'
        ? { behavior: 'allow', updatedInput: toolInput }
        : { behavior: 'deny', message: 'User denied permission via orchestrator UI' };
      return { content: [{ type: 'text' as const, text: JSON.stringify(response) }] };
    }
  );

  // Tool 2: ask_planning_question
  server.registerTool(
    'ask_planning_question',
    {
      description: 'Ask the user clarifying questions during planning. Use this when requirements are ambiguous, multiple valid approaches exist, or you need domain-specific information not in the code.',
      inputSchema: {
        questions: z.array(z.object({
          question: z.string().describe('The question to ask'),
          context: z.string().optional().describe('Why you need this information'),
          type: z.enum(['text', 'select_one', 'select_many']).optional().describe('Question type'),
          options: z.array(z.string()).optional().describe('Predefined options for select types'),
        })).describe('Array of questions to ask (shown one at a time)'),
      },
    },
    async ({ questions }) => {
      if (questions.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No questions provided' }] };
      }
      const answers = await deps.onPlanningQuestions(project, questions);
      return { content: [{ type: 'text' as const, text: answers }] };
    }
  );

  // Tool 3: task_complete
  server.registerTool(
    'task_complete',
    {
      description: 'Signal task completion and request verification. Call this after implementing each task.',
      inputSchema: {
        summary: z.string().describe('Brief summary of what was implemented'),
      },
    },
    async ({ summary }) => {
      const result = await deps.onTaskComplete({ project, taskIndex: -1, summary });
      const resultJson = JSON.stringify(result);
      let responseText = resultJson;
      if (result.status === 'escalate') {
        responseText = `STOP: ${resultJson}\n\n**You must stop working immediately.** The orchestrator has escalated this task.`;
      } else if (result.status === 'all_complete') {
        responseText = `COMPLETE: ${resultJson}\n\n**All tasks are done.** Stop working.`;
      }
      return { content: [{ type: 'text' as const, text: responseText }] };
    }
  );

  // Tool 4: exploration_complete
  server.registerTool(
    'exploration_complete',
    {
      description: 'Signal that codebase exploration and Q&A is complete. Returns Phase 2 instructions.',
      inputSchema: {
        summary: z.string().describe('Summary of discoveries'),
      },
    },
    async ({ summary }) => {
      const phase2Prompt = await deps.onExplorationComplete(project, summary);
      return { content: [{ type: 'text' as const, text: phase2Prompt }] };
    }
  );

  // Tool 5: submit_plan_for_approval
  server.registerTool(
    'submit_plan_for_approval',
    {
      description: 'Submit the generated plan for user approval. Blocks until user approves or requests changes.',
      inputSchema: {
        plan: z.record(z.string(), z.unknown()).describe('The complete plan JSON to submit for approval'),
      },
    },
    async ({ plan }) => {
      const result = await deps.onPlanApproval(plan as unknown as Plan);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  // Tool 6: request_user_input
  server.registerTool(
    'request_user_input',
    {
      description: 'Request input from user, show a confirmation dialog, or set a GitHub Actions secret.',
      inputSchema: {
        inputs: z.array(z.object({
          type: z.enum(['input', 'confirmation', 'github_secret', 'install_cli']).optional().describe('Type of input'),
          name: z.string().optional().describe('Variable name or secret name'),
          label: z.string().describe('Display label or title'),
          description: z.string().optional().describe('Help text or detailed message'),
          sensitive: z.boolean().optional().describe('If true, mask input'),
          required: z.boolean().optional().describe('If true, user must provide a value'),
          repo: z.string().optional().describe('Repository in "owner/repo" format for github_secret'),
          installCommand: z.string().optional().describe('Shell command to install CLI'),
          verifyCommand: z.string().optional().describe('Command to verify installation'),
          installUrl: z.string().optional().describe('URL with installation instructions'),
        })).describe('Array of inputs to request'),
      },
    },
    async ({ inputs }) => {
      if (inputs.length === 0) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'No inputs specified' }) }] };
      }
      const result = await deps.onUserInput(project, inputs);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result.response) }] };
    }
  );

  // Tool 7: submit_refined_feature (Stage 1)
  server.registerTool(
    'submit_refined_feature',
    {
      description: 'Stage 1 completion: Submit refined feature after Socratic Q&A dialogue. Blocks until user approves or requests changes.',
      inputSchema: {
        refinedDescription: z.string().describe('The refined, clarified feature description after Q&A'),
        keyRequirements: z.array(z.string()).describe('Key requirements extracted from the dialogue'),
      },
    },
    async ({ refinedDescription, keyRequirements }) => {
      const result = await deps.onSubmitRefinedFeature(refinedDescription, keyRequirements);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  // Tool 8: submit_technical_spec (Stage 2)
  server.registerTool(
    'submit_technical_spec',
    {
      description: 'Submit API contracts and architecture after project exploration. Blocks until user approves or requests changes.',
      inputSchema: {
        apiContracts: z.array(z.object({
          endpoint: z.string(),
          method: z.string(),
          request: z.record(z.string(), z.unknown()).optional(),
          response: z.record(z.string(), z.unknown()).optional(),
          providedBy: z.string(),
          consumedBy: z.array(z.string()).optional(),
        })).describe('API contracts between projects'),
        architectureDecisions: z.array(z.string()).optional().describe('Key architecture decisions'),
        executionOrder: z.array(z.object({
          project: z.string(),
          dependsOn: z.array(z.string()),
        })).describe('Project execution order with dependencies'),
      },
    },
    async ({ apiContracts, architectureDecisions, executionOrder }) => {
      const result = await deps.onSubmitTechnicalSpec(apiContracts, architectureDecisions || [], executionOrder);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  // Tool 9: check_deployment_available
  server.registerTool(
    'check_deployment_available',
    {
      description: 'Check if deployment is available for the current workspace.',
    },
    async () => {
      const result = deps.onCheckDeploymentAvailable(project);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  // Tool 10: list_deployment_providers
  server.registerTool(
    'list_deployment_providers',
    {
      description: 'List all available deployment providers.',
    },
    async () => {
      const result = deps.onListDeploymentProviders();
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  // Tool 11: get_provider_requirements
  server.registerTool(
    'get_provider_requirements',
    {
      description: 'Get detailed requirements for a specific provider.',
      inputSchema: {
        providerId: z.string().describe('Provider ID (e.g., "hetzner")'),
      },
    },
    async ({ providerId }) => {
      const result = deps.onGetProviderRequirements(providerId);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  // Tool 12: save_deployment_state
  server.registerTool(
    'save_deployment_state',
    {
      description: 'Save deployment state after provisioning or infrastructure changes.',
      inputSchema: {
        provider: z.string().describe('Provider ID'),
        serverName: z.string().describe('Server name'),
        serverIp: z.string().describe('Server IP address'),
        sshKeyName: z.string().describe('SSH key name on provider'),
        sshPrivateKey: z.string().optional().describe('SSH private key content'),
        instanceType: z.string().describe('Instance type'),
        location: z.string().describe('Server location/region'),
        deployPath: z.string().describe('Path on server where app is deployed'),
      },
    },
    async (state) => {
      const result = deps.onSaveDeploymentState(state);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  return server;
}
