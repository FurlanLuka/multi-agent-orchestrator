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
} from '@mantine/core';
import { IconRocket } from '@tabler/icons-react';

interface SessionSetupProps {
  availableProjects: string[];
  onStartSession: (feature: string, projects: string[]) => void;
  connected: boolean;
}

export function SessionSetup({ availableProjects, onStartSession, connected }: SessionSetupProps) {
  const [feature, setFeature] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  const handleStart = () => {
    if (feature.trim() && selectedProjects.length > 0) {
      onStartSession(feature.trim(), selectedProjects);
    }
  };

  const projectOptions = availableProjects.map(p => ({ value: p, label: p }));

  return (
    <Paper shadow="sm" p="xl" withBorder>
      <Stack gap="lg">
        <Group justify="space-between">
          <Text fw={600} size="xl">Start New Session</Text>
          <Badge color={connected ? 'green' : 'red'}>
            {connected ? 'Connected' : 'Disconnected'}
          </Badge>
        </Group>

        <Text c="dimmed">
          Describe the feature you want to build, and select which projects are involved.
          The Planning Agent will create an implementation plan for review.
        </Text>

        <TextInput
          label="Feature Description"
          placeholder="e.g., Add user authentication with Google OAuth"
          value={feature}
          onChange={(e) => setFeature(e.target.value)}
          size="md"
        />

        <MultiSelect
          label="Projects"
          placeholder="Select projects to include"
          data={projectOptions}
          value={selectedProjects}
          onChange={setSelectedProjects}
          searchable
          size="md"
        />

        <Button
          leftSection={<IconRocket size={18} />}
          size="md"
          onClick={handleStart}
          disabled={!connected || !feature.trim() || selectedProjects.length === 0}
        >
          Start Planning
        </Button>
      </Stack>
    </Paper>
  );
}
