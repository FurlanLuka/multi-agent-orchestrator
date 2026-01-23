import { useState, useEffect } from 'react';
import {
  Paper,
  TextInput,
  Button,
  Stack,
  Text,
  Select,
  Group,
  Card,
  Badge,
  Checkbox,
  Loader,
  Divider,
  Progress,
  Alert,
  SegmentedControl,
  ActionIcon,
} from '@mantine/core';
import { IconPlus, IconFolder, IconServer, IconBrowser, IconCheck, IconFolderPlus, IconTrash } from '@tabler/icons-react';
import type { ProjectTemplateConfig, ProjectConfig, ProjectTemplate } from '../types';

interface AddProjectOptions {
  name: string;
  path: string;
  devServer?: {
    command: string;
    readyPattern: string;
    env?: Record<string, string>;
  };
  buildCommand?: string;
  hasE2E?: boolean;
  dependencyInstall?: boolean;
}

interface ProjectManagerProps {
  projects: Record<string, ProjectConfig>;
  templates: ProjectTemplateConfig[];
  creatingProject: boolean;
  addingProject: boolean;
  onCreateProject: (name: string, targetPath: string, template: ProjectTemplate, dependencyInstall: boolean) => void;
  onAddProject: (options: AddProjectOptions) => void;
  onRemoveProject: (name: string) => void;
}

export function ProjectManager({ projects, templates, creatingProject, addingProject, onCreateProject, onAddProject, onRemoveProject }: ProjectManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'template' | 'existing'>('existing');

  // Template form state
  const [name, setName] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [templateDependencyInstall, setTemplateDependencyInstall] = useState(true);

  // Manual form state
  const [manualName, setManualName] = useState('');
  const [manualPath, setManualPath] = useState('');
  const [manualCommand, setManualCommand] = useState('npm run dev');
  const [manualReadyPattern, setManualReadyPattern] = useState('ready|listening|started|compiled');
  const [manualBuildCommand, setManualBuildCommand] = useState('npm run build');
  const [manualHasE2E, setManualHasE2E] = useState(false);
  const [manualDependencyInstall, setManualDependencyInstall] = useState(false);

  const [creatingName, setCreatingName] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);

  const isLoading = creatingProject || addingProject;

  // Track when creation completes
  useEffect(() => {
    if (!isLoading && creatingName) {
      // Creation finished
      setJustCreated(creatingName);
      setCreatingName(null);
      setShowForm(false); // Close form on success
      // Reset form fields
      setName('');
      setTargetPath('');
      setSelectedTemplate(null);
      setTemplateDependencyInstall(true);
      setManualName('');
      setManualPath('');
      setManualCommand('npm run dev');
      setManualReadyPattern('ready|listening|started|compiled');
      setManualBuildCommand('npm run build');
      setManualHasE2E(false);
      setManualDependencyInstall(false);
      setTimeout(() => setJustCreated(null), 3000); // Clear success after 3s
    }
  }, [isLoading, creatingName]);

  const handleCreateFromTemplate = () => {
    if (name.trim() && targetPath.trim() && selectedTemplate) {
      setCreatingName(name.trim());
      onCreateProject(name.trim(), targetPath.trim(), selectedTemplate, templateDependencyInstall);
    }
  };

  const handleAddExisting = () => {
    if (manualName.trim() && manualPath.trim()) {
      setCreatingName(manualName.trim());
      onAddProject({
        name: manualName.trim(),
        path: manualPath.trim(),
        devServer: {
          command: manualCommand.trim() || 'npm run dev',
          readyPattern: manualReadyPattern.trim() || 'ready|listening|started|compiled',
        },
        buildCommand: manualBuildCommand.trim() || 'npm run build',
        hasE2E: manualHasE2E,
        dependencyInstall: manualDependencyInstall,
      });
    }
  };

  const templateOptions = templates.map(t => ({
    value: t.name,
    label: t.displayName,
  }));

  const selectedTemplateConfig = templates.find(t => t.name === selectedTemplate);

  const projectList = Object.entries(projects);

  return (
    <Paper shadow="sm" p="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between">
          <Text fw={600} size="lg">Projects</Text>
          <Button
            variant="light"
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : 'Add Project'}
          </Button>
        </Group>

        {/* Success message */}
        {justCreated && (
          <Alert icon={<IconCheck size={16} />} color="green" variant="light">
            Project "{justCreated}" created successfully!
          </Alert>
        )}

        {/* Creating/Adding progress */}
        {isLoading && creatingName && (
          <Card padding="sm" withBorder bg="blue.0">
            <Stack gap="xs">
              <Group gap="xs">
                <Loader size={14} />
                <Text size="sm" fw={500}>
                  {creatingProject ? `Creating "${creatingName}"...` : `Adding "${creatingName}"...`}
                </Text>
              </Group>
              <Progress value={100} animated size="xs" />
              <Text size="xs" c="dimmed">
                {creatingProject
                  ? (templateDependencyInstall ? 'Copying template and installing dependencies...' : 'Copying template files...')
                  : (manualDependencyInstall ? 'Validating path and installing dependencies...' : 'Validating path and updating configuration...')}
              </Text>
            </Stack>
          </Card>
        )}

        {/* Existing Projects */}
        {projectList.length > 0 ? (
          <Stack gap="xs">
            {projectList.map(([projectName, config]) => (
              <Card key={projectName} padding="xs" withBorder>
                <Group justify="space-between">
                  <Group gap="xs">
                    <IconFolder size={16} />
                    <Text fw={500}>{projectName}</Text>
                  </Group>
                  <Group gap="xs">
                    <Badge size="xs" variant="light">
                      {config.devServer.command}
                    </Badge>
                    {config.hasE2E && (
                      <Badge size="xs" color="green" variant="light">
                        E2E
                      </Badge>
                    )}
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => onRemoveProject(projectName)}
                    >
                      <IconTrash size={12} />
                    </ActionIcon>
                  </Group>
                </Group>
                <Text size="xs" c="dimmed" mt={4}>{config.path}</Text>
              </Card>
            ))}
          </Stack>
        ) : !isLoading && (
          <Text size="sm" c="dimmed" ta="center" py="md">
            No projects configured. Add one to get started!
          </Text>
        )}

        {/* Add Project Form */}
        {showForm && !isLoading && (
          <>
            <Divider />
            <Stack gap="sm">
              <SegmentedControl
                value={formMode}
                onChange={(v) => setFormMode(v as 'template' | 'existing')}
                data={[
                  { label: 'Add Existing', value: 'existing' },
                  { label: 'Create from Template', value: 'template' },
                ]}
                fullWidth
              />

              {/* Add Existing Project Form */}
              {formMode === 'existing' && (
                <>
                  <TextInput
                    label="Project Name"
                    placeholder="e.g., my-api"
                    description="Name to identify this project"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                  />

                  <TextInput
                    label="Project Path"
                    placeholder="e.g., ~/Documents/my-api"
                    description="Path to the existing project directory"
                    value={manualPath}
                    onChange={(e) => setManualPath(e.target.value)}
                    leftSection={<IconFolder size={16} />}
                  />

                  <TextInput
                    label="Dev Server Command"
                    placeholder="e.g., npm run dev"
                    description="Command to start the development server"
                    value={manualCommand}
                    onChange={(e) => setManualCommand(e.target.value)}
                  />

                  <TextInput
                    label="Ready Pattern"
                    placeholder="e.g., ready|listening|started"
                    description="Regex pattern to detect when server is ready"
                    value={manualReadyPattern}
                    onChange={(e) => setManualReadyPattern(e.target.value)}
                  />

                  <TextInput
                    label="Build Command"
                    placeholder="e.g., npm run build"
                    description="Command to build the project for production"
                    value={manualBuildCommand}
                    onChange={(e) => setManualBuildCommand(e.target.value)}
                  />

                  <Checkbox
                    label="Has E2E tests"
                    checked={manualHasE2E}
                    onChange={(e) => setManualHasE2E(e.currentTarget.checked)}
                  />

                  <Checkbox
                    label="Install dependencies"
                    description="Automatically detects npm/yarn/pnpm/bun"
                    checked={manualDependencyInstall}
                    onChange={(e) => setManualDependencyInstall(e.currentTarget.checked)}
                  />

                  <Button
                    onClick={handleAddExisting}
                    disabled={!manualName.trim() || !manualPath.trim()}
                    leftSection={<IconFolderPlus size={14} />}
                  >
                    Add Project
                  </Button>
                </>
              )}

              {/* Create from Template Form */}
              {formMode === 'template' && (
                <>
                  <Select
                    label="Template"
                    placeholder="Select a template"
                    data={templateOptions}
                    value={selectedTemplate}
                    onChange={(v) => setSelectedTemplate(v as ProjectTemplate)}
                    leftSection={selectedTemplate?.includes('frontend') ? <IconBrowser size={16} /> : <IconServer size={16} />}
                  />

                  {selectedTemplateConfig && (
                    <Card padding="xs" withBorder bg="gray.0">
                      <Text size="sm">{selectedTemplateConfig.description}</Text>
                      <Group gap="xs" mt="xs">
                        <Badge size="xs" variant="outline">
                          {selectedTemplateConfig.devServer.command}
                        </Badge>
                        <Badge size="xs" variant="outline">
                          Port {selectedTemplateConfig.defaultPort}
                        </Badge>
                      </Group>
                    </Card>
                  )}

                  <TextInput
                    label="Project Name"
                    placeholder="e.g., my-backend"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />

                  <TextInput
                    label="Target Path"
                    placeholder="e.g., ~/Documents/my-backend"
                    description="Where to create the project directory"
                    value={targetPath}
                    onChange={(e) => setTargetPath(e.target.value)}
                  />

                  <Checkbox
                    label="Install dependencies after creating"
                    description="Automatically detects npm/yarn/pnpm/bun"
                    checked={templateDependencyInstall}
                    onChange={(e) => setTemplateDependencyInstall(e.currentTarget.checked)}
                  />

                  <Button
                    onClick={handleCreateFromTemplate}
                    disabled={!name.trim() || !targetPath.trim() || !selectedTemplate}
                    leftSection={<IconPlus size={14} />}
                  >
                    Create Project
                  </Button>
                </>
              )}
            </Stack>
          </>
        )}
      </Stack>
    </Paper>
  );
}
