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
${provider.cli && provider.cli.length > 0 ? `## Step 0: Verify CLIs Installed

${provider.cli.map(cli => `Use \`request_user_input\` with type: "install_cli" to verify the ${cli.name} CLI is installed:

\`\`\`json
${this.formatCliInstallJson(cli)}
\`\`\`
`).join('\n')}
This prompts the user to install each CLI if not already present.
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

**CRITICAL: YOU (the agent) must execute all commands directly — do NOT ask the user to run them manually.**

The deployment has two clear phases with no overlap:
- **Phase 1 (Local CLI):** Provision infrastructure, copy docker-compose.yml + .env to server.
  Validate infra works. No app images built or deployed yet.
- **Phase 2 (GitHub Actions):** Build Docker images → push to GHCR → SSH to server →
  \`docker compose pull && docker compose up -d\`. This is the ONLY way apps get deployed.

**The server never has source code.** Only: docker-compose.yml, .env, and optionally nginx config.

### Phase 1: Provision Infrastructure

1. **Verify CLIs installed** — Use \`request_user_input\` with type: "install_cli" for each required CLI

2. **Request HCLOUD_TOKEN** — Use \`request_user_input\` with type: "github_secret"
   - This BOTH sets the token on GitHub AND returns the value for local use
   - Export it: \`export HCLOUD_TOKEN="<token>"\`

3. **Request user confirmation** — Use \`request_user_input\` with type: "confirmation"
   \`\`\`json
   {
     "inputs": [{
       "type": "confirmation",
       "label": "Confirm Infrastructure Provisioning",
       "description": "About to provision ${provider.name} infrastructure. This will incur costs. Proceed?"
     }]
   }
   \`\`\`

4. **Follow provisionCommands from provider requirements** — execute each step in order:
   - Generate SSH key, upload to Hetzner, create server with cloud-init
   - Wait for cloud-init, validate Docker is running
   - Create deploy directory on server
   - Create docker-compose.yml with \`image: ghcr.io/...\` refs (NOT \`build:\`) and copy to server
   - Create .env on server with production secrets
   - Validate infrastructure: \`docker info\`, confirm Docker is working
   - Set GitHub secrets (DEPLOY_SSH_KEY + SERVER_IP)
   - Save deployment state via \`save_deployment_state\` (includes deployPath)

   Do NOT deploy the app yet — that happens exclusively through CI/CD.

### Phase 2: Create CI/CD Workflow

5. **Create \`.github/workflows/deploy.yml\`** — use the workflowTemplate from provider requirements
   - Determine which services have Dockerfiles in the project
   - Replace \`<owner>\`, \`<service>\`, \`<DEPLOY_PATH>\` placeholders with actual values
   - Workflow builds + pushes each service to GHCR, then SSHs to login to GHCR on server + pull + restart
   - Uses \`permissions: contents: read, packages: write\` for automatic GHCR auth in CI and on server
   - GHCR login on the server uses the ephemeral \`GITHUB_TOKEN\` — no persistent PAT needed
   - The server is already provisioned — CI/CD does NOT set up infrastructure, create .env, or install anything

**The CI/CD workflow must NOT:**
- Copy source code to the server — server only has docker-compose.yml + .env
- Run npm install or npm build outside of Docker — all building happens in Docker images
- Create or overwrite .env — it was set up during provisioning
- Regenerate secrets — that invalidates existing sessions/tokens
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
Deploy path: ${deployment.deployPath}
SSH Key: ${deployment.sshKeyName}
Provisioned: ${provisionedDate}

## Available for Management

- **hcloud CLI**: Available for server, firewall, volume, DNS operations
- **SSH access**: The SSH private key is stored in the deployment state.${deployment.sshPrivateKey ? `
  Write the key to /tmp/deploy_key before use:
  \`\`\`bash
  cat > /tmp/deploy_key << 'KEYEOF'
${deployment.sshPrivateKey}
KEYEOF
  chmod 600 /tmp/deploy_key
  \`\`\`
  Then: \`ssh -i /tmp/deploy_key root@${deployment.serverIp}\`` : `
  Key not found in state — may need to regenerate: \`ssh-keygen -t ed25519 -f /tmp/deploy_key -N ""\` and upload to Hetzner.`}
- **Deploy path**: \`${deployment.deployPath}\` on the server
- **HCLOUD_TOKEN**: Request from user via \`request_user_input\` with type "github_secret" if not already exported

After making infrastructure changes, call \`mcp__orchestrator-planning__save_deployment_state\` to update the stored state.
`;
  }
}

export { providers, providerMap };
export * from './types';
