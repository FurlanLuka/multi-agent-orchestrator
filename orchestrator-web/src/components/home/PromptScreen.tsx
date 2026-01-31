import { useState, useEffect } from 'react';
import {
  Container,
  Stack,
  Text,
  Button,
  ActionIcon,
  Group,
  Badge,
  Loader,
  Grid,
  Box,
} from '@mantine/core';
import { IconRocket, IconGitBranch, IconSettings } from '@tabler/icons-react';
import type { WorkspaceConfig, ProjectConfig, SessionProjectConfig } from '@orchy/types';
import { FormCard, GlassTextInput, GlassRichTextEditor, useGlassEditor } from '../../theme';
import { ProjectSelectionPanel } from './ProjectSelectionPanel';

interface PromptScreenProps {
  workspace: WorkspaceConfig;
  projectConfigs: Record<string, ProjectConfig>;
  startingSession: boolean;
  onBack: () => void;
  onStart: (
    feature: string,
    workspaceId: string,
    branchName?: string,
    sessionProjectConfigs?: SessionProjectConfig[]
  ) => void;
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
  const [sessionProjectConfigs, setSessionProjectConfigs] = useState<SessionProjectConfig[]>([]);

  const editor = useGlassEditor({
    placeholder: 'Describe what to build...',
  });

  // Initialize session project configs when workspace changes
  useEffect(() => {
    const configs = workspace.projects.map(name => ({
      name,
      included: true,
      readOnly: false,
      designEnabled: !!projectConfigs[name]?.attachedDesign, // Enable design by default if attached
    }));
    setSessionProjectConfigs(configs);
  }, [workspace.projects, projectConfigs]);

  const hasGitEnabledProject = workspace.projects.some(
    p => projectConfigs[p]?.gitEnabled
  );

  const hasContent = editor ? editor.getText().trim().length > 0 : false;

  const handleStart = () => {
    const text = editor?.getText().trim();
    if (text) {
      // Filter to only included projects
      const includedConfigs = sessionProjectConfigs.filter(c => c.included);
      onStart(
        text,
        workspace.id,
        hasGitEnabledProject ? branchName.trim() || undefined : undefined,
        includedConfigs
      );
    }
  };

  return (
    <Container size="lg" pt={60} pb="xl">
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
        <Grid gutter="lg">
          {/* Left column: Feature description and branch name */}
          <Grid.Col span={{ base: 12, md: 7 }}>
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
          </Grid.Col>

          {/* Right column: Project selection */}
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Box pt={{ base: 0, md: 28 }}>
              <ProjectSelectionPanel
                projects={workspace.projects}
                projectConfigs={projectConfigs}
                sessionProjectConfigs={sessionProjectConfigs}
                onConfigChange={setSessionProjectConfigs}
              />
            </Box>
          </Grid.Col>
        </Grid>
      </FormCard>
    </Container>
  );
}
