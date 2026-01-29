import { useState, useEffect, useRef } from 'react';
import {
  Button,
  Stack,
  Text,
  Group,
  Badge,
  Alert,
  ActionIcon,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconPlus,
  IconFolder,
  IconCheck,
  IconTrash,
  IconEdit,
} from '@tabler/icons-react';
import type { ProjectTemplateConfig, ProjectConfig } from '@orchy/types';
import { GlassCard, EmptyState } from '../theme';

import { AddProjectModal } from './AddProjectModal';
import type { AddProjectOptions, CreateProjectOptions } from './AddProjectModal';
import { EditProjectModal } from './EditProjectModal';
import type { PermissionsConfig } from './CollapsiblePermissions';

interface ProjectManagerProps {
  projects: Record<string, ProjectConfig>;
  templates: ProjectTemplateConfig[];
  creatingProject: boolean;
  addingProject: boolean;
  gitAvailable?: boolean;
  port?: number | null;
  onCreateProject: (options: CreateProjectOptions) => void;
  onAddProject: (options: AddProjectOptions) => void;
  onRemoveProject: (name: string) => void;
  onUpdateProject: (name: string, updates: Partial<ProjectConfig>) => void;
}

export function ProjectManager({
  projects,
  templates,
  creatingProject,
  addingProject,
  gitAvailable = true,
  port,
  onCreateProject,
  onAddProject,
  onRemoveProject,
  onUpdateProject,
}: ProjectManagerProps) {
  // Modal states
  const [addModalOpened, { open: openAddModal, close: closeAddModal }] = useDisclosure(false);
  const [editModalOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);

  // Permissions config
  const [permissionsConfig, setPermissionsConfig] = useState<PermissionsConfig | null>(null);

  // Success message
  const [justCreated, setJustCreated] = useState<string | null>(null);

  const effectivePort = port ?? (window as unknown as { __ORCHESTRATOR_PORT__?: number }).__ORCHESTRATOR_PORT__ ?? 3456;

  // Fetch permissions config
  useEffect(() => {
    if (effectivePort === null) return;

    fetch(`http://localhost:${effectivePort}/api/permissions`)
      .then(res => res.json())
      .then(data => setPermissionsConfig(data))
      .catch(err => console.error('Failed to fetch permissions config:', err));
  }, [effectivePort]);

  // Track project creation success using refs to avoid cascading render issues
  const isLoading = creatingProject || addingProject;
  const prevProjectNamesRef = useRef<string[]>(Object.keys(projects));
  const prevIsLoadingRef = useRef(isLoading);

  useEffect(() => {
    const currentNames = Object.keys(projects);
    const wasLoading = prevIsLoadingRef.current;
    const prevNames = prevProjectNamesRef.current;

    // Update refs for next render
    prevProjectNamesRef.current = currentNames;
    prevIsLoadingRef.current = isLoading;

    // Check if a new project was added (loading just finished and count increased)
    if (wasLoading && !isLoading && currentNames.length > prevNames.length) {
      const newProjectName = currentNames.find(name => !prevNames.includes(name));
      if (newProjectName) {
        // Use queueMicrotask to avoid synchronous setState in effect
        queueMicrotask(() => {
          setJustCreated(newProjectName);
          setTimeout(() => setJustCreated(null), 3000);
        });
      }
    }
  }, [projects, isLoading]);

  const handleEditProject = (projectName: string) => {
    setEditingProject(projectName);
    openEditModal();
  };

  const handleCloseEditModal = () => {
    closeEditModal();
    setEditingProject(null);
  };

  const projectList = Object.entries(projects);

  return (
    <>
      {/* Main Project List View */}
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={5}>Your Projects</Title>
          <Button leftSection={<IconPlus size={14} />} onClick={openAddModal}>
            Add Project
          </Button>
        </Group>

        {/* Success message */}
        {justCreated && (
          <Alert icon={<IconCheck size={16} />} color="green" variant="light">
            Project "{justCreated}" created successfully!
          </Alert>
        )}

        {/* Project List */}
        {projectList.length > 0 ? (
          <Stack gap="xs">
            {projectList.map(([projectName, config]) => (
                <GlassCard key={projectName} p="sm">
                  <Group justify="space-between" wrap="nowrap">
                    <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                      <Text fw={500} truncate>{projectName}</Text>
                      <Text size="xs" c="dimmed" truncate>{config.path}</Text>
                    </Stack>
                    <Group gap="xs" wrap="nowrap">
                      {/* Feature badges */}
                      <Group gap={4} wrap="nowrap">
                        {config.devServerEnabled !== false && (
                          <Badge size="xs" variant="light" color="sage">Dev</Badge>
                        )}
                        {config.buildEnabled !== false && config.buildCommand && (
                          <Badge size="xs" variant="light" color="honey">Build</Badge>
                        )}
                        {config.hasE2E && (
                          <Badge size="xs" variant="light" color="peach">E2E</Badge>
                        )}
                        {config.gitEnabled && (
                          <Badge size="xs" variant="light" color="lavender">Git</Badge>
                        )}
                      </Group>

                      {/* Action buttons */}
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconEdit size={12} />}
                        onClick={() => handleEditProject(projectName)}
                      >
                        Edit
                      </Button>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="rose"
                        onClick={() => onRemoveProject(projectName)}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </GlassCard>
            ))}
          </Stack>
        ) : !isLoading && (
          <EmptyState
            icon={<IconFolder size={48} />}
            description="No projects configured yet. Click 'Add Project' to get started."
          />
        )}
      </Stack>

      {/* Add Project Modal */}
      <AddProjectModal
        opened={addModalOpened}
        onClose={closeAddModal}
        templates={templates}
        projects={projects}
        creatingProject={creatingProject}
        addingProject={addingProject}
        gitAvailable={gitAvailable}
        port={effectivePort}
        permissionsConfig={permissionsConfig}
        onCreateProject={onCreateProject}
        onAddProject={onAddProject}
      />

      {/* Edit Project Modal */}
      <EditProjectModal
        opened={editModalOpened}
        onClose={handleCloseEditModal}
        projectName={editingProject}
        projectConfig={editingProject ? projects[editingProject] : null}
        projects={projects}
        gitAvailable={gitAvailable}
        permissionsConfig={permissionsConfig}
        onSave={onUpdateProject}
      />
    </>
  );
}
