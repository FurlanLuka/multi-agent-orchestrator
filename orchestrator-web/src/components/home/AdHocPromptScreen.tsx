import { useState } from 'react';
import {
  Container,
  Stack,
  Text,
  Button,
  Loader,
  Group,
} from '@mantine/core';
import { IconRocket, IconGitBranch } from '@tabler/icons-react';
import type { ProjectConfig } from '@orchy/types';
import { FormCard, GlassTextInput, GlassMultiSelect, GlassRichTextEditor, useGlassEditor } from '../../theme';

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
    <Container size="sm" pt={60} pb="xl">
      <FormCard
        onBack={onBack}
        title={
          <Stack gap={4}>
            <Text fw={600} size="lg">
              Start Session
            </Text>
            <Text c="dimmed" size="sm">
              Select projects and describe what to build
            </Text>
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
              disabled={!hasContent || selectedProjects.length === 0 || startingSession}
              loading={startingSession}
            >
              {startingSession ? 'Starting...' : 'Start Planning'}
            </Button>
          </Group>
        }
      >
        <Stack gap="lg">
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
        </Stack>
      </FormCard>
    </Container>
  );
}
