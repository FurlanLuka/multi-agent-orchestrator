import { useState, useEffect, useRef } from 'react';
import {
  Button,
  Stack,
  Text,
  Group,
  Card,
  Badge,
  Loader,
  Divider,
  Progress,
  Alert,
  SimpleGrid,
  Grid,
} from '@mantine/core';
import {
  GlassTextInput,
  GlassTextarea,
  GlassSelect,
  GlassMultiSelect,
  GlassSegmentedControl,
  StyledModal,
} from '../theme';
import { useForm } from '@mantine/form';
import {
  IconPlus,
  IconServer,
  IconBrowser,
  IconFolderPlus,
  IconGitBranch,
  IconAlertTriangle,
  IconPackage,
  IconHammer,
  IconPlayerPlay,
  IconTestPipe,
  IconTerminal2,
  IconShieldOff,
} from '@tabler/icons-react';
import type { ProjectTemplateConfig, ProjectTemplate, ProjectConfig } from '@orchy/types';

import { FeatureSection } from './FeatureSection';
import { DirectoryPicker } from './DirectoryPicker';
import { CollapsiblePermissions } from './CollapsiblePermissions';
import type { PermissionsConfig } from './CollapsiblePermissions';

interface AddProjectFormValues {
  name: string;
  path: string;
  installEnabled: boolean;
  installCommand: string;
  buildEnabled: boolean;
  buildCommand: string;
  devServerEnabled: boolean;
  devServerCommand: string;
  devServerReadyPattern: string;
  devServerUrl: string;
  setupEnabled: boolean;
  setupCommand: string;
  hasE2E: boolean;
  e2eInstructions: string;
  dependsOn: string[];
  gitEnabled: boolean;
  mainBranch: string;
  dangerouslyAllowAll: boolean;
  permissions: string[];
}

interface TemplateFormValues {
  name: string;
  targetPath: string;
  template: ProjectTemplate | null;
}

export interface AddProjectOptions {
  name: string;
  path: string;
  devServerEnabled?: boolean;
  devServer?: {
    command: string;
    readyPattern: string;
    env?: Record<string, string>;
    url?: string;
  };
  buildEnabled?: boolean;
  buildCommand?: string;
  installEnabled?: boolean;
  installCommand?: string;
  setupCommand?: string;
  hasE2E?: boolean;
  e2eInstructions?: string;
  dependsOn?: string[];
  gitEnabled?: boolean;
  mainBranch?: string;
  permissions?: {
    dangerouslyAllowAll?: boolean;
    allow: string[];
  };
}

export interface CreateProjectOptions {
  name: string;
  targetPath: string;
  template: ProjectTemplate;
  // Optional permissions override (otherwise uses template default)
  permissions?: {
    dangerouslyAllowAll?: boolean;
    allow: string[];
  };
}

interface AddProjectModalProps {
  opened: boolean;
  onClose: () => void;
  templates: ProjectTemplateConfig[];
  projects: Record<string, ProjectConfig>;
  creatingProject: boolean;
  addingProject: boolean;
  gitAvailable: boolean;
  port: number;
  permissionsConfig: PermissionsConfig | null;
  createProjectError?: string | null;
  onClearCreateProjectError?: () => void;
  onCreateProject: (options: CreateProjectOptions) => void;
  onAddProject: (options: AddProjectOptions) => void;
  orchyManaged?: boolean;  // If true, only allow template-based projects
}

export function AddProjectModal({
  opened,
  onClose,
  templates,
  projects,
  creatingProject,
  addingProject,
  gitAvailable,
  port,
  permissionsConfig,
  createProjectError,
  onClearCreateProjectError,
  onCreateProject,
  onAddProject,
  orchyManaged = false,
}: AddProjectModalProps) {
  // For Orchy Managed workspaces, only allow template mode
  const [formMode, setFormMode] = useState<'template' | 'existing'>(orchyManaged ? 'template' : 'existing');
  const [addPermissionsExpanded, setAddPermissionsExpanded] = useState(false);
  const [creatingName, setCreatingName] = useState<string | null>(null);

  const isLoading = creatingProject || addingProject;

  // Add project form - all toggles OFF by default
  const addForm = useForm<AddProjectFormValues>({
    initialValues: {
      name: '',
      path: '',
      installEnabled: false,
      installCommand: 'npm install',
      buildEnabled: false,
      buildCommand: 'npm run build',
      devServerEnabled: false,
      devServerCommand: 'npm run dev',
      devServerReadyPattern: 'ready|listening|started|compiled',
      devServerUrl: '',
      setupEnabled: false,
      setupCommand: '',
      hasE2E: false,
      e2eInstructions: '',
      dependsOn: [],
      gitEnabled: false,
      mainBranch: 'main',
      dangerouslyAllowAll: false,
      permissions: [],
    },
    validate: {
      name: (value) => value.trim() ? null : 'Project name is required',
      path: (value) => value.trim() ? null : 'Project path is required',
      installCommand: (value, values) => values.installEnabled && !value.trim() ? 'Command is required' : null,
      buildCommand: (value, values) => values.buildEnabled && !value.trim() ? 'Command is required' : null,
      devServerCommand: (value, values) => values.devServerEnabled && !value.trim() ? 'Command is required' : null,
      devServerUrl: (value, values) => values.devServerEnabled && !value.trim() ? 'URL is required' : null,
      setupCommand: (value, values) => values.setupEnabled && !value.trim() ? 'Command is required' : null,
      mainBranch: (value, values) => values.gitEnabled && !value.trim() ? 'Main branch is required' : null,
    },
  });

  // Template form - simplified to just template, name, path
  const templateForm = useForm<TemplateFormValues>({
    initialValues: {
      name: '',
      targetPath: '',
      template: null,
    },
    validate: {
      name: (value) => value.trim() ? null : 'Project name is required',
      targetPath: (value) => value.trim() ? null : 'Target path is required',
      template: (value) => value ? null : 'Please select a template',
    },
  });

  // Track when creation completes - only close modal on success (no error)
  const prevIsLoadingRef = useRef(isLoading);
  useEffect(() => {
    if (prevIsLoadingRef.current && !isLoading && creatingName && !createProjectError) {
      setCreatingName(null);
      addForm.reset();
      templateForm.reset();
      onClose();
    }
    prevIsLoadingRef.current = isLoading;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, creatingName, createProjectError]);

  // Clear error when modal is closed
  const handleClose = () => {
    onClearCreateProjectError?.();
    setCreatingName(null);
    onClose();
  };

  const handleCreateFromTemplate = () => {
    const validation = templateForm.validate();
    if (!validation.hasErrors) {
      const values = templateForm.values;
      setCreatingName(values.name.trim());
      onClearCreateProjectError?.();

      onCreateProject({
        name: values.name.trim(),
        targetPath: values.targetPath.trim(),
        template: values.template!,
        // Optional permissions override from config
        permissions: permissionsConfig?.templates[values.template!]
          ? { allow: permissionsConfig.templates[values.template!] }
          : undefined,
      });
    }
  };

  const handleAddExisting = () => {
    const validation = addForm.validate();
    if (!validation.hasErrors) {
      const values = addForm.values;
      setCreatingName(values.name.trim());
      onClearCreateProjectError?.();
      onAddProject({
        name: values.name.trim(),
        path: values.path.trim(),
        installEnabled: values.installEnabled,
        installCommand: values.installCommand.trim() || undefined,
        buildEnabled: values.buildEnabled,
        buildCommand: values.buildCommand.trim() || undefined,
        devServerEnabled: values.devServerEnabled,
        devServer: values.devServerEnabled ? {
          command: values.devServerCommand.trim(),
          readyPattern: values.devServerReadyPattern.trim() || 'ready|listening|started|compiled',
          url: values.devServerUrl.trim(),
        } : undefined,
        setupCommand: values.setupEnabled ? values.setupCommand.trim() : undefined,
        hasE2E: values.hasE2E,
        e2eInstructions: values.e2eInstructions.trim() || undefined,
        dependsOn: values.dependsOn.length > 0 ? values.dependsOn : undefined,
        gitEnabled: values.gitEnabled,
        mainBranch: values.mainBranch.trim() || 'main',
        permissions: values.dangerouslyAllowAll
          ? { dangerouslyAllowAll: true, allow: [] }
          : { allow: values.permissions },
      });
    }
  };

  const templateOptions = templates.map(t => ({
    value: t.name,
    label: t.displayName,
  }));

  const selectedTemplateConfig = templates.find(t => t.name === templateForm.values.template);

  const footerContent = formMode === 'existing' ? (
    <Group justify="flex-end">
      <Button variant="subtle" onClick={handleClose}>
        Cancel
      </Button>
      <Button
        onClick={handleAddExisting}
        disabled={!addForm.values.name.trim() || !addForm.values.path.trim() || isLoading}
        loading={isLoading && formMode === 'existing'}
        leftSection={<IconFolderPlus size={14} />}
      >
        Add Project
      </Button>
    </Group>
  ) : (
    <Group justify="flex-end">
      <Button variant="subtle" onClick={handleClose}>
        Cancel
      </Button>
      <Button
        onClick={handleCreateFromTemplate}
        disabled={!templateForm.values.name.trim() || !templateForm.values.targetPath.trim() || !templateForm.values.template || isLoading}
        loading={isLoading && formMode === 'template'}
        leftSection={<IconPlus size={14} />}
      >
        Create Project
      </Button>
    </Group>
  );

  return (
    <StyledModal opened={opened} onClose={handleClose} title="Add Project" size="lg" footer={footerContent}>
      <Stack gap="md">
        {/* Error alert */}
        {createProjectError && (
          <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light" radius="md">
            {createProjectError}
          </Alert>
        )}

        {/* Loading indicator */}
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
            </Stack>
          </Card>
        )}

        {/* Mode toggle - hidden for Orchy Managed workspaces */}
        {!orchyManaged && (
          <GlassSegmentedControl
            value={formMode}
            onChange={(v) => setFormMode(v as 'template' | 'existing')}
            data={[
              { label: 'Add Existing', value: 'existing' },
              { label: 'From Template', value: 'template' },
            ]}
            fullWidth
          />
        )}

        {/* Orchy Managed info */}
        {orchyManaged && (
          <Alert icon={<IconAlertTriangle size={16} />} color="lavender" variant="light" radius="md">
            This is an Orchy Managed workspace. New projects can only be added from templates to maintain the unified repository structure.
          </Alert>
        )}

        {/* Add Existing Project Form */}
        {formMode === 'existing' && (
          <>
            <Grid>
              <Grid.Col span={6}>
                <GlassTextInput
                  label="Project Name"
                  placeholder="e.g., my-api"
                  {...addForm.getInputProps('name')}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <DirectoryPicker
                  label="Project Path"
                  placeholder="~/Documents/my-api"
                  value={addForm.values.path}
                  onChange={(path) => addForm.setFieldValue('path', path)}
                  error={addForm.errors.path as string | undefined}
                  port={port}
                />
              </Grid.Col>
            </Grid>

            <Divider label="Features" labelPosition="left" />

            <SimpleGrid cols={2} style={{ alignItems: 'flex-start' }}>
              <FeatureSection
                label="Install"
                description="Run after each task"
                icon={<IconPackage size={16} color="var(--mantine-color-blue-6)" />}
                enabled={addForm.values.installEnabled}
                onToggle={(v) => addForm.setFieldValue('installEnabled', v)}
              >
                <GlassTextInput
                  label="Command"
                  placeholder="npm install"
                  {...addForm.getInputProps('installCommand')}
                  size="xs"
                  required
                />
              </FeatureSection>

              <FeatureSection
                label="Build"
                description="Verify compilation"
                icon={<IconHammer size={16} color="var(--mantine-color-orange-6)" />}
                enabled={addForm.values.buildEnabled}
                onToggle={(v) => addForm.setFieldValue('buildEnabled', v)}
              >
                <GlassTextInput
                  label="Command"
                  placeholder="npm run build"
                  {...addForm.getInputProps('buildCommand')}
                  size="xs"
                  required
                />
              </FeatureSection>

              <FeatureSection
                label="Dev Server"
                description="Live testing"
                icon={<IconPlayerPlay size={16} color="var(--mantine-color-green-6)" />}
                enabled={addForm.values.devServerEnabled}
                onToggle={(v) => addForm.setFieldValue('devServerEnabled', v)}
              >
                <GlassTextInput
                  label="Command"
                  placeholder="npm run dev"
                  {...addForm.getInputProps('devServerCommand')}
                  size="xs"
                  required
                />
                <GlassTextInput
                  label="URL"
                  placeholder="http://localhost:3000"
                  {...addForm.getInputProps('devServerUrl')}
                  size="xs"
                  required
                />
              </FeatureSection>

              <FeatureSection
                label="E2E Testing"
                description="Agent-driven verification"
                icon={<IconTestPipe size={16} color="var(--mantine-color-violet-6)" />}
                enabled={addForm.values.hasE2E}
                onToggle={(v) => addForm.setFieldValue('hasE2E', v)}
              >
                <GlassTextarea
                  label="Instructions"
                  placeholder="Testing instructions..."
                  {...addForm.getInputProps('e2eInstructions')}
                  minRows={2}
                  size="xs"
                />
                {Object.keys(projects).length > 0 && (
                  <GlassMultiSelect
                    label="Depends On"
                    description="E2E will wait for these projects to complete first"
                    placeholder="Select projects..."
                    data={Object.keys(projects).map(name => ({ value: name, label: name }))}
                    value={addForm.values.dependsOn}
                    onChange={(v) => addForm.setFieldValue('dependsOn', v)}
                    size="xs"
                    clearable
                  />
                )}
              </FeatureSection>
            </SimpleGrid>

            <FeatureSection
              label="Setup Command"
              description="Run once on project setup"
              icon={<IconTerminal2 size={16} color="var(--mantine-color-cyan-6)" />}
              enabled={addForm.values.setupEnabled}
              onToggle={(v) => addForm.setFieldValue('setupEnabled', v)}
            >
              <GlassTextInput
                label="Command"
                placeholder="claude mcp add playwright -- npx @playwright/mcp@latest"
                {...addForm.getInputProps('setupCommand')}
                size="xs"
                required
              />
            </FeatureSection>

            <FeatureSection
              label="Git Integration"
              description="Feature branches and auto-commit"
              icon={<IconGitBranch size={16} color="var(--mantine-color-grape-6)" />}
              enabled={addForm.values.gitEnabled}
              onToggle={(v) => addForm.setFieldValue('gitEnabled', v)}
            >
              {!gitAvailable && (
                <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light">
                  Git CLI not found.
                </Alert>
              )}
              <GlassTextInput
                label="Main Branch"
                placeholder="main"
                {...addForm.getInputProps('mainBranch')}
                size="xs"
                required
              />
            </FeatureSection>

            <FeatureSection
              label="Dangerously Allow All"
              description="Skip all permission checks (not recommended)"
              icon={<IconShieldOff size={16} color="var(--mantine-color-red-6)" />}
              enabled={addForm.values.dangerouslyAllowAll}
              onToggle={(v) => addForm.setFieldValue('dangerouslyAllowAll', v)}
            >
              <Alert icon={<IconAlertTriangle size={16} />} color="rose" variant="light" radius="md">
                All permission checks will be skipped. The agent can execute any command without restrictions.
              </Alert>
            </FeatureSection>

            <CollapsiblePermissions
              expanded={addPermissionsExpanded}
              onToggle={() => setAddPermissionsExpanded(!addPermissionsExpanded)}
              permissions={addForm.values.permissions}
              onPermissionsChange={(p) => addForm.setFieldValue('permissions', p)}
              permissionsConfig={permissionsConfig}
              disabled={addForm.values.dangerouslyAllowAll}
            />
          </>
        )}

        {/* Create from Template Form */}
        {formMode === 'template' && (
          <>
            <GlassSelect
              label="Template"
              placeholder="Select a template"
              data={templateOptions}
              value={templateForm.values.template}
              onChange={(v) => templateForm.setFieldValue('template', v as ProjectTemplate)}
              leftSection={templateForm.values.template?.includes('frontend') ? <IconBrowser size={16} /> : <IconServer size={16} />}
            />

            {selectedTemplateConfig && (
              <Card padding="sm" withBorder bg="gray.0">
                <Text size="sm">{selectedTemplateConfig.description}</Text>
                <Group gap="xs" mt="xs">
                  {selectedTemplateConfig.config.devServer && (
                    <>
                      <Badge size="xs" variant="outline">{selectedTemplateConfig.config.devServer.command}</Badge>
                      {selectedTemplateConfig.config.devServer.url && (
                        <Badge size="xs" variant="outline">{selectedTemplateConfig.config.devServer.url}</Badge>
                      )}
                    </>
                  )}
                  {selectedTemplateConfig.config.hasE2E && (
                    <Badge size="xs" variant="outline" color="peach">E2E</Badge>
                  )}
                  {selectedTemplateConfig.config.gitEnabled && (
                    <Badge size="xs" variant="outline" color="grape">Git</Badge>
                  )}
                </Group>
              </Card>
            )}

            <Grid>
              <Grid.Col span={6}>
                <GlassTextInput
                  label="Project Name"
                  placeholder="e.g., my-backend"
                  {...templateForm.getInputProps('name')}
                />
              </Grid.Col>
              <Grid.Col span={6}>
                <DirectoryPicker
                  label="Project Path"
                  placeholder="~/Documents"
                  value={templateForm.values.targetPath}
                  onChange={(path) => templateForm.setFieldValue('targetPath', path)}
                  error={templateForm.errors.targetPath as string | undefined}
                  port={port}
                />
              </Grid.Col>
            </Grid>
          </>
        )}
      </Stack>
    </StyledModal>
  );
}
