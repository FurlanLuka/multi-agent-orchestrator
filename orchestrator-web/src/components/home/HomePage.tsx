import {
  Container,
  Stack,
  Title,
  Group,
  SimpleGrid,
  Text,
  Button,
  Badge,
} from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import type { WorkspaceConfig } from '@aio/types';
import { WorkspaceCard } from './WorkspaceCard';
import { AddWorkspaceCard } from './AddWorkspaceCard';
import { FloatingSettingsButton } from './FloatingSettingsButton';

interface HomePageProps {
  workspaces: Record<string, WorkspaceConfig>;
  hasActiveSession: boolean;
  onSelectWorkspace: (workspaceId: string) => void;
  onCreateWorkspace: () => void;
  onSettings: () => void;
  onResumeSession: () => void;
  onStartWithoutWorkspace: () => void;
}

export function HomePage({
  workspaces,
  hasActiveSession,
  onSelectWorkspace,
  onCreateWorkspace,
  onSettings,
  onResumeSession,
  onStartWithoutWorkspace,
}: HomePageProps) {
  const workspaceList = Object.values(workspaces);

  return (
    <>
      {hasActiveSession && (
        <Group
          justify="center"
          p="sm"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            backgroundColor: 'var(--mantine-color-body)',
            borderBottom: '1px solid var(--mantine-color-default-border)',
          }}
        >
          <Badge
            variant="light"
            color="blue"
            size="lg"
            leftSection={<IconSparkles size={14} />}
          >
            Session Active
          </Badge>
          <Button variant="light" size="xs" onClick={onResumeSession}>
            Resume
          </Button>
        </Group>
      )}

      <Container size="sm" py={hasActiveSession ? 80 : 60}>
        <Stack align="center" gap="xl">
          <Stack align="center" gap={4}>
            <Title order={1} ta="center">AIO Orchestrator</Title>
            <Text c="dimmed" size="sm" ta="center">
              Select a workspace to start building
            </Text>
          </Stack>

          <SimpleGrid
            cols={{ base: 1, xs: 2, sm: 3 }}
            spacing="md"
            w="100%"
          >
            {workspaceList.map(ws => (
              <WorkspaceCard
                key={ws.id}
                workspace={ws}
                onClick={() => onSelectWorkspace(ws.id)}
              />
            ))}
            <AddWorkspaceCard onClick={onCreateWorkspace} />
          </SimpleGrid>

          <Text c="dimmed" size="sm" ta="center">
            Or{' '}
            <Text
              span
              c="blue"
              style={{ textDecoration: 'underline', cursor: 'pointer' }}
              onClick={onStartWithoutWorkspace}
            >
              start a session without a workspace
            </Text>
          </Text>
        </Stack>
      </Container>

      <FloatingSettingsButton onClick={onSettings} />
    </>
  );
}
