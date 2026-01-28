import { useState } from 'react';
import {
  Container,
  Stack,
  Title,
  TextInput,
  Textarea,
  MultiSelect,
  Button,
  ActionIcon,
  Text,
} from '@mantine/core';
import { IconArrowLeft, IconPlus } from '@tabler/icons-react';

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
    <Container size="sm" py="xl">
      <Stack gap="xl">
        <ActionIcon variant="subtle" color="gray" size="lg" onClick={onBack}>
          <IconArrowLeft size={20} />
        </ActionIcon>

        <Title order={2} ta="center">Create Workspace</Title>

        <TextInput
          label="Name"
          placeholder="e.g., Blog, E-Commerce, Dashboard"
          value={name}
          onChange={(e) => setName(e.target.value)}
          size="md"
          required
        />

        <MultiSelect
          label="Projects"
          placeholder="Select projects to include"
          data={projectOptions}
          value={selectedProjects}
          onChange={setSelectedProjects}
          searchable
          size="md"
          required
        />

        <Textarea
          label="Context (optional)"
          placeholder="Planning rules, guidelines, or notes for this workspace..."
          description="This context will be prepended to every feature description when starting a session"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          minRows={3}
          autosize
          size="md"
        />

        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            Don't see your project?
          </Text>
          <Button
            variant="subtle"
            size="sm"
            leftSection={<IconPlus size={14} />}
            onClick={onOpenAddProject}
          >
            Add Project
          </Button>
        </Stack>

        <Button
          size="lg"
          fullWidth
          onClick={handleCreate}
          disabled={!name.trim() || selectedProjects.length === 0}
        >
          Create Workspace
        </Button>
      </Stack>
    </Container>
  );
}
