import { Container, Stack, Title, Text, SimpleGrid, Group, Badge } from '@mantine/core';
import { IconSparkles, IconPalette, IconHammer } from '@tabler/icons-react';
import { FormCard, GlassBar } from '../theme';

interface ModeSelectionPageProps {
  hasActiveSession: boolean;
  onSelectDesign: () => void;
  onSelectBuild: () => void;
  onResumeSession: () => void;
}

export function ModeSelectionPage({
  hasActiveSession,
  onSelectDesign,
  onSelectBuild,
  onResumeSession,
}: ModeSelectionPageProps) {
  return (
    <>
      {hasActiveSession && (
        <GlassBar position="top" justify="center" p="sm">
          <Badge
            variant="light"
            color="peach"
            size="lg"
            leftSection={<IconSparkles size={14} />}
          >
            Session Active
          </Badge>
          <Text
            size="sm"
            c="peach.6"
            fw={500}
            style={{ cursor: 'pointer' }}
            onClick={onResumeSession}
          >
            Resume
          </Text>
        </GlassBar>
      )}

      <Container size="sm" py={hasActiveSession ? 100 : 80}>
        <Stack align="center" gap="xl">
          <Stack align="center" gap={4}>
            <Title order={1} ta="center" style={{ letterSpacing: '-.02em' }}>
              Orchy
            </Title>
            <Text c="dimmed" size="sm" ta="center">
              How would you like to start?
            </Text>
          </Stack>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg" w="100%" maw={600}>
            {/* Design Mode Card */}
            <FormCard
              hoverable
              onClick={onSelectDesign}
              style={{ cursor: 'pointer', minHeight: 180 }}
            >
              <Stack gap="sm" align="center" ta="center">
                <Group gap={8} justify="center">
                  <IconPalette size={24} color="var(--mantine-color-peach-6)" />
                  <Title order={3} fw={600}>Design First</Title>
                </Group>
                <Text size="sm" c="dimmed">
                  Create a design system before coding.
                  Choose colors, typography, and component styles
                  through an interactive process.
                </Text>
                <Text size="xs" c="peach.6" fw={500}>
                  Best for new projects
                </Text>
              </Stack>
            </FormCard>

            {/* Build Mode Card */}
            <FormCard
              hoverable
              onClick={onSelectBuild}
              style={{ cursor: 'pointer', minHeight: 180 }}
            >
              <Stack gap="sm" align="center" ta="center">
                <Group gap={8} justify="center">
                  <IconHammer size={24} color="var(--mantine-color-peach-6)" />
                  <Title order={3} fw={600}>Build Feature</Title>
                </Group>
                <Text size="sm" c="dimmed">
                  Jump straight into implementation.
                  Describe your feature and let AI plan
                  and build it across your projects.
                </Text>
                <Text size="xs" c="peach.6" fw={500}>
                  Best for existing codebases
                </Text>
              </Stack>
            </FormCard>
          </SimpleGrid>
        </Stack>
      </Container>
    </>
  );
}
