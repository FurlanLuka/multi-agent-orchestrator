/**
 * DeploymentManager - handles deployment provider discovery and requirements
 *
 * Provides:
 * 1. Provider discovery (list available providers)
 * 2. Provider-specific requirements and instructions
 * 3. Deployment availability checks (only enabled for orchyManaged + GitHub)
 */

import { WorkspaceManager } from '../core/workspace-manager';
import type { DeploymentState } from '@orchy/types';
import {
  DeploymentProvider,
  DeploymentAvailability,
  ProviderRequirements,
  ProviderListItem,
  CLIRequirement,
  SecretDefinition,
  ConfigDefinition
} from './types';
import { providers, providerMap } from './providers';

export class DeploymentManager {
  private workspaceManager: WorkspaceManager;

  constructor(workspaceManager: WorkspaceManager) {
    this.workspaceManager = workspaceManager;
  }

  /**
   * Check if deployment is available for a workspace.
   * Deployment requires:
   * - orchyManaged === true
   * - github.enabled === true
   * - github.repo exists
   */
  isDeploymentEnabled(workspaceId: string): DeploymentAvailability {
    const workspace = this.workspaceManager.getWorkspace(workspaceId);

    if (!workspace) {
      return {
        enabled: false,
        reason: 'Workspace not found'
      };
    }

    if (!workspace.orchyManaged) {
      return {
        enabled: false,
        reason: 'Deployment requires an orchyManaged workspace. Create a workspace from a template to enable deployment.',
        workspaceId
      };
    }

    if (!workspace.github?.enabled) {
      return {
        enabled: false,
        reason: 'Deployment requires GitHub integration. Enable GitHub in workspace settings.',
        workspaceId
      };
    }

    if (!workspace.github?.repo) {
      return {
        enabled: false,
        reason: 'Deployment requires a GitHub repository. Configure the repository in workspace settings.',
        workspaceId
      };
    }

    return {
      enabled: true,
      workspaceId,
      repo: workspace.github.repo
    };
  }

  /**
   * List all available deployment providers with basic metadata.
   * MCP tool: list_deployment_providers
   */
  listProviders(): ProviderListItem[] {
    return providers.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      description: p.description
    }));
  }

  /**
   * Get full provider details including secrets, config, and templates.
   * MCP tool: get_provider_requirements
   */
  getProviderRequirements(providerId: string, workspaceId?: string): ProviderRequirements | null {
    const provider = providerMap.get(providerId);
    if (!provider) {
      return null;
    }

    // Get repo and existing deployment state from workspace if available
    let repo: string | undefined;
    let currentDeployment: DeploymentState | undefined;
    if (workspaceId) {
      const availability = this.isDeploymentEnabled(workspaceId);
      if (availability.enabled) repo = availability.repo;
      const workspace = this.workspaceManager.getWorkspace(workspaceId);
      if (workspace?.deployment && workspace.deployment.provider === providerId) {
        currentDeployment = workspace.deployment;
      }
    }

    return {
      provider,
      setupInstructions: this.generateSetupInstructions(provider, repo, currentDeployment),
      provisionCommands: provider.provisionCommands,
      workflowTemplate: provider.workflowTemplate,
      cli: provider.cli,
      currentDeployment
    };
  }

  /**
   * Get a provider by ID
   */
  getProvider(providerId: string): DeploymentProvider | null {
    return providerMap.get(providerId) || null;
  }

  /**
   * Save deployment state to the workspace.
   * Called by the agent after provisioning or any infrastructure change.
   */
  saveDeploymentState(workspaceId: string, state: DeploymentState): void {
    const workspace = this.workspaceManager.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace "${workspaceId}" not found`);
    }

    this.workspaceManager.updateWorkspace(workspaceId, {
      deployment: {
        ...state,
        provisionedAt: state.provisionedAt ?? Date.now()
      }
    });

    console.log(`[DeploymentManager] Saved deployment state for workspace ${workspaceId}: ${state.serverName} (${state.serverIp})`);
  }

  /**
   * Generate human-readable setup instructions for a provider.
   * If currentDeployment exists, returns existing infrastructure context instead of full provisioning instructions.
   */
  private generateSetupInstructions(provider: DeploymentProvider, repo?: string, currentDeployment?: DeploymentState): string {
    // If infrastructure already exists, return context block instead of full provisioning
    if (currentDeployment) {
      return this.generateExistingDeploymentInstructions(provider, currentDeployment);
    }
    return `# ${provider.name} Deployment Setup

${provider.description}

${provider.instanceTypes ? `## CRITICAL: Verify Instance Types

${provider.instanceTypes.note}

Example instance types (VERIFY BEFORE USING):
${provider.instanceTypes.examples.map(t => `- ${t}`).join('\n')}

` : ''}\
${provider.cli ? `## Step 0: Verify CLI Installed

Use \`request_user_input\` with type: "install_cli" to verify the ${provider.cli.name} CLI is installed:

\`\`\`json
${this.formatCliInstallJson(provider.cli)}
\`\`\`

This prompts the user to install the CLI if not already present.
The system verifies installation before continuing.

` : ''}\
${provider.requiredSecrets.length > 0 ? `## Step 1: Request Credentials

Request these from the user using \`request_user_input\` with type: "github_secret":

\`\`\`json
${this.formatSecretsJson(provider.requiredSecrets, repo)}
\`\`\`

` : ''}\
${provider.requiredConfig.length > 0 ? `## Required Configuration Values

Request these from the user using \`request_user_input\` with type: "input":

\`\`\`json
${this.formatConfigJson(provider.requiredConfig)}
\`\`\`

` : ''}\
## MANDATORY: Agent-Executed Local Provisioning

**CRITICAL: YOU (the agent) must execute hcloud commands directly - do NOT ask the user to run them manually.**
The agent provisions infrastructure locally first, then creates GitHub Actions for future CI/CD.

### Step-by-Step Flow:

1. **Verify CLI installed** - Use \`request_user_input\` with type: "install_cli"
   This prompts the user to install the hcloud CLI if not already present.
   The system verifies installation before continuing.

2. **Request HCLOUD_TOKEN** - Use \`request_user_input\` with type: "github_secret"
   - This BOTH sets the token on GitHub AND returns the value for local use
   - Export it: \`export HCLOUD_TOKEN="<token>"\`

3. **Generate SSH deploy key**:
   \`\`\`bash
   ssh-keygen -t ed25519 -f /tmp/deploy_key -N "" -C "deploy@github-actions"
   \`\`\`

4. **Upload key to Hetzner**:
   \`\`\`bash
   hcloud ssh-key create --name "<project>-deploy" --public-key-from-file /tmp/deploy_key.pub
   \`\`\`

5. **Request user confirmation** - Use \`request_user_input\` with type: "confirmation"
   \`\`\`json
   {
     "inputs": [{
       "type": "confirmation",
       "label": "Confirm Infrastructure Provisioning",
       "description": "About to provision ${provider.name} infrastructure. This will incur costs. Proceed?"
     }]
   }
   \`\`\`

6. **Create server with cloud-init** (do NOT ask user to run this):
   \`\`\`bash
   hcloud server create --name "<project>-server" --type cx23 --image ubuntu-24.04 \\
     --ssh-key "<project>-deploy" --user-data-from-file /tmp/cloud-init.yaml --location fsn1
   \`\`\`
   - Cloud-init installs Docker via official apt repo (docker-ce + docker-compose-plugin)
   - Verify instance type with WebSearch first

7. **Wait for cloud-init + validate via SSH**:
   \`\`\`bash
   hcloud server describe "<project>-server" -o format='{{.PublicNet.IPv4.IP}}'
   sleep 60
   ssh -o StrictHostKeyChecking=no -i /tmp/deploy_key root@<SERVER_IP> "cloud-init status --wait && docker --version"
   \`\`\`

8. **Set auto-generated GitHub secrets** (DEPLOY_SSH_KEY + SERVER_IP):
   \`\`\`bash
   gh secret set DEPLOY_SSH_KEY --repo <owner/repo> < /tmp/deploy_key
   gh secret set SERVER_IP --repo <owner/repo> --body "<SERVER_IP>"
   \`\`\`
   These are auto-generated - do NOT ask the user for these values.

9. **Only after validation succeeds** - Create \`.github/workflows/deploy.yml\`
   - Use the workflowTemplate from provider requirements
   - HCLOUD_TOKEN is already on GitHub (from step 2)
   - DEPLOY_SSH_KEY and SERVER_IP were set in step 8

**WHY:** Running hcloud locally first catches credential issues, quota limits,
region availability, and configuration errors before automating in CI/CD.
`;
  }

  private formatCliInstallJson(cli: CLIRequirement): string {
    return JSON.stringify({
      inputs: [{
        type: 'install_cli',
        name: cli.name,
        label: `Install ${cli.name} CLI`,
        description: cli.description,
        installCommand: cli.installCommand,
        verifyCommand: cli.verifyCommand,
        installUrl: cli.installUrl
      }]
    }, null, 2);
  }

  private formatSecretsJson(secrets: SecretDefinition[], repo?: string): string {
    return JSON.stringify({
      inputs: secrets.map(s => ({
        type: 'github_secret',
        name: s.name,
        label: s.label,
        description: s.description,
        repo: repo || 'REPO_FROM_WORKSPACE'
      }))
    }, null, 2);
  }

  private formatConfigJson(config: ConfigDefinition[]): string {
    return JSON.stringify({
      inputs: config.map(c => ({
        type: 'input',
        name: c.name,
        label: c.label,
        description: c.description
      }))
    }, null, 2);
  }

  /**
   * Generate context block for existing infrastructure (day-2 management).
   */
  private generateExistingDeploymentInstructions(provider: DeploymentProvider, deployment: DeploymentState): string {
    const provisionedDate = new Date(deployment.provisionedAt).toISOString().split('T')[0];

    return `# ${provider.name} — Existing Infrastructure

Server: ${deployment.serverName} (${deployment.serverIp})
Instance: ${deployment.instanceType} @ ${deployment.location}
SSH Key: ${deployment.sshKeyName}
Provisioned: ${provisionedDate}

## Available for Management

- **hcloud CLI**: Available for server, firewall, volume, DNS operations
- **SSH access**: \`ssh -i /tmp/deploy_key root@${deployment.serverIp}\` (may need to regenerate key if session expired)
- **HCLOUD_TOKEN**: Request from user via \`request_user_input\` with type "github_secret" if not already exported

After making infrastructure changes, call \`mcp__orchestrator-planning__save_deployment_state\` to update the stored state.
`;
  }
}

export { providers, providerMap };
export * from './types';
