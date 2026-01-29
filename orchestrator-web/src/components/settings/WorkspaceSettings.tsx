import { useState } from 'react';
import {
  Stack,
  Text,
  Group,
  Badge,
  Button,
  ActionIcon,
} from '@mantine/core';
import {
  GlassCard,
  GlassTextInput,
  GlassTextarea,
  GlassMultiSelect,
  StyledModal,
  EmptyState,
} from '../../theme';
import { IconTrash, IconEdit, IconPlus, IconFolders } from '@tabler/icons-react';
import type { WorkspaceConfig } from '@orchy/types';

interface WorkspaceSettingsProps {
  workspaces: Record<string, WorkspaceConfig>;
  availableProjects: string[];
  onCreateWorkspace: (name: string, projects: string[], context?: string) => void;
  onUpdateWorkspace: (id: string, updates: { name?: string; projects?: string[]; context?: string }) => void;
  onDeleteWorkspace: (id: string) => void;
}

interface EditState {
  id: string;
  name: string;
  projects: string[];
  context: string;
}

export function WorkspaceSettings({
  workspaces,
  availableProjects,
  onCreateWorkspace,
  onUpdateWorkspace,
  onDeleteWorkspace,
}: WorkspaceSettingsProps) {
  const [editing, setEditing] = useState<EditState | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newProjects, setNewProjects] = useState<string[]>([]);
  const [newContext, setNewContext] = useState('');

  const workspaceList = Object.values(workspaces);
  const projectOptions = availableProjects.map(p => ({ value: p, label: p }));

  const handleCreate = () => {
    if (newName.trim() && newProjects.length > 0) {
      onCreateWorkspace(newName.trim(), newProjects, newContext.trim() || undefined);
      setCreating(false);
      setNewName('');
      setNewProjects([]);
      setNewContext('');
    }
  };

  const handleSaveEdit = () => {
    if (editing && editing.name.trim()) {
      onUpdateWorkspace(editing.id, {
        name: editing.name.trim(),
        projects: editing.projects,
        context: editing.context.trim() || undefined,
      });
      setEditing(null);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600} size="lg">Workspaces</Text>
        <Button
          size="sm"
          leftSection={<IconPlus size={14} />}
          onClick={() => setCreating(true)}
        >
          New Workspace
        </Button>
      </Group>

      {workspaceList.length === 0 && (
        <EmptyState
          icon={<IconFolders size={48} />}
          description="No workspaces configured yet. Create one to group your projects."
        />
      )}

      {workspaceList.map(ws => (
        <GlassCard key={ws.id} p="md">
          <Group justify="space-between" align="flex-start">
            <Stack gap="xs">
              <Text fw={600}>{ws.name}</Text>
              <Group gap="xs" wrap="wrap">
                {ws.projects.map(p => (
                  <Badge key={p} variant="light" size="sm">{p}</Badge>
                ))}
              </Group>
              {ws.context && (
                <Text size="xs" c="dimmed" lineClamp={2}>{ws.context}</Text>
              )}
            </Stack>
            <Group gap="xs">
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={() => setEditing({
                  id: ws.id,
                  name: ws.name,
                  projects: ws.projects,
                  context: ws.context || '',
                })}
              >
                <IconEdit size={16} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                onClick={() => onDeleteWorkspace(ws.id)}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          </Group>
        </GlassCard>
      ))}

      {/* Create Modal */}
      <StyledModal
        opened={creating}
        onClose={() => setCreating(false)}
        title="Create Workspace"
        size="md"
        footer={
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || newProjects.length === 0}>
              Create
            </Button>
          </Group>
        }
      >
        <Stack gap="md">
          <GlassTextInput
            label="Name"
            placeholder="e.g., Blog"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <GlassMultiSelect
            label="Projects"
            data={projectOptions}
            value={newProjects}
            onChange={setNewProjects}
            searchable
            required
          />
          <GlassTextarea
            label="Context (optional)"
            placeholder="Planning context..."
            value={newContext}
            onChange={(e) => setNewContext(e.target.value)}
            minRows={2}
            autosize
          />
        </Stack>
      </StyledModal>

      {/* Edit Modal */}
      <StyledModal
        opened={!!editing}
        onClose={() => setEditing(null)}
        title="Edit Workspace"
        size="md"
        footer={
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={!editing?.name.trim()}>
              Save
            </Button>
          </Group>
        }
      >
        {editing && (
          <Stack gap="md">
            <GlassTextInput
              label="Name"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              required
            />
            <GlassMultiSelect
              label="Projects"
              data={projectOptions}
              value={editing.projects}
              onChange={(val) => setEditing({ ...editing, projects: val })}
              searchable
              required
            />
            <GlassTextarea
              label="Context (optional)"
              value={editing.context}
              onChange={(e) => setEditing({ ...editing, context: e.target.value })}
              minRows={2}
              autosize
            />
          </Stack>
        )}
      </StyledModal>
    </Stack>
  );
}
