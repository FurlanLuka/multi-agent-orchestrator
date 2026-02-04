import { useState } from 'react';
import {
  Button,
  Stack,
  Text,
  Loader,
} from '@mantine/core';
import { IconRocket } from '@tabler/icons-react';
import {
  GlassMultiSelect,
  GlassRichTextEditor,
  useGlassEditor,
} from '../theme';

interface SessionSetupProps {
  availableProjects: string[];
  onStartSession: (feature: string, projects: string[], branchName?: string) => void;
  connected: boolean;
  startingSession?: boolean;
}

export function SessionSetup({
  availableProjects,
  onStartSession,
  connected,
  startingSession = false,
}: SessionSetupProps) {
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  const editor = useGlassEditor({
    placeholder: 'Describe the feature you want to build...',
  });

  // Check if editor has content
  const hasContent = editor ? editor.getText().trim().length > 0 : false;

  const handleStart = () => {
    const featureText = editor?.getText().trim();
    if (featureText && selectedProjects.length > 0) {
      onStartSession(
        featureText,
        selectedProjects,
        undefined  // Branch name is auto-generated for orchyManaged workspaces
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

      <GlassRichTextEditor
        label="Feature Description"
        placeholder="Describe the feature you want to build..."
        editor={editor}
      />

      <GlassMultiSelect
        label="Projects"
        placeholder="Select projects to include"
        data={projectOptions}
        value={selectedProjects}
        onChange={setSelectedProjects}
        searchable
        size="md"
      />

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
