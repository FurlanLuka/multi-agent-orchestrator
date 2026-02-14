import { Container, Stack, Title, Text, SimpleGrid, Group, Badge, Box } from '@mantine/core';
import { IconSparkles, IconRocket } from '@tabler/icons-react';
import { GlassCard, GlassBar } from '../theme';
import { HelpOverlay, HelpTrigger } from '../components/overlay';

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

      <Container size="md" py={hasActiveSession ? 80 : 60}>
        <Stack gap="xl">
          {/* Header */}
          <Stack gap={0}>
            <Group gap={8} align="center">
              <img src="/favicon.png" alt="Orchy" width={24} height={24} />
              <Title order={3} style={{ letterSpacing: '-.02em' }}>
                Orchy
              </Title>
            </Group>
            <Group gap="xs">
              <Text c="dimmed" size="sm">
                How would you like to start?
              </Text>
              <Text c="dimmed" size="sm">·</Text>
              <HelpOverlay
                trigger={<HelpTrigger />}
                title="Getting Started"
                icon={<IconRocket size={20} style={{ color: 'var(--mantine-color-lavender-5)' }} />}
                maxWidth={520}
              >
                <Stack gap="md">
                  <Box>
                    <Text fw={600} size="sm" mb={4}>Design</Text>
                    <Text size="sm" c="dimmed">
                      Create a design system before you write any code. Pick colors, fonts, and component styles through an interactive chat — perfect for new projects or when you want a polished, consistent look from the start.
                    </Text>
                  </Box>

                  <Box>
                    <Text fw={600} size="sm" mb={4}>Build</Text>
                    <Text size="sm" c="dimmed">
                      Jump straight into coding. Describe the feature you want to build, and AI will plan and implement it across your projects. Great for existing codebases or when you already know what you need.
                    </Text>
                  </Box>

                  <Box
                    p="sm"
                    style={{
                      background: 'rgba(250, 247, 245, 0.8)',
                      borderRadius: 10,
                      border: '1px solid rgba(160, 130, 110, 0.08)',
                    }}
                  >
                    <Text size="xs" c="dimmed">
                      <Text span fw={500} c="dark">Tip:</Text> You can always create a design later and apply it to your build projects — or skip design entirely if you prefer.
                    </Text>
                  </Box>
                </Stack>
              </HelpOverlay>
            </Group>
          </Stack>

          <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="md">
            {/* Design Mode Card */}
            <GlassCard
              hoverable
              onClick={onSelectDesign}
              p="lg"
              style={{ minHeight: 160, display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
            >
              <Stack gap={4}>
                <Text fw={600} size="md">Design</Text>
                <Text size="xs" c="dimmed">
                  Create a design system before coding. Choose colors, typography, and component styles through an interactive process.
                </Text>
              </Stack>
            </GlassCard>

            {/* Build Mode Card */}
            <GlassCard
              hoverable
              onClick={onSelectBuild}
              p="lg"
              style={{ minHeight: 160, display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
            >
              <Stack gap={4}>
                <Text fw={600} size="md">Build</Text>
                <Text size="xs" c="dimmed">
                  Jump straight into implementation. Describe your feature and let AI plan and build it across your projects.
                </Text>
              </Stack>
            </GlassCard>
          </SimpleGrid>
        </Stack>
      </Container>
    </>
  );
}
