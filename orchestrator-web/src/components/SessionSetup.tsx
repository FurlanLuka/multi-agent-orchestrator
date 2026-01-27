import { useState } from 'react';
import {
  Paper,
  TextInput,
  Button,
  Stack,
  Text,
  MultiSelect,
  Group,
  Badge,
  Divider,
  Card,
  ActionIcon,
  Loader,
  Box,
} from '@mantine/core';
import { RichTextEditor, Link } from '@mantine/tiptap';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { IconRocket, IconTrash, IconPlayerPlay, IconCheck, IconAlertTriangle, IconClock, IconGitBranch } from '@tabler/icons-react';
import type { SessionSummary, SessionStatus, ProjectConfig } from '@aio/types';

interface SessionSetupProps {
  availableProjects: string[];
  projectConfigs?: Record<string, ProjectConfig>;  // Project configs to check gitEnabled
  onStartSession: (feature: string, projects: string[], branchName?: string) => void;
  connected: boolean;
  sessions?: SessionSummary[];
  onLoadSession?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  loadingSession?: boolean;
  startingSession?: boolean;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isToday) {
    return `Today, ${timeStr}`;
  } else if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${timeStr}`;
  }
}

function getStatusBadge(status: SessionStatus) {
  switch (status) {
    case 'completed':
      return <Badge color="green" leftSection={<IconCheck size={12} />}>Complete</Badge>;
    case 'running':
      return <Badge color="blue" leftSection={<IconPlayerPlay size={12} />}>Running</Badge>;
    case 'interrupted':
      return <Badge color="orange" leftSection={<IconAlertTriangle size={12} />}>Interrupted</Badge>;
    case 'planning':
      return <Badge color="gray" leftSection={<IconClock size={12} />}>Planning</Badge>;
    default:
      return <Badge color="gray">{status}</Badge>;
  }
}

export function SessionSetup({
  availableProjects,
  projectConfigs = {},
  onStartSession,
  connected,
  sessions = [],
  onLoadSession,
  onDeleteSession,
  loadingSession = false,
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
      {/* Previous Sessions */}
      {sessions.length > 0 && (
        <Paper shadow="sm" p="xl" withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Text fw={600} size="xl">Previous Sessions</Text>
              <Badge color={connected ? 'green' : 'red'}>
                {connected ? 'Connected' : 'Disconnected'}
              </Badge>
            </Group>

            <Text c="dimmed" size="sm">
              Load a previous session to view history or continue working.
            </Text>

            <Stack gap="xs">
              {sessions.map((session) => (
                <Card key={session.id} padding="sm" withBorder>
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs">
                        <Text fw={500} truncate style={{ maxWidth: '300px' }}>
                          {session.feature}
                        </Text>
                        {getStatusBadge(session.status)}
                      </Group>
                      <Group gap="xs">
                        <Text size="xs" c="dimmed">
                          {session.projects.join(', ')}
                        </Text>
                        <Text size="xs" c="dimmed">
                          •
                        </Text>
                        <Text size="xs" c="dimmed">
                          {formatDate(session.startedAt)}
                        </Text>
                      </Group>
                    </Stack>

                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => onLoadSession?.(session.id)}
                        disabled={!connected || loadingSession}
                        leftSection={loadingSession ? <Loader size={12} /> : <IconPlayerPlay size={14} />}
                      >
                        {loadingSession ? 'Loading...' : 'Load'}
                      </Button>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        onClick={() => onDeleteSession?.(session.id)}
                        disabled={!connected}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </Card>
              ))}
            </Stack>
          </Stack>
        </Paper>
      )}

      {sessions.length > 0 && (
        <Divider label="OR" labelPosition="center" />
      )}

      {/* New Session Form */}
      {/* <Paper shadow="sm" p="xl" withBorder> */}
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
      {/* </Paper> */}
    </Stack>
  );
}
