/**
 * Provider registry - exports all deployment providers
 */

import { hetznerProvider } from './hetzner';
import { DeploymentProvider } from '../types';

export const providers: DeploymentProvider[] = [
  hetznerProvider
];

export const providerMap: Map<string, DeploymentProvider> = new Map(
  providers.map(p => [p.id, p])
);

export { hetznerProvider };
