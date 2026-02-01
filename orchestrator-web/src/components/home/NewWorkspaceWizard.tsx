import { useState } from 'react';
import {
  Container,
  Stack,
  Button,
  Text,
  Title,
  Group,
  SimpleGrid,
} from '@mantine/core';
import { IconBrowser, IconServer, IconPlus, IconFolder } from '@tabler/icons-react';
import type { ProjectConfig, WorkspaceProjectConfig, ProjectTemplateConfig } from '@orchy/types';
import {
  FormCard,
  GlassTextInput,
  GlassTextarea,
  GlassCard,
} from '../../theme';
import { AddProjectModal, type AddProjectOptions, type CreateProjectOptions } from '../AddProjectModal';

interface NewWorkspaceWizardProps {
  templates: ProjectTemplateConfig[];
  projects: Record<string, ProjectConfig>;
  creatingProject: boolean;
  addingProject: boolean;
  gitAvailable: boolean;
  port: number;
  onBack: () => void;
  onCreate: (name: string, projects: WorkspaceProjectConfig[], context?: string) => void;
  onCreateProject: (options: CreateProjectOptions) => void;
  onAddProject: (options: AddProjectOptions) => void;
}

// Helper to convert template config to full ProjectConfig with placeholder path
function templateToProjectConfig(templateConfig: Omit<ProjectConfig, 'path'>, placeholderPath: string): ProjectConfig {
  return {
    ...templateConfig,
    path: placeholderPath,
    // Ensure devServer has env if it exists
    devServer: templateConfig.devServer ? {
      ...templateConfig.devServer,
      env: templateConfig.devServer.env ?? {},
    } : undefined,
  };
}

type ProjectSource = 'template' | 'existing' | null;
type TemplateType = 'frontend' | 'backend' | 'fullstack';

interface WizardProject {
  name: string;
  config: ProjectConfig;
}

export function NewWorkspaceWizard({
  templates,
  projects,
  creatingProject,
  addingProject,
  gitAvailable,
  port,
  onBack,
  onCreate,
  onCreateProject,
  onAddProject: _onAddProject, // Used via AddProjectModal callback
}: NewWorkspaceWizardProps) {
  // Note: _onAddProject is available but wizard uses local state instead
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [projectSource, setProjectSource] = useState<ProjectSource>(null);
  const [templateType, setTemplateType] = useState<TemplateType | null>(null);
  const [wizardProjects, setWizardProjects] = useState<WizardProject[]>([]);
  const [context, setContext] = useState('');
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);

  const canProceedStep0 = name.trim().length > 0 && projectSource !== null;
  const canProceedStep1 = wizardProjects.length > 0 || (projectSource === 'template' && templateType !== null);

  const handleTemplateSelection = (type: TemplateType) => {
    setTemplateType(type);
    // Create wizard projects based on template selection
    const newProjects: WizardProject[] = [];
    const workspacePath = `~/orchy/${name.toLowerCase().replace(/\s+/g, '-')}`;

    if (type === 'frontend' || type === 'fullstack') {
      const frontendTemplate = templates.find(t => t.name.includes('frontend'));
      if (frontendTemplate) {
        const projectName = `${name.toLowerCase().replace(/\s+/g, '-')}-frontend`;
        newProjects.push({
          name: projectName,
          config: templateToProjectConfig(frontendTemplate.config, `${workspacePath}/${projectName}`),
        });
      }
    }

    if (type === 'backend' || type === 'fullstack') {
      const backendTemplate = templates.find(t => t.name.includes('backend'));
      if (backendTemplate) {
        const projectName = `${name.toLowerCase().replace(/\s+/g, '-')}-backend`;
        newProjects.push({
          name: projectName,
          config: templateToProjectConfig(backendTemplate.config, `${workspacePath}/${projectName}`),
        });
      }
    }

    setWizardProjects(newProjects);
  };

  const handleAddExistingProject = (options: AddProjectOptions) => {
    const { name: projectName, path, ...rest } = options;
    const newProject: WizardProject = {
      name: projectName,
      config: {
        path,
        hasE2E: rest.hasE2E ?? false,
        devServerEnabled: rest.devServerEnabled,
        devServer: rest.devServer ? {
          ...rest.devServer,
          env: rest.devServer.env ?? {},
        } : undefined,
        buildEnabled: rest.buildEnabled,
        buildCommand: rest.buildCommand,
        installEnabled: rest.installEnabled,
        installCommand: rest.installCommand,
        setupCommand: rest.setupCommand,
        e2eInstructions: rest.e2eInstructions,
        dependsOn: rest.dependsOn,
        gitEnabled: rest.gitEnabled,
        mainBranch: rest.mainBranch,
        permissions: rest.permissions,
      },
    };
    setWizardProjects([...wizardProjects, newProject]);
    setShowAddProjectModal(false);
  };

  const handleCreateWorkspace = () => {
    const workspaceProjects: WorkspaceProjectConfig[] = wizardProjects.map(p => ({
      name: p.name,
      ...p.config,
    }));
    onCreate(name.trim(), workspaceProjects, context.trim() || undefined);
  };

  const renderStep0 = () => (
    <Stack gap="lg">
      <GlassTextInput
        label="Workspace Name"
        placeholder="e.g., My Blog, E-Commerce App"
        description="Give your workspace a descriptive name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        size="md"
        required
      />

      <Stack gap="xs">
        <Text size="sm" fw={500}>How do you want to add projects?</Text>
        <Text size="xs" c="dimmed">
          A workspace groups related projects together. Choose how to set up your projects.
        </Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <GlassCard
          p="md"
          hoverable
          selected={projectSource === 'template'}
          onClick={() => setProjectSource('template')}
        >
          <Stack gap="sm" align="center" ta="center">
            <IconPlus size={24} color="var(--mantine-color-peach-6)" />
            <Text fw={500}>Use Template</Text>
            <Text size="xs" c="dimmed">
              Create new project folders from starter templates
            </Text>
          </Stack>
        </GlassCard>

        <GlassCard
          p="md"
          hoverable
          selected={projectSource === 'existing'}
          onClick={() => setProjectSource('existing')}
        >
          <Stack gap="sm" align="center" ta="center">
            <IconFolder size={24} color="var(--mantine-color-peach-6)" />
            <Text fw={500}>Use Existing</Text>
            <Text size="xs" c="dimmed">
              Link folders you already have on your machine
            </Text>
          </Stack>
        </GlassCard>
      </SimpleGrid>
    </Stack>
  );

  const renderStep1Template = () => (
    <Stack gap="lg">
      <Stack gap="xs">
        <Text size="sm" fw={500}>What type of app?</Text>
        <Text size="xs" c="dimmed">
          Select the project structure for your workspace
        </Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <GlassCard
          p="md"
          hoverable
          selected={templateType === 'frontend'}
          onClick={() => handleTemplateSelection('frontend')}
        >
          <Stack gap="sm" align="center" ta="center">
            <IconBrowser size={24} color="var(--mantine-color-blue-6)" />
            <Text fw={500}>Frontend Only</Text>
            <Text size="xs" c="dimmed">Vite React</Text>
          </Stack>
        </GlassCard>

        <GlassCard
          p="md"
          hoverable
          selected={templateType === 'backend'}
          onClick={() => handleTemplateSelection('backend')}
        >
          <Stack gap="sm" align="center" ta="center">
            <IconServer size={24} color="var(--mantine-color-green-6)" />
            <Text fw={500}>Backend Only</Text>
            <Text size="xs" c="dimmed">NestJS</Text>
          </Stack>
        </GlassCard>

        <GlassCard
          p="md"
          hoverable
          selected={templateType === 'fullstack'}
          onClick={() => handleTemplateSelection('fullstack')}
        >
          <Stack gap="sm" align="center" ta="center">
            <Group gap={4}>
              <IconBrowser size={20} color="var(--mantine-color-blue-6)" />
              <IconServer size={20} color="var(--mantine-color-green-6)" />
            </Group>
            <Text fw={500}>Fullstack</Text>
            <Text size="xs" c="dimmed">Both</Text>
          </Stack>
        </GlassCard>
      </SimpleGrid>

      {wizardProjects.length > 0 && (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">Projects to create:</Text>
          {wizardProjects.map(p => (
            <Text key={p.name} size="sm">{p.name}</Text>
          ))}
        </Stack>
      )}
    </Stack>
  );

  const renderStep1Existing = () => (
    <Stack gap="lg">
      <Stack gap="xs">
        <Text size="sm" fw={500}>Add existing projects</Text>
        <Text size="xs" c="dimmed">
          Link folders from your machine to this workspace
        </Text>
      </Stack>

      {wizardProjects.length > 0 && (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">Projects added:</Text>
          {wizardProjects.map(p => (
            <GlassCard key={p.name} p="sm">
              <Group justify="space-between">
                <Text size="sm" fw={500}>{p.name}</Text>
                <Text size="xs" c="dimmed">{p.config.path}</Text>
              </Group>
            </GlassCard>
          ))}
        </Stack>
      )}

      <Button
        variant="light"
        leftSection={<IconPlus size={14} />}
        onClick={() => setShowAddProjectModal(true)}
      >
        Add Project
      </Button>
    </Stack>
  );

  const renderStep2 = () => (
    <Stack gap="lg">
      <Stack gap="xs">
        <Text size="sm" fw={500}>Planning Context (Optional)</Text>
        <Text size="xs" c="dimmed">
          Add notes or guidelines that Orchy should follow when planning features for this workspace.
        </Text>
      </Stack>

      <GlassTextarea
        placeholder="Use the terminal/hacker aesthetic with green colors. All API responses should follow REST conventions. Use Prisma for database access."
        value={context}
        onChange={(e) => setContext(e.target.value)}
        minRows={4}
        autosize
        size="md"
      />

      <Text size="xs" c="dimmed">
        Examples: coding standards, design preferences, libraries to use, things to avoid
      </Text>
    </Stack>
  );

  const handleNext = () => {
    if (step === 0 && canProceedStep0) {
      setStep(1);
    } else if (step === 1 && canProceedStep1) {
      setStep(2);
    }
  };

  const handleBack = () => {
    if (step === 0) {
      onBack();
    } else {
      setStep(step - 1);
    }
  };

  return (
    <Container size="sm" pt={60} pb="xl">
      <Stack gap="xl">
        <Stack gap={4}>
          <Title order={2} style={{ letterSpacing: '-.02em' }}>
            Create Workspace
          </Title>
          <Text c="dimmed" size="sm">
            {step === 0 && 'Name your workspace and choose how to add projects'}
            {step === 1 && 'Configure your projects'}
            {step === 2 && 'Add optional planning context'}
          </Text>
        </Stack>

        <FormCard
          footer={
            <Group justify="space-between">
              <Button variant="subtle" onClick={handleBack}>
                {step === 0 ? 'Cancel' : 'Back'}
              </Button>
              {step < 2 ? (
                <Button
                  onClick={handleNext}
                  disabled={step === 0 ? !canProceedStep0 : !canProceedStep1}
                >
                  Continue
                </Button>
              ) : (
                <Button onClick={handleCreateWorkspace}>
                  Create Workspace
                </Button>
              )}
            </Group>
          }
        >
          {step === 0 && renderStep0()}
          {step === 1 && projectSource === 'template' && renderStep1Template()}
          {step === 1 && projectSource === 'existing' && renderStep1Existing()}
          {step === 2 && renderStep2()}
        </FormCard>
      </Stack>

      <AddProjectModal
        opened={showAddProjectModal}
        onClose={() => setShowAddProjectModal(false)}
        templates={templates}
        projects={projects}
        creatingProject={creatingProject}
        addingProject={addingProject}
        gitAvailable={gitAvailable}
        port={port}
        permissionsConfig={null}
        onCreateProject={onCreateProject}
        onAddProject={handleAddExistingProject}
      />
    </Container>
  );
}
