import { useState, useEffect } from 'react';
import {
  Container,
  Stack,
  Button,
  Text,
  Title,
  Group,
  SimpleGrid,
  ThemeIcon,
  Loader,
  Alert,
  Select,
} from '@mantine/core';
import {
  IconFolder,
  IconRocket,
  IconBrowser,
  IconServer,
  IconStack2,
  IconPalette,
  IconAlertCircle,
} from '@tabler/icons-react';
import type { SavedDesignFolder } from '@orchy/types';
import {
  FormCard,
  GlassCard,
  GlassTextInput,
  GlassTextarea,
} from '../../theme';

type WorkspaceMode = 'empty' | 'template';
type AppType = 'frontend' | 'backend' | 'fullstack';

interface CreateWorkspaceViewProps {
  creatingProject?: boolean;
  port?: number | null;
  error?: string | null;
  onClearError?: () => void;
  onBack: () => void;
  onCreateEmpty: (name: string, context?: string) => void;
  onCreateFromTemplate: (appName: string, selectedTemplates: string[], context?: string, designName?: string) => void;
  onGoToDesigner?: () => void;
}

export function CreateWorkspaceView({
  creatingProject = false,
  port,
  error,
  onClearError,
  onBack,
  onCreateEmpty,
  onCreateFromTemplate,
  onGoToDesigner,
}: CreateWorkspaceViewProps) {
  const [name, setName] = useState('');
  const [context, setContext] = useState('');
  const [mode, setMode] = useState<WorkspaceMode>('template');
  const [appType, setAppType] = useState<AppType>('fullstack');
  const [selectedDesign, setSelectedDesign] = useState<string | null>(null);
  const [savedDesigns, setSavedDesigns] = useState<SavedDesignFolder[]>([]);

  const effectivePort = port ?? (window as unknown as { __ORCHESTRATOR_PORT__?: number }).__ORCHESTRATOR_PORT__ ?? 3456;

  // Fetch saved designs for template mode
  useEffect(() => {
    if (mode === 'template') {
      fetch(`http://localhost:${effectivePort}/api/designs`)
        .then(res => res.json())
        .then(data => setSavedDesigns(data.designs || []))
        .catch(err => console.error('Failed to fetch designs:', err));
    }
  }, [mode, effectivePort]);

  // Map app type to templates
  const getTemplatesForAppType = (type: AppType): string[] => {
    switch (type) {
      case 'frontend':
        return ['vite-frontend'];
      case 'backend':
        return ['nestjs-backend'];
      case 'fullstack':
        return ['vite-frontend', 'nestjs-backend'];
    }
  };

  const selectedTemplates = getTemplatesForAppType(appType);
  const hasFrontend = appType === 'frontend' || appType === 'fullstack';

  // Sanitize workspace name to valid app name (lowercase, alphanumeric with hyphens)
  const appName = name.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');

  const handleCreate = () => {
    if (!name.trim()) return;

    if (mode === 'empty') {
      onCreateEmpty(name.trim(), context.trim() || undefined);
    } else if (mode === 'template' && appName) {
      onCreateFromTemplate(
        appName,
        selectedTemplates,
        context.trim() || undefined,
        hasFrontend ? selectedDesign || undefined : undefined
      );
    }
  };

  const isValid = mode === 'empty'
    ? name.trim().length > 0
    : name.trim().length > 0 && appName.length > 0;

  // Parse error message for user-friendly display
  const getErrorMessage = (err: string) => {
    if (err.includes('already exists')) {
      return {
        title: 'Name already taken',
        message: `A workspace or project with this name already exists. Please choose a different name.`,
      };
    }
    if (err.includes('npm install failed') || err.includes('ENOENT')) {
      return {
        title: 'Installation failed',
        message: 'Failed to install dependencies. Please check your network connection and try again.',
      };
    }
    return {
      title: 'Failed to create workspace',
      message: err,
    };
  };

  const errorInfo = error ? getErrorMessage(error) : null;

  return (
    <Container size="sm" pt={60} pb="xl">
      <Stack gap="xl">
        {/* Page Header */}
        <Stack gap={4}>
          <Title order={2} style={{ letterSpacing: '-.02em' }}>
            Create Workspace
          </Title>
          <Text c="dimmed" size="sm">
            {mode === 'empty'
              ? 'Group existing projects together for easier session management'
              : 'Create a new app from templates with pre-configured projects'}
          </Text>
        </Stack>

        {/* Error Alert */}
        {errorInfo && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            title={errorInfo.title}
            color="red"
            withCloseButton
            onClose={onClearError}
          >
            {errorInfo.message}
          </Alert>
        )}

        {/* Form Card */}
        <FormCard
          footer={
            <Group justify="flex-end">
              <Button variant="subtle" onClick={onBack}>
                Cancel
              </Button>
              <Button
                leftSection={
                  creatingProject
                    ? <Loader size={18} color="white" />
                    : (mode === 'template' ? <IconRocket size={18} /> : undefined)
                }
                onClick={handleCreate}
                disabled={!isValid || creatingProject}
                loading={creatingProject}
              >
                {creatingProject ? 'Creating...' : 'Create Workspace'}
              </Button>
            </Group>
          }
        >
          <Stack gap="lg">
            {/* Workspace Name */}
            <GlassTextInput
              label="Workspace Name"
              placeholder="e.g., my-blog, e-commerce, dashboard"
              description={mode === 'template' ? 'Also used as the prefix for project names' : undefined}
              value={name}
              onChange={(e) => setName(e.target.value)}
              size="md"
              required
            />

            {/* Mode Selection */}
            <Stack gap="xs">
              <Text fw={500} size="sm">
                Workspace Type
              </Text>
              <SimpleGrid cols={2} spacing="sm">
                <GlassCard
                  p="md"
                  style={{
                    cursor: 'pointer',
                    border: mode === 'template'
                      ? '2px solid var(--mantine-color-peach-5)'
                      : '1px solid var(--border-subtle)',
                    opacity: mode === 'template' ? 1 : 0.7,
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => setMode('template')}
                >
                  <Stack gap="xs" align="center">
                    <ThemeIcon size="lg" radius="md" color="peach" variant="light">
                      <IconRocket size={20} />
                    </ThemeIcon>
                    <Stack gap={0} align="center">
                      <Text size="sm" fw={500}>From Template</Text>
                      <Text size="xs" c="dimmed" ta="center">Create new projects from templates</Text>
                    </Stack>
                  </Stack>
                </GlassCard>

                <GlassCard
                  p="md"
                  style={{
                    cursor: 'pointer',
                    border: mode === 'empty'
                      ? '2px solid var(--mantine-color-peach-5)'
                      : '1px solid var(--border-subtle)',
                    opacity: mode === 'empty' ? 1 : 0.7,
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => setMode('empty')}
                >
                  <Stack gap="xs" align="center">
                    <ThemeIcon size="lg" radius="md" color="lavender" variant="light">
                      <IconFolder size={20} />
                    </ThemeIcon>
                    <Stack gap={0} align="center">
                      <Text size="sm" fw={500}>Empty Workspace</Text>
                      <Text size="xs" c="dimmed" ta="center">Add existing projects manually</Text>
                    </Stack>
                  </Stack>
                </GlassCard>
              </SimpleGrid>
            </Stack>

            {/* Template Mode Options */}
            {mode === 'template' && (
              <>
                {/* Project Name Preview */}
                {appName && (
                  <Text size="xs" c="dimmed">
                    Creates{' '}
                    {selectedTemplates.map((t, i) => (
                      <span key={t}>
                        <Text span fw={500} c="peach.6">
                          {appName}-{t.includes('frontend') ? 'frontend' : t.includes('backend') ? 'backend' : t}
                        </Text>
                        {i < selectedTemplates.length - 1 && ' and '}
                      </span>
                    ))}
                    {' '}in ~/orchy/{appName}/
                  </Text>
                )}

                {/* App Type Selection */}
                <Stack gap="xs">
                  <Stack gap={2}>
                    <Text fw={500} size="sm">
                      Application Type
                    </Text>
                    <Text size="xs" c="dimmed">
                      Choose what kind of app to create
                    </Text>
                  </Stack>
                  <SimpleGrid cols={3} spacing="sm">
                    {([
                      { type: 'backend' as AppType, label: 'Backend', icon: <IconServer size={20} />, color: 'lavender', desc: 'API only' },
                      { type: 'frontend' as AppType, label: 'Frontend', icon: <IconBrowser size={20} />, color: 'peach', desc: 'UI only' },
                      { type: 'fullstack' as AppType, label: 'Fullstack', icon: <IconStack2 size={20} />, color: 'sage', desc: 'Both' },
                    ]).map(({ type, label, icon, color, desc }) => (
                      <GlassCard
                        key={type}
                        p="sm"
                        style={{
                          cursor: 'pointer',
                          border: appType === type
                            ? '2px solid var(--mantine-color-peach-5)'
                            : '1px solid var(--border-subtle)',
                          opacity: appType === type ? 1 : 0.7,
                          transition: 'all 0.15s ease',
                        }}
                        onClick={() => setAppType(type)}
                      >
                        <Stack gap="xs" align="center">
                          <ThemeIcon size="lg" radius="md" color={color} variant="light">
                            {icon}
                          </ThemeIcon>
                          <Stack gap={0} align="center">
                            <Text size="sm" fw={500}>{label}</Text>
                            <Text size="xs" c="dimmed">{desc}</Text>
                          </Stack>
                        </Stack>
                      </GlassCard>
                    ))}
                  </SimpleGrid>
                </Stack>

                {/* Design System Selection */}
                {hasFrontend && (
                  <GlassCard p="sm">
                    <Group gap="sm" wrap="nowrap">
                      <ThemeIcon size="md" radius="md" color="grape" variant="light">
                        <IconPalette size={16} />
                      </ThemeIcon>
                      <Stack gap={0} style={{ flex: 1 }}>
                        <Text size="sm" fw={500}>Design System</Text>
                        <Text size="xs" c="dimmed">Optionally attach a design to the frontend</Text>
                      </Stack>
                      <Group gap="xs" wrap="nowrap">
                        {savedDesigns.length > 0 && (
                          <Select
                            placeholder="None"
                            data={savedDesigns.map(d => ({ value: d.name, label: d.name }))}
                            value={selectedDesign}
                            onChange={setSelectedDesign}
                            clearable
                            size="xs"
                            style={{ width: 140 }}
                          />
                        )}
                        {onGoToDesigner && (
                          <Button
                            size="xs"
                            variant="light"
                            color="grape"
                            onClick={onGoToDesigner}
                          >
                            {savedDesigns.length > 0 ? 'New' : 'Create Design'}
                          </Button>
                        )}
                      </Group>
                    </Group>
                  </GlassCard>
                )}
              </>
            )}

            {/* Context - shown for both modes */}
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

            {mode === 'empty' && (
              <Text size="sm" c="dimmed">
                After creating the workspace, add projects from the workspace screen.
              </Text>
            )}
          </Stack>
        </FormCard>
      </Stack>
    </Container>
  );
}
