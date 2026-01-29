import { useState, useEffect } from 'react';
import {
  TextInput,
  Textarea,
  Button,
  Stack,
  Divider,
  Alert,
  SimpleGrid,
  MultiSelect,
  Group,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
  IconFolder,
  IconDeviceFloppy,
  IconGitBranch,
  IconAlertTriangle,
  IconPackage,
  IconHammer,
  IconPlayerPlay,
  IconTestPipe,
  IconTerminal2,
  IconShieldOff,
} from '@tabler/icons-react';
import type { ProjectConfig } from '@orchy/types';
import { StyledModal } from '../theme';

import { FeatureSection } from './FeatureSection';
import { CollapsiblePermissions } from './CollapsiblePermissions';
import type { PermissionsConfig } from './CollapsiblePermissions';

interface EditProjectFormValues {
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

interface EditProjectModalProps {
  opened: boolean;
  onClose: () => void;
  projectName: string | null;
  projectConfig: ProjectConfig | null;
  projects: Record<string, ProjectConfig>;
  gitAvailable: boolean;
  permissionsConfig: PermissionsConfig | null;
  onSave: (name: string, updates: Partial<ProjectConfig>) => void;
}

export function EditProjectModal({
  opened,
  onClose,
  projectName,
  projectConfig,
  projects,
  gitAvailable,
  permissionsConfig,
  onSave,
}: EditProjectModalProps) {
  const [permissionsExpanded, setPermissionsExpanded] = useState(false);

  const form = useForm<EditProjectFormValues>({
    initialValues: {
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
      installCommand: (value, values) => values.installEnabled && !value.trim() ? 'Command is required' : null,
      buildCommand: (value, values) => values.buildEnabled && !value.trim() ? 'Command is required' : null,
      devServerCommand: (value, values) => values.devServerEnabled && !value.trim() ? 'Command is required' : null,
      devServerUrl: (value, values) => values.devServerEnabled && !value.trim() ? 'URL is required' : null,
      setupCommand: (value, values) => values.setupEnabled && !value.trim() ? 'Command is required' : null,
      mainBranch: (value, values) => values.gitEnabled && !value.trim() ? 'Main branch is required' : null,
    },
  });

  // Populate form when project changes
  useEffect(() => {
    if (projectConfig && opened) {
      setPermissionsExpanded(false);
      form.setValues({
        installEnabled: projectConfig.installEnabled ?? false,
        installCommand: projectConfig.installCommand || 'npm install',
        buildEnabled: projectConfig.buildEnabled ?? !!projectConfig.buildCommand,
        buildCommand: projectConfig.buildCommand || 'npm run build',
        devServerEnabled: projectConfig.devServerEnabled ?? true,
        devServerCommand: projectConfig.devServer?.command || 'npm run dev',
        devServerReadyPattern: projectConfig.devServer?.readyPattern || 'ready|listening|started|compiled',
        devServerUrl: projectConfig.devServer?.url || '',
        setupEnabled: !!projectConfig.setupCommand,
        setupCommand: projectConfig.setupCommand || '',
        hasE2E: projectConfig.hasE2E || false,
        e2eInstructions: projectConfig.e2eInstructions || '',
        dependsOn: projectConfig.dependsOn || [],
        gitEnabled: projectConfig.gitEnabled || false,
        mainBranch: projectConfig.mainBranch || 'main',
        permissions: projectConfig.permissions?.allow || [],
        dangerouslyAllowAll: projectConfig.permissions?.dangerouslyAllowAll || false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectConfig, opened]);

  const handleSave = () => {
    if (!projectName || !projectConfig) return;
    const values = form.values;
    onSave(projectName, {
      installEnabled: values.installEnabled,
      installCommand: values.installCommand.trim() || undefined,
      buildEnabled: values.buildEnabled,
      buildCommand: values.buildCommand.trim() || undefined,
      devServerEnabled: values.devServerEnabled,
      devServer: {
        command: values.devServerCommand.trim(),
        readyPattern: values.devServerReadyPattern.trim() || 'ready|listening|started|compiled',
        env: projectConfig.devServer?.env || {},
        url: values.devServerUrl.trim(),
      },
      setupCommand: values.setupEnabled ? values.setupCommand.trim() : undefined,
      hasE2E: values.hasE2E,
      e2eInstructions: values.e2eInstructions.trim() || undefined,
      dependsOn: values.dependsOn.length > 0 ? values.dependsOn : undefined,
      gitEnabled: values.gitEnabled,
      mainBranch: values.mainBranch.trim() || 'main',
      permissions: {
        dangerouslyAllowAll: values.dangerouslyAllowAll,
        allow: values.permissions,
      },
    } as Partial<ProjectConfig>);
    form.reset();
    onClose();
  };

  const handleClose = () => {
    form.reset();
    onClose();
  };

  return (
    <StyledModal
      opened={opened}
      onClose={handleClose}
      title={projectName ? `Edit: ${projectName}` : 'Edit Project'}
      size="lg"
      footer={
        <Group justify="flex-end">
          <Button variant="subtle" onClick={handleClose}>
            Cancel
          </Button>
          <Button leftSection={<IconDeviceFloppy size={14} />} onClick={handleSave}>
            Save Changes
          </Button>
        </Group>
      }
    >
      {projectName && projectConfig && (
        <Stack gap="md">
          <TextInput
            label="Project Path"
            value={projectConfig.path}
            disabled
            leftSection={<IconFolder size={16} />}
          />

          <Divider label="Features" labelPosition="left" />

          <SimpleGrid cols={2}>
            <FeatureSection
              label="Install"
              description="Run after each task"
              icon={<IconPackage size={16} color="var(--mantine-color-blue-6)" />}
              enabled={form.values.installEnabled}
              onToggle={(v) => form.setFieldValue('installEnabled', v)}
            >
              <TextInput
                label="Command"
                placeholder="npm install"
                {...form.getInputProps('installCommand')}
                size="xs"
                required
              />
            </FeatureSection>

            <FeatureSection
              label="Build"
              description="Verify compilation"
              icon={<IconHammer size={16} color="var(--mantine-color-orange-6)" />}
              enabled={form.values.buildEnabled}
              onToggle={(v) => form.setFieldValue('buildEnabled', v)}
            >
              <TextInput
                label="Command"
                placeholder="npm run build"
                {...form.getInputProps('buildCommand')}
                size="xs"
                required
              />
            </FeatureSection>

            <FeatureSection
              label="Dev Server"
              description="Live testing"
              icon={<IconPlayerPlay size={16} color="var(--mantine-color-green-6)" />}
              enabled={form.values.devServerEnabled}
              onToggle={(v) => form.setFieldValue('devServerEnabled', v)}
            >
              <TextInput
                label="Command"
                placeholder="npm run dev"
                {...form.getInputProps('devServerCommand')}
                size="xs"
                required
              />
              <TextInput
                label="URL"
                placeholder="http://localhost:3000"
                {...form.getInputProps('devServerUrl')}
                size="xs"
                required
              />
            </FeatureSection>

            <FeatureSection
              label="E2E Testing"
              description="Agent-driven verification"
              icon={<IconTestPipe size={16} color="var(--mantine-color-violet-6)" />}
              enabled={form.values.hasE2E}
              onToggle={(v) => form.setFieldValue('hasE2E', v)}
            >
              <Textarea
                label="Instructions"
                placeholder="Testing instructions..."
                {...form.getInputProps('e2eInstructions')}
                minRows={2}
                size="xs"
              />
              {Object.keys(projects).filter(name => name !== projectName).length > 0 && (
                <MultiSelect
                  label="Depends On"
                  description="E2E will wait for these projects to complete first"
                  placeholder="Select projects..."
                  data={Object.keys(projects)
                    .filter(name => name !== projectName)
                    .map(name => ({ value: name, label: name }))}
                  value={form.values.dependsOn}
                  onChange={(v) => form.setFieldValue('dependsOn', v)}
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
            enabled={form.values.setupEnabled}
            onToggle={(v) => form.setFieldValue('setupEnabled', v)}
          >
            <TextInput
              label="Command"
              placeholder="claude mcp add playwright -- npx @playwright/mcp@latest"
              {...form.getInputProps('setupCommand')}
              size="xs"
              required
            />
          </FeatureSection>

          <FeatureSection
            label="Git Integration"
            description="Feature branches and auto-commit"
            icon={<IconGitBranch size={16} color="var(--mantine-color-grape-6)" />}
            enabled={form.values.gitEnabled}
            onToggle={(v) => form.setFieldValue('gitEnabled', v)}
          >
            {!gitAvailable && (
              <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light">
                Git CLI not found.
              </Alert>
            )}
            <TextInput
              label="Main Branch"
              placeholder="main"
              {...form.getInputProps('mainBranch')}
              size="xs"
              required
            />
          </FeatureSection>

          <FeatureSection
            label="Dangerously Allow All"
            description="Skip all permission checks (not recommended)"
            icon={<IconShieldOff size={16} color="var(--mantine-color-red-6)" />}
            enabled={form.values.dangerouslyAllowAll}
            onToggle={(v) => form.setFieldValue('dangerouslyAllowAll', v)}
          >
            <Alert icon={<IconAlertTriangle size={16} />} color="rose" variant="light" radius="md">
              All permission checks will be skipped. The agent can execute any command without restrictions.
            </Alert>
          </FeatureSection>

          {!form.values.dangerouslyAllowAll && (
            <CollapsiblePermissions
              expanded={permissionsExpanded}
              onToggle={() => setPermissionsExpanded(!permissionsExpanded)}
              permissions={form.values.permissions}
              onPermissionsChange={(p) => form.setFieldValue('permissions', p)}
              permissionsConfig={permissionsConfig}
            />
          )}
        </Stack>
      )}
    </StyledModal>
  );
}
