/**
 * Deployment provider type definitions
 */

import type { DeploymentState } from '@orchy/types';

export interface SecretDefinition {
  name: string;
  label: string;
  description: string;
  isGitHubSecret: boolean;
}

export interface ConfigDefinition {
  name: string;
  label: string;
  description: string;
}

export interface InstanceTypeInfo {
  note: string;
  examples: string[];
}

export interface CLIRequirement {
  name: string;           // "hcloud"
  installCommand: string; // "brew install hcloud"
  verifyCommand: string;  // "hcloud version"
  installUrl: string;     // "https://github.com/hetznercloud/cli"
  description: string;    // "Hetzner Cloud CLI for managing servers, DNS, and infrastructure"
}

export interface DeploymentProvider {
  id: string;
  name: string;
  category: 'vps';
  description: string;
  requiredSecrets: SecretDefinition[];
  requiredConfig: ConfigDefinition[];
  instanceTypes?: InstanceTypeInfo;
  cli?: CLIRequirement[];
  provisionCommands: string;
  workflowTemplate: string;
}

export interface ProviderRequirements {
  provider: DeploymentProvider;
  setupInstructions: string;
  provisionCommands: string;
  workflowTemplate: string;
  cli?: CLIRequirement[];
  currentDeployment?: DeploymentState;
}

export interface DeploymentAvailability {
  enabled: boolean;
  reason?: string;
  workspaceId?: string;
  repo?: string;
}

export interface ProviderListItem {
  id: string;
  name: string;
  category: 'vps';
  description: string;
}
