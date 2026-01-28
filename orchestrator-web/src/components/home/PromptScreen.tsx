import { useState } from 'react';
import {
  Container,
  Stack,
  Title,
  Text,
  TextInput,
  Button,
  ActionIcon,
  Group,
  Badge,
  Box,
  Loader,
} from '@mantine/core';
import { RichTextEditor, Link } from '@mantine/tiptap';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { IconArrowLeft, IconRocket, IconGitBranch, IconSettings } from '@tabler/icons-react';
import type { WorkspaceConfig, ProjectConfig } from '@aio/types';

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

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link,
      Placeholder.configure({
        placeholder: 'Describe what to build...',
      }),
    ],
    content: '',
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
    <Container size="sm" py="xl">
      <Stack gap="xl">
        <ActionIcon variant="subtle" color="gray" size="lg" onClick={onBack}>
          <IconArrowLeft size={20} />
        </ActionIcon>

        <Stack align="center" gap="xs">
          <Group gap="xs" align="center">
            <Title order={2} ta="center">{workspace.name}</Title>
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={onEditWorkspace}>
              <IconSettings size={16} />
            </ActionIcon>
          </Group>
          <Group gap="xs" justify="center">
            {workspace.projects.map(p => (
              <Badge key={p} variant="light" size="sm" radius="sm">{p}</Badge>
            ))}
          </Group>
        </Stack>

        <Box>
          <Text size="sm" fw={500} mb={4}>Feature Description</Text>
          <RichTextEditor editor={editor} styles={{
            root: { minHeight: 200 },
            content: {
              minHeight: 160,
              '& .ProseMirror': { minHeight: 140 },
            },
          }}>
            <RichTextEditor.Toolbar sticky stickyOffset={60}>
              <RichTextEditor.ControlsGroup>
                <RichTextEditor.Bold />
                <RichTextEditor.Italic />
                <RichTextEditor.Code />
              </RichTextEditor.ControlsGroup>
              <RichTextEditor.ControlsGroup>
                <RichTextEditor.BulletList />
                <RichTextEditor.OrderedList />
              </RichTextEditor.ControlsGroup>
              <RichTextEditor.ControlsGroup>
                <RichTextEditor.CodeBlock />
              </RichTextEditor.ControlsGroup>
            </RichTextEditor.Toolbar>
            <RichTextEditor.Content />
          </RichTextEditor>
        </Box>

        {hasGitEnabledProject && (
          <TextInput
            label="Branch Name"
            placeholder="e.g., feature/my-feature (auto-generated if empty)"
            description="Feature branch will be created for git-enabled projects"
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            size="md"
            leftSection={<IconGitBranch size={16} />}
          />
        )}

        <Button
          size="lg"
          fullWidth
          leftSection={startingSession ? <Loader size={18} /> : <IconRocket size={18} />}
          onClick={handleStart}
          disabled={!hasContent || startingSession}
          loading={startingSession}
        >
          {startingSession ? 'Starting...' : 'Start Planning'}
        </Button>
      </Stack>
    </Container>
  );
}
