import {
  Container,
  Stack,
  Title,
  SimpleGrid,
  Text,
  Button,
  Badge,
} from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import type { WorkspaceConfig } from '@aio/types';
import { GlassBar } from '../../theme';
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
  onQuickStart: () => void;
}

export function HomePage({
  workspaces,
  hasActiveSession,
  onSelectWorkspace,
  onCreateWorkspace,
  onSettings,
  onResumeSession,
  onStartWithoutWorkspace,
  onQuickStart,
}: HomePageProps) {
  const workspaceList = Object.values(workspaces);

  return (
    <>
      {hasActiveSession && (
        <GlassBar position="top" justify="center" p="sm">
          <Badge
            variant="light"
            color="peach"
            size="lg"
            leftSection={<IconSparkles size={14} />}
          >
            Session Active
          </Badge>
          <Button variant="light" color="peach" size="xs" onClick={onResumeSession}>
            Resume
          </Button>
        </GlassBar>
      )}

      <Container size="sm" py={hasActiveSession ? 80 : 60}>
        <Stack align="center" gap="xl">
          <Stack align="center" gap={4}>
            <Title order={1} ta="center" style={{ letterSpacing: '-.02em' }}>
              AIO Orchestrator
            </Title>
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
            <Text
              span
              c="peach.6"
              fw={500}
              style={{ cursor: 'pointer' }}
              onClick={onQuickStart}
            >
              Quick start a new app
            </Text>
            {' or '}
            <Text
              span
              c="peach.6"
              fw={500}
              style={{ cursor: 'pointer' }}
              onClick={onStartWithoutWorkspace}
            >
              start without workspace
            </Text>
          </Text>
        </Stack>
      </Container>

      <FloatingSettingsButton onClick={onSettings} />
    </>
  );
}
