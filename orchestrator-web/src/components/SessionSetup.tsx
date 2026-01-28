import { useState } from 'react';
import {
  TextInput,
  Button,
  Stack,
  Text,
  MultiSelect,
  Loader,
  Box,
} from '@mantine/core';
import { RichTextEditor, Link } from '@mantine/tiptap';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { IconRocket, IconGitBranch } from '@tabler/icons-react';
import type { ProjectConfig } from '@aio/types';

interface SessionSetupProps {
  availableProjects: string[];
  projectConfigs?: Record<string, ProjectConfig>;
  onStartSession: (feature: string, projects: string[], branchName?: string) => void;
  connected: boolean;
  startingSession?: boolean;
}

export function SessionSetup({
  availableProjects,
  projectConfigs = {},
  onStartSession,
  connected,
  startingSession = false,
}: SessionSetupProps) {
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [branchName, setBranchName] = useState('');

  // Rich text editor for feature description
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link,
      Placeholder.configure({
        placeholder: 'Describe the feature you want to build...',
      }),
    ],
    content: '',
  });

  // Check if any selected project has git enabled
  const hasGitEnabledProject = selectedProjects.some(
    p => projectConfigs[p]?.gitEnabled
  );

  // Get plain text from editor (strips HTML but preserves structure)
  const getFeatureText = () => {
    if (!editor) return '';
    // Get text content, preserving newlines
    return editor.getText();
  };

  // Check if editor has content - use getText() for more robust check
  const hasContent = editor ? editor.getText().trim().length > 0 : false;

  const handleStart = () => {
    const featureText = getFeatureText();
    if (featureText.trim() && selectedProjects.length > 0) {
      onStartSession(
        featureText.trim(),
        selectedProjects,
        hasGitEnabledProject ? branchName.trim() || undefined : undefined
      );
      // Clear editor after starting
      editor?.commands.clearContent();
    }
  };

  const projectOptions = availableProjects.map(p => ({ value: p, label: p }));

  return (
    <Stack gap="lg">
      <Text fw={600} size="xl">Start New Session</Text>

      <Text c="dimmed">
        Describe the feature you want to build, and select which projects are involved.
        The Planning Agent will create an implementation plan for review.
      </Text>

      <Box>
        <Text size="sm" fw={500} mb={4}>Feature Description</Text>
        <RichTextEditor editor={editor} styles={{
          root: {
            minHeight: 150,
          },
          content: {
            minHeight: 120,
            '& .ProseMirror': {
              minHeight: 100,
            },
          },
        }}>
          <RichTextEditor.Toolbar sticky stickyOffset={60}>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Bold />
              <RichTextEditor.Italic />
              <RichTextEditor.Strikethrough />
              <RichTextEditor.Code />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.H1 />
              <RichTextEditor.H2 />
              <RichTextEditor.H3 />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.BulletList />
              <RichTextEditor.OrderedList />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Blockquote />
              <RichTextEditor.CodeBlock />
              <RichTextEditor.Hr />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Link />
              <RichTextEditor.Unlink />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Undo />
              <RichTextEditor.Redo />
            </RichTextEditor.ControlsGroup>
          </RichTextEditor.Toolbar>

          <RichTextEditor.Content />
        </RichTextEditor>
      </Box>

      <MultiSelect
        label="Projects"
        placeholder="Select projects to include"
        data={projectOptions}
        value={selectedProjects}
        onChange={setSelectedProjects}
        searchable
        size="md"
      />

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
        leftSection={startingSession ? <Loader size={18} /> : <IconRocket size={18} />}
        size="md"
        onClick={handleStart}
        disabled={!connected || !hasContent || selectedProjects.length === 0 || startingSession}
        loading={startingSession}
      >
        {startingSession ? 'Starting...' : 'Start Planning'}
      </Button>
    </Stack>
  );
}
