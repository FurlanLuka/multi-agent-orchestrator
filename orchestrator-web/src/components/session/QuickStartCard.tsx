import { useState } from 'react';
import {
  Stack,
  Group,
  ThemeIcon,
  Title,
  Text,
  Button,
} from '@mantine/core';
import { GlassTextInput } from '../../theme';
import { IconRocket } from '@tabler/icons-react';
import { GlassCard } from '../../theme';

interface QuickStartCardProps {
  creatingProject: boolean;
  onQuickStart: (name: string) => void;
}

export function QuickStartCard({ creatingProject, onQuickStart }: QuickStartCardProps) {
  const [quickStartName, setQuickStartName] = useState('');

  return (
    <GlassCard p="xl">
      <Stack gap="md">
        <Group gap="md">
          <ThemeIcon size={48} radius="md" color="peach" variant="light">
            <IconRocket size={28} />
          </ThemeIcon>
          <div>
            <Title order={3}>Quick Start</Title>
            <Text size="sm" c="dimmed">
              Create a full-stack app with frontend + backend, Git, and E2E testing.
            </Text>
          </div>
        </Group>

        <Stack gap="sm">
          <GlassTextInput
            placeholder="App name (e.g., blog, shop, dashboard)"
            value={quickStartName}
            onChange={(e) => setQuickStartName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            disabled={creatingProject}
            size="md"
          />
          {quickStartName && (
            <Text size="xs" c="dimmed">
              Creates <Text span fw={500} c="peach.7">~/Documents/aio-{quickStartName}/{quickStartName}-frontend</Text> and <Text span fw={500} c="peach.8">~/Documents/aio-{quickStartName}/{quickStartName}-backend</Text>
            </Text>
          )}
          <Button
            size="md"
            color="peach"
            leftSection={<IconRocket size={18} />}
            disabled={!quickStartName.trim() || creatingProject}
            loading={creatingProject}
            onClick={() => {
              if (quickStartName.trim()) {
                onQuickStart(quickStartName.trim());
                setQuickStartName('');
              }
            }}
          >
            Create App
          </Button>
        </Stack>
      </Stack>
    </GlassCard>
  );
}
