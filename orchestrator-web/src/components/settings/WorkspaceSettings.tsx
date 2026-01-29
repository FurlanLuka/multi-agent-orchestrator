import { useState } from 'react';
import {
  Stack,
  Text,
  Group,
  Badge,
  Button,
  ActionIcon,
  Modal,
} from '@mantine/core';
import {
  GlassTextInput,
  GlassTextarea,
  GlassMultiSelect,
} from '../../theme';
import { IconTrash, IconEdit, IconPlus } from '@tabler/icons-react';
import type { WorkspaceConfig } from '@aio/types';
import { GlassCard } from '../../theme';

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
        <Text c="dimmed" size="sm">No workspaces configured. Create one to group your projects.</Text>
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
      <Modal opened={creating} onClose={() => setCreating(false)} title="Create Workspace" size="md">
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
          <Button onClick={handleCreate} disabled={!newName.trim() || newProjects.length === 0}>
            Create
          </Button>
        </Stack>
      </Modal>

      {/* Edit Modal */}
      <Modal opened={!!editing} onClose={() => setEditing(null)} title="Edit Workspace" size="md">
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
            <Button onClick={handleSaveEdit} disabled={!editing.name.trim()}>
              Save
            </Button>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
