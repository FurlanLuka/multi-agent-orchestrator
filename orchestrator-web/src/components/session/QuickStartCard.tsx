import { useState } from 'react';
import {
  Card,
  Stack,
  Group,
  ThemeIcon,
  Title,
  Text,
  TextInput,
  Button,
} from '@mantine/core';
import { IconRocket } from '@tabler/icons-react';

interface QuickStartCardProps {
  creatingProject: boolean;
  onQuickStart: (name: string) => void;
}

export function QuickStartCard({ creatingProject, onQuickStart }: QuickStartCardProps) {
  const [quickStartName, setQuickStartName] = useState('');

  return (
    <Card
      shadow="sm"
      radius="lg"
      p="xl"
      style={{
        background: 'linear-gradient(135deg, var(--mantine-color-violet-0) 0%, var(--mantine-color-blue-0) 100%)',
        border: '1px solid var(--mantine-color-violet-2)',
      }}
    >
      <Stack gap="md">
        <Group gap="md">
          <ThemeIcon size={48} radius="md" variant="gradient" gradient={{ from: 'violet', to: 'blue' }}>
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
          <TextInput
            placeholder="App name (e.g., blog, shop, dashboard)"
            value={quickStartName}
            onChange={(e) => setQuickStartName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            disabled={creatingProject}
            size="md"
          />
          {quickStartName && (
            <Text size="xs" c="dimmed">
              Creates <Text span fw={500} c="violet">~/Documents/aio-{quickStartName}/{quickStartName}-frontend</Text> and <Text span fw={500} c="blue">~/Documents/aio-{quickStartName}/{quickStartName}-backend</Text>
            </Text>
          )}
          <Button
            size="md"
            variant="gradient"
            gradient={{ from: 'violet', to: 'blue' }}
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
    </Card>
  );
}
