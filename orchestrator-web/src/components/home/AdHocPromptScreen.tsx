import { useState } from 'react';
import {
  Container,
  Stack,
  Title,
  Text,
  Button,
  ActionIcon,
  Loader,
} from '@mantine/core';
import { IconArrowLeft, IconRocket, IconGitBranch } from '@tabler/icons-react';
import type { ProjectConfig } from '@aio/types';
import { GlassTextInput, GlassMultiSelect, GlassRichTextEditor, useGlassEditor } from '../../theme';

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

  const editor = useGlassEditor({
    placeholder: 'Describe what to build...',
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
          <Title order={2} ta="center" style={{ letterSpacing: '-.02em' }}>
            Start Session
          </Title>
          <Text c="dimmed" size="sm" ta="center">
            Select projects and describe what to build
          </Text>
        </Stack>

        <GlassMultiSelect
          label="Projects"
          placeholder="Select projects to include"
          data={projectOptions}
          value={selectedProjects}
          onChange={setSelectedProjects}
          searchable
        />

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
