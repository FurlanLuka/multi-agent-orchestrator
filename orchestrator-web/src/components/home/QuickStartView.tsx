import { useState, useEffect } from 'react';
import {
  Container,
  Stack,
  Text,
  Title,
  Button,
  SimpleGrid,
  Loader,
  Group,
  ThemeIcon,
  Select,
} from '@mantine/core';
import {
  IconRocket,
  IconBrowser,
  IconServer,
  IconStack2,
  IconPalette,
} from '@tabler/icons-react';
import type { SavedDesignFolder } from '@orchy/types';
import { FormCard, GlassCard, GlassTextInput, GlassTextarea } from '../../theme';

type AppType = 'frontend' | 'backend' | 'fullstack';

interface QuickStartViewProps {
  creatingProject: boolean;
  port?: number | null;
  onBack: () => void;
  onStart: (appName: string, feature: string, selectedTemplates: string[], designName?: string) => void;
  onGoToDesigner?: () => void;
}

export function QuickStartView({
  creatingProject,
  port,
  onBack,
  onStart,
  onGoToDesigner,
}: QuickStartViewProps) {
  const [appName, setAppName] = useState('');
  const [feature, setFeature] = useState('');
  const [appType, setAppType] = useState<AppType>('fullstack');
  const [selectedDesign, setSelectedDesign] = useState<string | null>(null);
  const [savedDesigns, setSavedDesigns] = useState<SavedDesignFolder[]>([]);

  const effectivePort = port ?? (window as unknown as { __ORCHESTRATOR_PORT__?: number }).__ORCHESTRATOR_PORT__ ?? 3456;

  // Fetch saved designs
  useEffect(() => {
    fetch(`http://localhost:${effectivePort}/api/designs`)
      .then(res => res.json())
      .then(data => setSavedDesigns(data.designs || []))
      .catch(err => console.error('Failed to fetch designs:', err));
  }, [effectivePort]);

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

  const handleStart = () => {
    if (appName.trim() && feature.trim()) {
      onStart(appName.trim(), feature.trim(), selectedTemplates, hasFrontend ? selectedDesign || undefined : undefined);
    }
  };

  const isValid = appName.trim() && feature.trim();

  return (
    <Container size="sm" pt={60} pb="xl">
      <Stack gap="xl">
        {/* Page Header */}
        <Stack gap={4}>
          <Title order={2} style={{ letterSpacing: '-.02em' }}>
            Quick Start
          </Title>
          <Text c="dimmed" size="sm">
            Create a new app with projects, workspace, and start building
          </Text>
        </Stack>

        {/* Form Card */}
        <FormCard
          footer={
            <Group justify="flex-end">
              <Button variant="subtle" onClick={onBack}>
                Cancel
              </Button>
              <Button
                leftSection={creatingProject ? <Loader size={18} color="white" /> : <IconRocket size={18} />}
                disabled={!isValid || creatingProject}
                onClick={handleStart}
                loading={creatingProject}
              >
                {creatingProject ? 'Creating...' : 'Create & Start Building'}
              </Button>
            </Group>
          }
        >
          <Stack gap="lg">
            <GlassTextInput
              label="App Name"
              description="Used for project and workspace names"
              placeholder="my-awesome-app"
              value={appName}
              onChange={(e) => setAppName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            />

            {appName && (
              <Text size="xs" c="dimmed" mt={-12}>
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

            <GlassTextarea
              label="What do you want to build?"
              description="Describe the feature or app you want to create"
              placeholder="Build a todo app with user authentication, task CRUD operations, and a clean modern UI..."
              value={feature}
              onChange={(e) => setFeature(e.target.value)}
              minRows={4}
              autosize
            />
          </Stack>
        </FormCard>
      </Stack>
    </Container>
  );
}
