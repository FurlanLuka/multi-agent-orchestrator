import { useState, useEffect } from 'react';
import {
  Stack,
  Text,
  Button,
  Group,
  Badge,
  Loader,
  SimpleGrid,
  Grid,
  ActionIcon,
} from '@mantine/core';
import { IconRocket, IconCheck, IconExternalLink } from '@tabler/icons-react';
import type { WorkspaceConfig, DeploymentState } from '@orchy/types';
import { FormCard, GlassCard, GlassTextarea } from '../../theme';

interface ProviderListItem {
  id: string;
  name: string;
  category: string;
  description: string;
}

interface DeploymentTabProps {
  workspace: WorkspaceConfig;
  port: number;
  startingSession: boolean;
  onStartDeployment: (provider: string, description: string, workspaceId: string) => void;
}

/* ── Current Deployment Sidebar ──────────────────────────── */

function CurrentDeploymentCard({ deployment }: { deployment: DeploymentState }) {
  return (
    <FormCard
      title={
        <Group justify="space-between" align="center" style={{ width: '100%' }}>
          <Text fw={600} size="sm">Current Deployment</Text>
          <Badge color="green" variant="light" size="sm" leftSection={<IconCheck size={10} />}>
            Active
          </Badge>
        </Group>
      }
    >
      <Stack gap={4}>
        <Group gap="xs">
          <Text size="xs" c="dimmed" w={80}>Server:</Text>
          <Text size="xs" ff="monospace">{deployment.serverName}</Text>
        </Group>
        <Group gap="xs">
          <Text size="xs" c="dimmed" w={80}>IP:</Text>
          <Group gap={4} wrap="nowrap">
            <Text size="xs" ff="monospace">{deployment.serverIp}</Text>
            <ActionIcon
              size="xs"
              variant="subtle"
              color="gray"
              component="a"
              href={`http://${deployment.serverIp}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconExternalLink size={12} />
            </ActionIcon>
          </Group>
        </Group>
        <Group gap="xs">
          <Text size="xs" c="dimmed" w={80}>Instance:</Text>
          <Text size="xs" ff="monospace">{deployment.instanceType}</Text>
        </Group>
        <Group gap="xs">
          <Text size="xs" c="dimmed" w={80}>Location:</Text>
          <Text size="xs" ff="monospace">{deployment.location}</Text>
        </Group>
        <Group gap="xs">
          <Text size="xs" c="dimmed" w={80}>Provider:</Text>
          <Text size="xs" ff="monospace">{deployment.provider}</Text>
        </Group>
      </Stack>
    </FormCard>
  );
}

/* ── Main Component ──────────────────────────────────────── */

export function DeploymentTab({
  workspace,
  port,
  startingSession,
  onStartDeployment,
}: DeploymentTabProps) {
  const [providers, setProviders] = useState<ProviderListItem[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  const existingDeployment: DeploymentState | undefined = workspace.deployment;
  const hasExistingDeployment = !!existingDeployment;

  // Fetch providers
  useEffect(() => {
    fetch(`http://localhost:${port}/api/deployment/providers`)
      .then(res => res.json())
      .then((data: ProviderListItem[]) => {
        setProviders(data);
        if (data.length === 1) {
          setSelectedProvider(data[0].id);
        }
      })
      .catch(err => {
        console.error('Failed to fetch deployment providers:', err);
      })
      .finally(() => setLoadingProviders(false));
  }, [port]);

  const handleStart = () => {
    if (!selectedProvider) return;
    onStartDeployment(selectedProvider, description, workspace.id);
  };

  if (loadingProviders) {
    return (
      <Stack align="center" py="xl">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">Loading providers...</Text>
      </Stack>
    );
  }

  const deployForm = (
    <FormCard
      title={hasExistingDeployment ? "Modify Deployment" : "New Deployment"}
      footer={
        selectedProvider ? (
          <Group justify="flex-end">
            <Button
              leftSection={startingSession ? <Loader size={18} /> : <IconRocket size={18} />}
              onClick={handleStart}
              disabled={!description.trim() || startingSession}
              loading={startingSession}
            >
              {hasExistingDeployment ? 'Start Modification' : 'Start Deployment Planning'}
            </Button>
          </Group>
        ) : undefined
      }
    >
      <Stack gap="lg">
        {/* Provider selection */}
        <Stack gap="xs">
          <Text fw={500} size="sm">Select Provider</Text>
          <SimpleGrid cols={{ base: 1, sm: Math.min(providers.length, 3) }} spacing="sm">
            {providers.map(provider => (
              <GlassCard
                key={provider.id}
                p="md"
                style={{
                  cursor: 'pointer',
                  border: selectedProvider === provider.id
                    ? '2px solid var(--mantine-color-peach-5)'
                    : '1px solid var(--border-subtle)',
                  opacity: selectedProvider === provider.id ? 1 : 0.7,
                  transition: 'all 0.15s ease',
                }}
                onClick={() => setSelectedProvider(provider.id)}
              >
                <Stack gap={0} align="center">
                  <Text size="sm" fw={500}>{provider.name}</Text>
                  <Text size="xs" c="dimmed" ta="center">{provider.description}</Text>
                </Stack>
              </GlassCard>
            ))}
          </SimpleGrid>
        </Stack>

        {/* Description input */}
        {selectedProvider && (
          <GlassTextarea
            label="Deployment Description"
            placeholder={hasExistingDeployment
              ? 'Upgrade server, add DNS, configure firewall...'
              : 'Deploy to Hetzner with Docker, set up CI/CD...'
            }
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            minRows={3}
            maxRows={6}
            autosize
          />
        )}
      </Stack>
    </FormCard>
  );

  if (hasExistingDeployment && existingDeployment) {
    return (
      <Grid gutter="lg" align="start">
        <Grid.Col span={{ base: 12, md: 8 }}>
          {deployForm}
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <CurrentDeploymentCard deployment={existingDeployment} />
        </Grid.Col>
      </Grid>
    );
  }

  return deployForm;
}
