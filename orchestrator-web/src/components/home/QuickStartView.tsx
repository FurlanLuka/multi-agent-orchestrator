import { useState } from 'react';
import {
  Container,
  Stack,
  Title,
  Text,
  Button,
  Checkbox,
  SimpleGrid,
  Loader,
  ActionIcon,
  Group,
  ThemeIcon,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconRocket,
  IconBrowser,
  IconServer,
} from '@tabler/icons-react';
import { GlassCard, GlassTextInput, GlassTextarea } from '../../theme';

interface QuickStartViewProps {
  templates: { name: string; displayName: string; description: string }[];
  creatingProject: boolean;
  onBack: () => void;
  onStart: (appName: string, feature: string, selectedTemplates: string[]) => void;
}

export function QuickStartView({
  templates,
  creatingProject,
  onBack,
  onStart,
}: QuickStartViewProps) {
  const [appName, setAppName] = useState('');
  const [feature, setFeature] = useState('');
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>(['vite-frontend', 'nestjs-backend']);

  const getTemplateIcon = (name: string) => {
    if (name.includes('frontend') || name.includes('react') || name.includes('vue')) {
      return <IconBrowser size={16} />;
    }
    return <IconServer size={16} />;
  };

  const getTemplateColor = (name: string) => {
    if (name.includes('frontend') || name.includes('react')) return 'peach';
    if (name.includes('backend')) return 'lavender';
    return 'sage';
  };

  const toggleTemplate = (name: string) => {
    setSelectedTemplates(prev =>
      prev.includes(name)
        ? prev.filter(t => t !== name)
        : [...prev, name]
    );
  };

  const handleStart = () => {
    if (appName.trim() && feature.trim() && selectedTemplates.length > 0) {
      onStart(appName.trim(), feature.trim(), selectedTemplates);
    }
  };

  const isValid = appName.trim() && feature.trim() && selectedTemplates.length > 0;

  return (
    <Container size="sm" py="xl">
      <Stack gap="xl">
        <ActionIcon variant="subtle" color="gray" size="lg" onClick={onBack}>
          <IconArrowLeft size={20} />
        </ActionIcon>

        <Stack align="center" gap={4}>
          <Title order={2} ta="center" style={{ letterSpacing: '-.02em' }}>
            Quick Start
          </Title>
          <Text c="dimmed" size="sm" ta="center">
            Create a new app with projects, workspace, and start building
          </Text>
        </Stack>

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
              Components
            </Text>
            <Text size="xs" c="dimmed">
              Select which project templates to create
            </Text>
          </Stack>
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            {templates.map(template => {
              const isSelected = selectedTemplates.includes(template.name);
              return (
                <GlassCard
                  key={template.name}
                  p="sm"
                  style={{
                    cursor: 'pointer',
                    border: isSelected
                      ? '2px solid var(--mantine-color-peach-5)'
                      : '1px solid var(--border-subtle)',
                    opacity: isSelected ? 1 : 0.7,
                    transition: 'all 0.15s ease',
                  }}
                  onClick={() => toggleTemplate(template.name)}
                >
                  <Group gap="sm" wrap="nowrap">
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleTemplate(template.name)}
                      color="peach"
                      styles={{ input: { cursor: 'pointer' } }}
                    />
                    <ThemeIcon
                      size="md"
                      radius="md"
                      color={getTemplateColor(template.name)}
                      variant="light"
                    >
                      {getTemplateIcon(template.name)}
                    </ThemeIcon>
                    <Stack gap={0}>
                      <Text size="sm" fw={500}>
                        {template.displayName}
                      </Text>
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {template.description}
                      </Text>
                    </Stack>
                  </Group>
                </GlassCard>
              );
            })}
          </SimpleGrid>
          {selectedTemplates.length === 0 && (
            <Text size="xs" c="rose.6">
              Select at least one component
            </Text>
          )}
        </Stack>

        <GlassTextarea
          label="What do you want to build?"
          description="Describe the feature or app you want to create"
          placeholder="Build a todo app with user authentication, task CRUD operations, and a clean modern UI..."
          value={feature}
          onChange={(e) => setFeature(e.target.value)}
          minRows={4}
          autosize
        />

        <Button
          size="lg"
          color="peach"
          leftSection={creatingProject ? <Loader size={18} color="white" /> : <IconRocket size={18} />}
          disabled={!isValid || creatingProject}
          onClick={handleStart}
          fullWidth
        >
          {creatingProject ? 'Creating...' : 'Create & Start Building'}
        </Button>
      </Stack>
    </Container>
  );
}
