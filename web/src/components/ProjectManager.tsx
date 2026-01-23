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
} from '@mantine/core';
import { IconPlus, IconFolder, IconServer, IconBrowser, IconCheck } from '@tabler/icons-react';
import type { ProjectTemplateConfig, ProjectConfig, ProjectTemplate } from '../types';

interface ProjectManagerProps {
  projects: Record<string, ProjectConfig>;
  templates: ProjectTemplateConfig[];
  creatingProject: boolean;
  onCreateProject: (name: string, targetPath: string, template: ProjectTemplate, runNpmInstall: boolean) => void;
}

export function ProjectManager({ projects, templates, creatingProject, onCreateProject }: ProjectManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [runNpmInstall, setRunNpmInstall] = useState(true);
  const [creatingName, setCreatingName] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);

  // Track when creation completes
  useEffect(() => {
    if (!creatingProject && creatingName) {
      // Creation finished
      setJustCreated(creatingName);
      setCreatingName(null);
      setTimeout(() => setJustCreated(null), 3000); // Clear success after 3s
    }
  }, [creatingProject, creatingName]);

  const handleCreate = () => {
    if (name.trim() && targetPath.trim() && selectedTemplate) {
      setCreatingName(name.trim());
      onCreateProject(name.trim(), targetPath.trim(), selectedTemplate, runNpmInstall);
      // Reset form but keep it open during creation
      setName('');
      setTargetPath('');
      setSelectedTemplate(null);
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

        {/* Creating progress */}
        {creatingProject && creatingName && (
          <Card padding="sm" withBorder bg="blue.0">
            <Stack gap="xs">
              <Group gap="xs">
                <Loader size={14} />
                <Text size="sm" fw={500}>Creating "{creatingName}"...</Text>
              </Group>
              <Progress value={100} animated size="xs" />
              <Text size="xs" c="dimmed">
                {runNpmInstall ? 'Copying template and running npm install...' : 'Copying template files...'}
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
                  </Group>
                </Group>
                <Text size="xs" c="dimmed" mt={4}>{config.path}</Text>
              </Card>
            ))}
          </Stack>
        ) : !creatingProject && (
          <Text size="sm" c="dimmed" ta="center" py="md">
            No projects configured. Add one to get started!
          </Text>
        )}

        {/* Create Project Form */}
        {showForm && !creatingProject && (
          <>
            <Divider />
            <Stack gap="sm">
              <Text fw={500}>Create from Template</Text>

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
                label="Run npm install after creating"
                checked={runNpmInstall}
                onChange={(e) => setRunNpmInstall(e.currentTarget.checked)}
              />

              <Button
                onClick={handleCreate}
                disabled={!name.trim() || !targetPath.trim() || !selectedTemplate}
                leftSection={<IconPlus size={14} />}
              >
                Create Project
              </Button>
            </Stack>
          </>
        )}
      </Stack>
    </Paper>
  );
}
