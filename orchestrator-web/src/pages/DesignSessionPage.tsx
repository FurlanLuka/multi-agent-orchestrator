import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
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
  Button,
} from '@mantine/core';
import { IconArrowLeft, IconSend, IconAlertCircle, IconCheck, IconSparkles, IconWand, IconDeviceFloppy, IconFile, IconPencil, IconTrash } from '@tabler/icons-react';
import type { DesignPhase, DesignCategory } from '@orchy/types';
import { FormCard, GlassCard, GlassTextarea, GlassTextInput, glass, radii } from '../theme';
import { DesignPreviewOverlay } from '../components/design/DesignPreviewOverlay';
import { NotificationSettingsPopover } from '../components/settings/NotificationSettingsPopover';
import { useOrchestrator } from '../context/OrchestratorContext';
import { useNotifications } from '../hooks/useNotifications';

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

const generatingMessages: Record<'theme' | 'component' | 'mockup', string> = {
  theme: 'Generating theme options...',
  component: 'Generating component styles...',
  mockup: 'Generating mockups...',
};

export function DesignSessionPage({ onBack, onComplete }: DesignSessionPageProps) {
  // Get edit design from route state
  const location = useLocation();
  const editDesignName = (location.state as { editDesign?: string })?.editDesign;

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
    clearDesignRefine,
    requestNewDesignOptions,
    submitDesignFeedback,
    finishAddingPages,
    loadDesignForEditing,
    editDesignPage,
    deleteDesignPage,
    renameDesignPage,
  } = useOrchestrator();

  const effectivePort = port ?? (window as unknown as { __ORCHESTRATOR_PORT__?: number }).__ORCHESTRATOR_PORT__ ?? 3456;

  // Activate notification system
  useNotifications();

  // Local state for category selection (before session starts)
  const [localPhase, setLocalPhase] = useState<ExtendedPhase>('category');
  const [inputValue, setInputValue] = useState('');

  // Complete stage state
  const [designName, setDesignName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Page renaming state
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editingPageName, setEditingPageName] = useState('');

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Determine the current phase: local 'category' phase or socket-managed phase
  // In edit mode, skip category selection entirely - show loading until socket responds
  const currentPhase: ExtendedPhase = editDesignName
    ? (designPhase || 'discovery')  // Use socket phase, fallback to discovery (shows loading)
    : (localPhase === 'category' ? 'category' : designPhase);

  // Auto-scroll to bottom when messages change or generating state changes
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [designMessages, designGenerating]);

  // Track session ID in ref for cleanup
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    sessionIdRef.current = designSessionId;
  }, [designSessionId]);

  // Clean up session when leaving - runs once on unmount
  useEffect(() => {
    return () => {
      if (sessionIdRef.current) {
        endDesignSession();
      }
    };
  }, [endDesignSession]);

  // Load design for editing if navigated with editDesign state
  const hasLoadedEditDesignRef = useRef(false);
  useEffect(() => {
    if (editDesignName && !hasLoadedEditDesignRef.current) {
      hasLoadedEditDesignRef.current = true;
      // Don't set localPhase - socket events will drive phase transitions
      loadDesignForEditing(editDesignName);
    }
  }, [editDesignName, loadDesignForEditing]);

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

  // Handle save to library (for new designs)
  const handleSaveToLibrary = async () => {
    if (!effectivePort || !designName.trim()) return;

    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`http://localhost:${effectivePort}/api/designer/save-design-folder`, {
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

  // Handle finishing edit mode - saves directly to existing design folder
  const handleFinishEditing = async () => {
    if (!effectivePort || !editDesignName) return;

    setSaving(true);
    setSaveError(null);

    try {
      const response = await fetch(`http://localhost:${effectivePort}/api/designer/save-design-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designName: editDesignName }),
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

  // Check states
  const showGenerating = designGenerating !== null;
  const showPreview = designPreview && designPreview.options.length > 0;

  // Loading state for edit mode before socket responds with session
  const isLoadingEditDesign = editDesignName && !designSessionId;

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

          {/* Notification Settings */}
          <Box style={{ position: 'absolute', top: 24, right: 24 }}>
            <NotificationSettingsPopover />
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
  // LOADING STATE - Edit mode waiting for session
  // ─────────────────────────────────────────────────────────────────────────────
  if (isLoadingEditDesign) {
    return (
      <Container size="sm" py={60}>
        <Stack align="center" gap="xl">
          {/* Back Button */}
          <Box style={{ position: 'absolute', top: 24, left: 24 }}>
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={handleBack}>
              <IconArrowLeft size={20} />
            </ActionIcon>
          </Box>

          <Loader color="peach" />
          <Text c="dimmed" size="sm">Loading design...</Text>
        </Stack>
      </Container>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // COMPLETE STAGE - Simple save card (no chat)
  // Show only when phase is 'complete' and user has pages
  // ─────────────────────────────────────────────────────────────────────────────
  const showCompleteStage = designPhase === 'complete' && designPages.length > 0 && !designComplete;

  // Show pages panel when in pages phase with pages available
  const showPagesPanel = designPhase === 'pages' && designPages.length > 0;

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

          {/* Notification Settings */}
          <Box style={{ position: 'absolute', top: 24, right: 24 }}>
            <NotificationSettingsPopover />
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
      {/* Back Button - fixed top left */}
      <Box style={{ position: 'absolute', top: 24, left: 24 }}>
        <ActionIcon variant="subtle" color="gray" size="lg" onClick={handleBack}>
          <IconArrowLeft size={20} />
        </ActionIcon>
      </Box>

      {/* Notification Settings - fixed top right */}
      <Box style={{ position: 'absolute', top: 24, right: 24 }}>
        <NotificationSettingsPopover />
      </Box>

      <Container size={(designRefine || showPagesPanel) ? 'lg' : 'sm'} py={60}>
        <Stack gap="xl">
          {/* Title */}
          <Stack gap={0} w="100%">
            <Title order={2} style={{ letterSpacing: '-.02em' }}>
              Design Assistant
            </Title>
            <Text c="dimmed" size="sm">
              {showGenerating
                ? designGenerating?.type === 'theme'
                  ? 'Generating theme options...'
                  : designGenerating?.type === 'component'
                    ? 'Generating component styles...'
                    : 'Generating mockups...'
                : designComplete
                  ? 'Design complete!'
                  : 'Tell me about your vision'}
            </Text>
          </Stack>

          {/* Error Alert */}
          {designError && (
            <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error" w="100%">
              {designError}
            </Alert>
          )}

          {/* Main Content - side by side when refining */}
          <Group align="flex-start" gap="lg" wrap="nowrap" style={{ width: '100%' }}>
          {/* Chat Card */}
          <FormCard
            style={{ flex: 1, minWidth: 0 }}
            title={<Box style={{ height: 8 }} />}
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
                  <Stack gap="sm" align="center" py="xl">
                    <Box
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        background: 'var(--mantine-color-peach-1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <IconSparkles size={24} color="var(--mantine-color-peach-6)" />
                    </Box>
                    <Text size="sm" c="dimmed" ta="center">
                      Describe your project to get started
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
                  <Group gap="xs">
                    <Button
                      size="sm"
                      variant="subtle"
                      color="gray"
                      onClick={clearDesignRefine}
                    >
                      Exit
                    </Button>
                    <Button
                      size="sm"
                      variant="subtle"
                      color="gray"
                      onClick={requestNewDesignOptions}
                    >
                      Show 3 new options
                    </Button>
                  </Group>
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

          {/* Pages Panel - appears on right when in pages phase */}
          {showPagesPanel && !designRefine && (
            <FormCard
              style={{ width: 280, flexShrink: 0 }}
              title={
                <Group gap="xs">
                  <IconFile size={16} color="var(--mantine-color-peach-6)" />
                  <Text fw={600} size="lg">Pages</Text>
                </Group>
              }
              footer={
                <Button
                  fullWidth
                  color="peach"
                  size="sm"
                  leftSection={saving ? <Loader size={14} color="white" /> : <IconCheck size={14} />}
                  onClick={editDesignName ? handleFinishEditing : finishAddingPages}
                  disabled={saving}
                >
                  {editDesignName ? (saving ? 'Saving...' : 'Save & Close') : 'Done'}
                </Button>
              }
            >
              <Stack gap="xs">
                {designPages.map((page) => (
                  <Group
                    key={page.id}
                    gap="xs"
                    p="xs"
                    justify="space-between"
                    style={{
                      borderRadius: radii.input,
                      background: glass.surface.bg,
                      border: glass.surface.border,
                    }}
                  >
                    <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
                      <IconFile size={14} color="var(--mantine-color-gray-5)" style={{ flexShrink: 0 }} />
                      {editingPageId === page.id ? (
                        <GlassTextInput
                          size="xs"
                          value={editingPageName}
                          onChange={(e) => setEditingPageName(e.currentTarget.value)}
                          onBlur={() => {
                            if (editingPageName.trim() && editingPageName !== page.name) {
                              renameDesignPage(page.id, editingPageName.trim());
                            }
                            setEditingPageId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (editingPageName.trim() && editingPageName !== page.name) {
                                renameDesignPage(page.id, editingPageName.trim());
                              }
                              setEditingPageId(null);
                            } else if (e.key === 'Escape') {
                              setEditingPageId(null);
                            }
                          }}
                          autoFocus
                          style={{ flex: 1 }}
                        />
                      ) : (
                        <Text
                          size="sm"
                          style={{ cursor: 'pointer', flex: 1 }}
                          onClick={() => {
                            setEditingPageId(page.id);
                            setEditingPageName(page.name);
                          }}
                        >
                          {page.name}
                        </Text>
                      )}
                    </Group>
                    <Group gap={4}>
                      <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => editDesignPage(page.id)}>
                        <IconPencil size={12} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="red" size="sm" onClick={() => deleteDesignPage(page.id)}>
                        <IconTrash size={12} />
                      </ActionIcon>
                    </Group>
                  </Group>
                ))}
                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  fullWidth
                  leftSection={<IconSparkles size={14} />}
                  onClick={() => {
                    // Unlock input and send message to generate more mockups
                    sendDesignMessage('Generate another page mockup');
                  }}
                  mt="xs"
                >
                  Add Another Page
                </Button>
                <Text size="xs" c="dimmed" ta="center">
                  Or ask in chat for specific pages
                </Text>
              </Stack>
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
        onSelect={(index, pageName) => selectDesignOption(index, pageName)}
        onRefine={(index) => enterDesignRefine(index)}
        onBackToDiscovery={() => submitDesignFeedback('I want to go back to chat and explain what I have in mind')}
        onClose={() => submitDesignFeedback('I want to go back to chat and explain what I have in mind')}
      />
    </>
  );
}
