import { useState } from 'react';
import {
  Container,
  Stack,
  Button,
  Text,
  Group,
} from '@mantine/core';
import {
  FormCard,
  GlassTextInput,
  GlassTextarea,
  GlassMultiSelect,
} from '../../theme';

interface CreateWorkspaceViewProps {
  availableProjects: string[];
  onBack: () => void;
  onCreate: (name: string, projects: string[], context?: string) => void;
  onOpenAddProject: () => void;
}

export function CreateWorkspaceView({
  availableProjects,
  onBack,
  onCreate,
  onOpenAddProject,
}: CreateWorkspaceViewProps) {
  const [name, setName] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [context, setContext] = useState('');

  const projectOptions = availableProjects.map(p => ({ value: p, label: p }));

  const handleCreate = () => {
    if (name.trim() && selectedProjects.length > 0) {
      onCreate(name.trim(), selectedProjects, context.trim() || undefined);
    }
  };

  return (
    <Container size="sm" pt={60} pb="xl">
      <FormCard
        title="Create Workspace"
        onBack={onBack}
        footer={
          <Group justify="flex-end">
            <Button variant="subtle" onClick={onBack}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || selectedProjects.length === 0}
            >
              Create Workspace
            </Button>
          </Group>
        }
      >
        <Stack gap="lg">
          <GlassTextInput
            label="Name"
            placeholder="e.g., Blog, E-Commerce, Dashboard"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="md"
            required
          />

          <GlassMultiSelect
            label="Projects"
            placeholder="Select projects to include"
            data={projectOptions}
            value={selectedProjects}
            onChange={setSelectedProjects}
            searchable
            size="md"
            required
          />

          <GlassTextarea
            label="Context (optional)"
            placeholder="Planning rules, guidelines, or notes for this workspace..."
            description="This context will be prepended to every feature description when starting a session"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            minRows={3}
            autosize
            size="md"
          />

          <Text size="sm" c="dimmed">
            Don't see your project?{' '}
            <Text
              span
              c="peach.6"
              fw={500}
              style={{ cursor: 'pointer' }}
              onClick={onOpenAddProject}
            >
              Add one in Settings
            </Text>
          </Text>
        </Stack>
      </FormCard>
    </Container>
  );
}
