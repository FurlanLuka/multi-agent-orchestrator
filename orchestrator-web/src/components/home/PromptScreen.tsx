import { useState } from 'react';
import {
  Container,
  Stack,
  Text,
  Button,
  ActionIcon,
  Group,
  Badge,
  Loader,
} from '@mantine/core';
import { IconRocket, IconGitBranch, IconSettings } from '@tabler/icons-react';
import type { WorkspaceConfig, ProjectConfig } from '@orchy/types';
import { FormCard, GlassTextInput, GlassRichTextEditor, useGlassEditor } from '../../theme';

interface PromptScreenProps {
  workspace: WorkspaceConfig;
  projectConfigs: Record<string, ProjectConfig>;
  startingSession: boolean;
  onBack: () => void;
  onStart: (feature: string, workspaceId: string, branchName?: string) => void;
  onEditWorkspace: () => void;
}

export function PromptScreen({
  workspace,
  projectConfigs,
  startingSession,
  onBack,
  onStart,
  onEditWorkspace,
}: PromptScreenProps) {
  const [branchName, setBranchName] = useState('');

  const editor = useGlassEditor({
    placeholder: 'Describe what to build...',
  });

  const hasGitEnabledProject = workspace.projects.some(
    p => projectConfigs[p]?.gitEnabled
  );

  const hasContent = editor ? editor.getText().trim().length > 0 : false;

  const handleStart = () => {
    const text = editor?.getText().trim();
    if (text) {
      onStart(
        text,
        workspace.id,
        hasGitEnabledProject ? branchName.trim() || undefined : undefined
      );
    }
  };

  return (
    <Container size="sm" pt={60} pb="xl">
      <FormCard
        onBack={onBack}
        title={
          <Stack gap="xs">
            <Group gap="xs" align="center">
              <Text fw={600} size="lg">
                {workspace.name}
              </Text>
              <ActionIcon variant="subtle" color="gray" size="sm" onClick={onEditWorkspace}>
                <IconSettings size={16} />
              </ActionIcon>
            </Group>
            <Group gap="xs">
              {workspace.projects.map(p => (
                <Badge key={p} variant="light" size="sm" radius="sm">{p}</Badge>
              ))}
            </Group>
          </Stack>
        }
        footer={
          <Group justify="flex-end">
            <Button variant="subtle" onClick={onBack}>
              Cancel
            </Button>
            <Button
              leftSection={startingSession ? <Loader size={18} /> : <IconRocket size={18} />}
              onClick={handleStart}
              disabled={!hasContent || startingSession}
              loading={startingSession}
            >
              {startingSession ? 'Starting...' : 'Start Planning'}
            </Button>
          </Group>
        }
      >
        <Stack gap="lg">
          <GlassRichTextEditor
            label="Feature Description"
            placeholder="Describe what to build..."
            editor={editor}
          />

          {hasGitEnabledProject && (
            <GlassTextInput
              label="Branch Name"
              placeholder="e.g., feature/my-feature (auto-generated if empty)"
              description="Feature branch will be created for git-enabled projects"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              leftSection={<IconGitBranch size={16} />}
            />
          )}
        </Stack>
      </FormCard>
    </Container>
  );
}
