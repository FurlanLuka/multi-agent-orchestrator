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
  Box,
} from '@mantine/core';
import { IconSparkles, IconBriefcase } from '@tabler/icons-react';
import type { WorkspaceConfig } from '@orchy/types';
import { GlassBar, StyledModal } from '../../theme';
import { WorkspaceCard } from './WorkspaceCard';
import { AddWorkspaceCard } from './AddWorkspaceCard';
import { HelpOverlay, HelpTrigger } from '../overlay';

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
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceConfig | null>(null);
  const workspaceList = Object.values(workspaces);

  const handleDeleteClick = (workspace: WorkspaceConfig, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(workspace);
  };

  const handleConfirmDelete = () => {
    if (deleteTarget) {
      onDeleteWorkspace(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

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

      <Container size="md" py={hasActiveSession ? 80 : 60}>
        <Stack gap="xl">
          {/* Header */}
          <Stack gap={0}>
            <Title order={2} style={{ letterSpacing: '-.02em' }}>
              Workspaces
            </Title>
            <Group gap="xs">
              <Text c="dimmed" size="sm">
                Your project workspaces
              </Text>
              <Text c="dimmed" size="sm">·</Text>
              <HelpOverlay
                    trigger={<HelpTrigger />}
                    title="Getting Started with Workspaces"
                    icon={<IconBriefcase size={20} style={{ color: 'var(--mantine-color-lavender-5)' }} />}
                    maxWidth={580}
                  >
                    <Stack gap="md">
                      <Box>
                        <Text fw={600} size="sm" mb={4}>What's a workspace?</Text>
                        <Text size="sm" c="dimmed">
                          A workspace is a collection of projects that work together. For example, you might have a frontend app and a backend API in the same workspace. When you build a feature, AI can work across all projects in the workspace at once.
                        </Text>
                      </Box>

                      <Box>
                        <Text fw={600} size="sm" mb={10}>How to create one:</Text>
                        <Stack gap={8}>
                          {[
                            { step: 1, title: 'Click "New Workspace"', desc: 'Start setting up your workspace' },
                            { step: 2, title: 'Add your projects', desc: 'Point to existing folders or create new ones from templates' },
                            { step: 3, title: 'Configure each project', desc: 'Set up dev servers, build commands, and git settings' },
                            { step: 4, title: 'Start building', desc: 'Describe a feature and let AI implement it' },
                          ].map(({ step, title, desc }) => (
                            <Group
                              key={step}
                              gap="xs"
                              wrap="nowrap"
                              align="center"
                              px="sm"
                              py={8}
                              style={{
                                background: 'rgba(250, 247, 245, 0.8)',
                                borderRadius: 10,
                                border: '1px solid rgba(160, 130, 110, 0.08)',
                              }}
                            >
                              <Box
                                style={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: '50%',
                                  background: 'var(--mantine-color-peach-1)',
                                  color: 'var(--mantine-color-peach-6)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  flexShrink: 0,
                                }}
                              >
                                {step}
                              </Box>
                              <Box style={{ flex: 1, minWidth: 0 }}>
                                <Text size="xs"><Text span fw={500}>{title}</Text> <Text span c="dimmed">— {desc}</Text></Text>
                              </Box>
                            </Group>
                          ))}
                        </Stack>
                      </Box>

                      <Box>
                        <Text fw={600} size="sm" mb={4}>Using your workspaces:</Text>
                        <Text size="sm" c="dimmed">
                          Select a workspace to start a new session. You can describe the feature you want to build, and the AI will create a plan and implement it across your projects. Each session is saved so you can review past work.
                        </Text>
                      </Box>
                    </Stack>
                  </HelpOverlay>
            </Group>
          </Stack>

          <SimpleGrid
            cols={{ base: 1, xs: 2, sm: 3 }}
            spacing="md"
          >
            {/* Add New Card */}
            <AddWorkspaceCard onClick={onCreateWorkspace} />

            {workspaceList.map(ws => (
              <WorkspaceCard
                key={ws.id}
                workspace={ws}
                onClick={() => onSelectWorkspace(ws.id)}
                onDelete={(e) => handleDeleteClick(ws, e)}
              />
            ))}
          </SimpleGrid>
        </Stack>
      </Container>

      {/* Delete Confirmation Modal */}
      <StyledModal
        title="Delete Workspace"
        opened={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        size="sm"
        footer={
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button color="rose" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </Group>
        }
      >
        <Text size="sm">
          Are you sure you want to delete <Text span fw={600}>"{deleteTarget?.name}"</Text>? This cannot be undone.
        </Text>
      </StyledModal>
    </>
  );
}
