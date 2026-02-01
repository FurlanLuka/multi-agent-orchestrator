import { useState } from 'react';
import {
  Container,
  Stack,
  Title,
  SimpleGrid,
  Text,
  Button,
  Badge,
  Group,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { IconSparkles, IconEdit, IconCheck } from '@tabler/icons-react';
import type { WorkspaceConfig } from '@orchy/types';
import { GlassBar } from '../../theme';
import { WorkspaceCard } from './WorkspaceCard';
import { AddWorkspaceCard } from './AddWorkspaceCard';

interface HomePageProps {
  workspaces: Record<string, WorkspaceConfig>;
  hasActiveSession: boolean;
  onSelectWorkspace: (workspaceId: string) => void;
  onCreateWorkspace: () => void;
  onResumeSession: () => void;
  onDeleteWorkspace: (workspaceId: string) => void;
}

export function HomePage({
  workspaces,
  hasActiveSession,
  onSelectWorkspace,
  onCreateWorkspace,
  onResumeSession,
  onDeleteWorkspace,
}: HomePageProps) {
  const [isEditMode, setIsEditMode] = useState(false);
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
            <Group gap="xs" align="center">
              <Title order={1} ta="center" style={{ letterSpacing: '-.02em' }}>
                Workspaces
              </Title>
              {workspaceList.length > 0 && (
                <Tooltip label={isEditMode ? 'Done editing' : 'Edit workspaces'}>
                  <ActionIcon
                    variant={isEditMode ? 'filled' : 'subtle'}
                    color={isEditMode ? 'peach' : 'gray'}
                    size="md"
                    onClick={() => setIsEditMode(!isEditMode)}
                  >
                    {isEditMode ? <IconCheck size={18} /> : <IconEdit size={18} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
            <Text c="dimmed" size="sm" ta="center">
              {isEditMode ? 'Click the trash icon to delete a workspace' : 'Select a workspace to start building'}
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
                isEditMode={isEditMode}
                onClick={() => onSelectWorkspace(ws.id)}
                onDelete={() => onDeleteWorkspace(ws.id)}
              />
            ))}
            {!isEditMode && <AddWorkspaceCard onClick={onCreateWorkspace} />}
          </SimpleGrid>
        </Stack>
      </Container>
    </>
  );
}
