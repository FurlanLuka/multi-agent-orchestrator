import { useState, useEffect, useRef } from 'react';
import {
  Container,
  Stack,
  Title,
  Text,
  Group,
  Box,
  ActionIcon,
  ScrollArea,
  SimpleGrid,
  Alert,
  Loader,
  Badge,
  Button,
} from '@mantine/core';
import { IconArrowLeft, IconSend, IconAlertCircle, IconCheck, IconSparkles, IconWand, IconDeviceFloppy, IconFile } from '@tabler/icons-react';
import type { DesignPhase, DesignCategory } from '@orchy/types';
import { FormCard, GlassCard, GlassTextarea, GlassTextInput, glass, radii } from '../theme';
import { DesignPreviewOverlay } from '../components/design/DesignPreviewOverlay';
import { useOrchestrator } from '../context/OrchestratorContext';

interface DesignSessionPageProps {
  onBack: () => void;
  onComplete: () => void;  // Navigate to designs library after saving
}

// Categories available for selection
const availableCategories: Array<{ id: DesignCategory; name: string; description: string }> = [
  { id: 'blog', name: 'Blog', description: 'Personal blogs, company blogs, newsletters' },
  { id: 'landing_page', name: 'Landing Page', description: 'Product launches, marketing pages' },
  { id: 'ecommerce', name: 'E-commerce', description: 'Online stores, product catalogs' },
  { id: 'dashboard', name: 'Dashboard', description: 'Admin panels, analytics, data views' },
  { id: 'documentation', name: 'Documentation', description: 'API docs, guides, knowledge bases' },
  { id: 'portfolio', name: 'Portfolio', description: 'Personal sites, project showcases' },
  { id: 'chat_messaging', name: 'Chat / Messaging', description: 'Chat apps, support widgets' },
  { id: 'saas_marketing', name: 'SaaS Marketing', description: 'B2B software, pricing pages' },
];

// Extended phases including category selection
type ExtendedPhase = 'category' | DesignPhase;
const phases: ExtendedPhase[] = ['category', 'discovery', 'theme', 'components', 'mockups', 'complete'];

const phaseLabels: Record<ExtendedPhase, string> = {
  category: 'Type',
  discovery: 'Discovery',
  summary: 'Summary',
  theme: 'Theme',
  components: 'Components',
  mockups: 'Mockups',
  pages: 'Pages',
  complete: 'Done',
};

const generatingMessages: Record<'theme' | 'component' | 'mockup', string> = {
  theme: 'Generating theme options...',
  component: 'Generating component styles...',
  mockup: 'Generating mockups...',
};

export function DesignSessionPage({ onBack, onComplete }: DesignSessionPageProps) {
  // Socket state from context
  const {
    port,
    designSessionId,
    designPhase,
    designInputLocked,
    designInputPlaceholder,
    designMessages,
    designPreview,
    designRefine,
    designComplete,
    designError,
    designGenerating,
    designPages,
    startDesignSession,
    endDesignSession,
    sendDesignMessage,
    selectDesignCategory,
    selectDesignOption,
    enterDesignRefine,
    confirmDesignRefine,
    requestNewDesignOptions,
    submitDesignFeedback,
  } = useOrchestrator();

  // Local state for category selection (before session starts)
  const [localPhase, setLocalPhase] = useState<ExtendedPhase>('category');
  const [inputValue, setInputValue] = useState('');

  // Complete stage state
  const [designName, setDesignName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Determine the current phase: local 'category' phase or socket-managed phase
  const currentPhase: ExtendedPhase = localPhase === 'category' ? 'category' : designPhase;

  // Auto-scroll to bottom when messages change or generating state changes
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [designMessages, designGenerating]);

  // Clean up session when leaving
  useEffect(() => {
    return () => {
      if (designSessionId) {
        endDesignSession();
      }
    };
  }, [designSessionId, endDesignSession]);

  // Handle category selection - starts the design session
  const handleCategorySelect = (category: DesignCategory) => {
    setLocalPhase('discovery');
    startDesignSession(category);
    selectDesignCategory(category);
  };

  // Handle sending a message
  const handleSendMessage = () => {
    if (!inputValue.trim() || designInputLocked) return;
    sendDesignMessage(inputValue.trim());
    setInputValue('');
  };

  // Handle key press in input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Handle back button
  const handleBack = () => {
    if (designSessionId) {
      endDesignSession();
    }
    onBack();
  };

  // Handle save to library
  const handleSaveToLibrary = async () => {
    if (!port || !designName.trim()) return;

    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`http://localhost:${port}/api/designer/save-design-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designName: designName.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save design');
      }

      // Successfully saved - end session and navigate to library
      endDesignSession();
      onComplete();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save design');
    } finally {
      setSaving(false);
    }
  };

  // Get active step index (summary doesn't appear in progress bar, show as discovery)
  const getStepIndex = (): number => {
    const phase = currentPhase === 'summary' ? 'discovery' : currentPhase;
    return phases.indexOf(phase);
  };

  const activeStep = getStepIndex();

  // Check states
  const showGenerating = designGenerating !== null;
  const showPreview = designPreview && designPreview.options.length > 0;

  // ─────────────────────────────────────────────────────────────────────────────
  // CATEGORY SELECTION SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  if (currentPhase === 'category') {
    return (
      <Container size="sm" py={60}>
        <Stack align="center" gap="xl">
          {/* Back Button */}
          <Box style={{ position: 'absolute', top: 24, left: 24 }}>
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={handleBack}>
              <IconArrowLeft size={20} />
            </ActionIcon>
          </Box>

          {/* Title */}
          <Stack align="center" gap={4}>
            <Title order={2} ta="center" style={{ letterSpacing: '-.02em' }}>
              What are you building?
            </Title>
            <Text c="dimmed" size="sm" ta="center">
              Select a category to get tailored design recommendations
            </Text>
          </Stack>

          {/* Category Cards */}
          <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="md" w="100%">
            {availableCategories.map((category) => (
              <GlassCard
                key={category.id}
                hoverable
                onClick={() => handleCategorySelect(category.id)}
                p="lg"
                style={{
                  minHeight: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                }}
              >
                <Text fw={600} size="md" ta="center" mb={4}>
                  {category.name}
                </Text>
                <Text size="xs" c="dimmed" ta="center">
                  {category.description}
                </Text>
              </GlassCard>
            ))}
          </SimpleGrid>
        </Stack>
      </Container>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // COMPLETE STAGE - Simple save card (no chat)
  // Show when phase is 'pages' and we have at least one page
  // ─────────────────────────────────────────────────────────────────────────────
  const showCompleteStage = (designPhase === 'pages' || designPhase === 'complete') && designPages.length > 0 && !designComplete;

  if (showCompleteStage) {
    return (
      <Container size="sm" py={60}>
        <Stack align="center" gap="xl">
          {/* Back Button */}
          <Box style={{ position: 'absolute', top: 24, left: 24 }}>
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={handleBack}>
              <IconArrowLeft size={20} />
            </ActionIcon>
          </Box>

          {/* Save Card */}
          <FormCard
            style={{ width: '100%', maxWidth: 400 }}
            title={
              <Group gap="sm">
                <Box
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    background: 'var(--mantine-color-sage-1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <IconCheck size={24} color="var(--mantine-color-sage-6)" />
                </Box>
                <Stack gap={0}>
                  <Text fw={600} size="lg">Design Complete!</Text>
                  <Text size="xs" c="dimmed">
                    {designPages.length} {designPages.length === 1 ? 'page' : 'pages'} created
                  </Text>
                </Stack>
              </Group>
            }
          >
            <Stack gap="md">
              {/* Page list */}
              <Stack gap="xs">
                <Text size="sm" fw={500}>Pages</Text>
                {designPages.map((page) => (
                  <Group key={page.id} gap="xs">
                    <IconFile size={14} color="var(--mantine-color-gray-5)" />
                    <Text size="sm" c="dimmed">{page.name}</Text>
                  </Group>
                ))}
              </Stack>

              {/* Design name input */}
              <GlassTextInput
                label="Design Name"
                placeholder="My Awesome Design"
                value={designName}
                onChange={(e) => setDesignName(e.currentTarget.value)}
                error={saveError}
              />

              {/* Save button */}
              <Button
                fullWidth
                color="peach"
                size="md"
                leftSection={saving ? <Loader size={16} color="white" /> : <IconDeviceFloppy size={18} />}
                disabled={!designName.trim() || saving}
                onClick={handleSaveToLibrary}
              >
                {saving ? 'Saving...' : 'Save to Library'}
              </Button>
            </Stack>
          </FormCard>
        </Stack>
      </Container>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CENTRAL CHAT LAYOUT (after category selection)
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      <Container size={designRefine ? 'lg' : 'sm'} py={40}>
        <Stack gap="lg">
          {/* Header with back + progress */}
          <Group justify="space-between" align="center">
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={handleBack}>
              <IconArrowLeft size={20} />
            </ActionIcon>

            {/* Progress Steps (visual only) */}
            <Group gap="xs">
              {phases.map((p, index) => {
                if (p === 'summary' || p === 'category') return null;

                const isActive = index === activeStep;
                const isComplete = index < activeStep;

                return (
                  <Group key={p} gap={4} align="center">
                    <Box
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: isActive
                          ? 'var(--mantine-color-peach-6)'
                          : isComplete
                            ? 'var(--mantine-color-peach-3)'
                            : 'rgba(0, 0, 0, 0.1)',
                        transition: 'all 0.2s ease',
                      }}
                    />
                    <Text
                      size="xs"
                      c={isActive ? 'peach.6' : 'dimmed'}
                      fw={isActive ? 600 : 400}
                    >
                      {phaseLabels[p]}
                    </Text>
                    {index < phases.length - 1 && p !== 'complete' && (
                      <Box
                        style={{
                          width: 12,
                          height: 1,
                          background: isComplete
                            ? 'var(--mantine-color-peach-3)'
                            : 'rgba(0, 0, 0, 0.08)',
                        }}
                      />
                    )}
                  </Group>
                );
              })}
            </Group>
          </Group>

          {/* Error Alert */}
          {designError && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
              {designError}
            </Alert>
          )}

          {/* Main Content - side by side when refining */}
          <Group align="flex-start" gap="lg" wrap="nowrap" style={{ width: '100%' }}>
          {/* Chat Card */}
          <FormCard
            style={{ flex: 1, minWidth: 0 }}
            title={
              <Group justify="space-between" style={{ flex: 1 }}>
                <Text fw={600} size="lg">Design Assistant</Text>
                <Badge
                  color={showGenerating ? 'peach' : 'gray'}
                  variant="light"
                  size="sm"
                  leftSection={showGenerating ? <Loader size={10} color="peach" /> : null}
                >
                  {showGenerating
                    ? designGenerating?.type === 'theme'
                      ? 'Generating themes'
                      : designGenerating?.type === 'component'
                        ? 'Generating styles'
                        : 'Generating mockups'
                    : designComplete
                      ? 'Complete'
                      : 'Chatting'}
                </Badge>
              </Group>
            }
            footer={!designComplete ? (
              <Group gap="sm" align="flex-end">
                <GlassTextarea
                  placeholder={designInputPlaceholder}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                  disabled={designInputLocked}
                  autosize
                  minRows={1}
                  maxRows={3}
                  style={{ flex: 1 }}
                  styles={{
                    input: {
                      opacity: designInputLocked ? 0.5 : 1,
                    },
                  }}
                />
                <ActionIcon
                  variant="filled"
                  color="peach"
                  size="lg"
                  radius="xl"
                  onClick={handleSendMessage}
                  disabled={designInputLocked || !inputValue.trim()}
                >
                  <IconSend size={18} />
                </ActionIcon>
              </Group>
            ) : undefined}
          >
            {/* Chat Messages - fixed height */}
            <ScrollArea style={{ height: 400 }} viewportRef={scrollAreaRef}>
              <Stack gap="md">
                {/* Empty state */}
                {designMessages.length === 0 && !designComplete && !showGenerating && !designRefine && (
                  <Stack gap="md" align="center" py="xl">
                    <Box
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: '50%',
                        background: 'var(--mantine-color-peach-1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <IconSparkles size={32} color="var(--mantine-color-peach-6)" />
                    </Box>
                    <Title order={5} fw={600} ta="center">
                      Let's design something beautiful
                    </Title>
                    <Text size="sm" c="dimmed" ta="center" maw={300}>
                      Tell me about your project. I'll ask a few questions to understand your vision, then generate design options for you.
                    </Text>
                  </Stack>
                )}

                {/* Messages */}
                {designMessages.map((msg) => (
                  <Box
                    key={msg.id}
                    style={{
                      display: 'flex',
                      justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <Box
                      style={{
                        maxWidth: '85%',
                        padding: '10px 14px',
                        borderRadius: radii.input,
                        background: msg.role === 'user'
                          ? 'var(--mantine-color-peach-1)'
                          : glass.surface.bg,
                        border: msg.role === 'user'
                          ? '1px solid var(--mantine-color-peach-2)'
                          : glass.surface.border,
                      }}
                    >
                      <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                        {msg.content}
                      </Text>
                    </Box>
                  </Box>
                ))}

                {/* Generating state - inline like ActiveFlowCard */}
                {showGenerating && !designComplete && (
                  <Box
                    p="sm"
                    style={{
                      backgroundColor: 'rgba(160, 130, 110, 0.06)',
                      border: '1px solid rgba(160, 130, 110, 0.15)',
                      borderRadius: radii.input,
                    }}
                  >
                    <Group gap="sm" wrap="nowrap">
                      <Loader size={16} color="peach" />
                      <Text size="sm" style={{ color: 'var(--text-body)' }}>
                        {designGenerating.message || generatingMessages[designGenerating.type]}
                      </Text>
                    </Group>
                  </Box>
                )}

                {/* Design Complete */}
                {designComplete && (
                  <Box
                    p="md"
                    style={{
                      backgroundColor: 'rgba(94, 168, 94, 0.08)',
                      border: '1px solid rgba(94, 168, 94, 0.2)',
                      borderRadius: radii.input,
                    }}
                  >
                    <Group gap="sm" wrap="nowrap">
                      <IconCheck size={20} color="var(--mantine-color-sage-6)" />
                      <Stack gap={2}>
                        <Text size="sm" fw={600} style={{ color: 'var(--text-heading)' }}>
                          Design Complete!
                        </Text>
                        <Text size="xs" c="dimmed">
                          Saved as "{designComplete.designName}"
                        </Text>
                      </Stack>
                    </Group>
                  </Box>
                )}
              </Stack>
            </ScrollArea>
          </FormCard>

          {/* Refine Preview Panel - appears on right when refining */}
          {designRefine && (
            <FormCard
              style={{ flex: 1, minWidth: 0 }}
              title={
                <Group gap="xs">
                  <IconWand size={16} color="var(--mantine-color-peach-6)" />
                  <Text fw={600} size="lg">Refining {designRefine.type}</Text>
                </Group>
              }
              footer={
                <Group justify="space-between">
                  <Button
                    size="sm"
                    variant="subtle"
                    color="gray"
                    onClick={requestNewDesignOptions}
                  >
                    Show 3 new options
                  </Button>
                  <Button
                    size="sm"
                    variant="filled"
                    color="peach"
                    leftSection={<IconCheck size={14} />}
                    onClick={confirmDesignRefine}
                  >
                    Looks good
                  </Button>
                </Group>
              }
            >
              <Box
                style={{
                  background: '#ffffff',
                  borderRadius: radii.input,
                  border: glass.surface.border,
                  overflow: 'hidden',
                  height: 360,
                }}
              >
                <iframe
                  srcDoc={designRefine.option.previewHtml}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                  }}
                  title="Refine Preview"
                />
              </Box>
            </FormCard>
          )}
          </Group>
        </Stack>
      </Container>

      {/* Full-screen Preview Overlay */}
      <DesignPreviewOverlay
        opened={!!showPreview && !showGenerating && !designComplete && !designRefine}
        type={designPreview?.type || 'theme'}
        options={designPreview?.options || []}
        onSelect={(index) => selectDesignOption(index)}
        onRefine={(index) => enterDesignRefine(index)}
        onBackToDiscovery={() => submitDesignFeedback('I want to go back to chat and explain what I have in mind')}
        onClose={() => submitDesignFeedback('I want to go back to chat and explain what I have in mind')}
      />
    </>
  );
}
