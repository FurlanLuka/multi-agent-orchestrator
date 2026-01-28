import { useState } from 'react';
import {
  Container,
  Stack,
  Title,
  Text,
  TextInput,
  MultiSelect,
  Button,
  ActionIcon,
  Box,
  Loader,
} from '@mantine/core';
import { RichTextEditor, Link } from '@mantine/tiptap';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { IconArrowLeft, IconRocket, IconGitBranch } from '@tabler/icons-react';
import type { ProjectConfig } from '@aio/types';

interface AdHocPromptScreenProps {
  availableProjects: string[];
  projectConfigs: Record<string, ProjectConfig>;
  startingSession: boolean;
  onBack: () => void;
  onStart: (feature: string, projects: string[], branchName?: string) => void;
}

export function AdHocPromptScreen({
  availableProjects,
  projectConfigs,
  startingSession,
  onBack,
  onStart,
}: AdHocPromptScreenProps) {
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
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

  const projectOptions = availableProjects.map(p => ({ value: p, label: p }));

  const hasGitEnabledProject = selectedProjects.some(
    p => projectConfigs[p]?.gitEnabled
  );

  const hasContent = editor ? editor.getText().trim().length > 0 : false;

  const handleStart = () => {
    const text = editor?.getText().trim();
    if (text && selectedProjects.length > 0) {
      onStart(
        text,
        selectedProjects,
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

        <Stack align="center" gap={4}>
          <Title order={2} ta="center">Start Session</Title>
          <Text c="dimmed" size="sm" ta="center">
            Select projects and describe what to build
          </Text>
        </Stack>

        <MultiSelect
          label="Projects"
          placeholder="Select projects to include"
          data={projectOptions}
          value={selectedProjects}
          onChange={setSelectedProjects}
          searchable
          size="md"
        />

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
          disabled={!hasContent || selectedProjects.length === 0 || startingSession}
          loading={startingSession}
        >
          {startingSession ? 'Starting...' : 'Start Planning'}
        </Button>
      </Stack>
    </Container>
  );
}
