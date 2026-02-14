import { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Stack,
  Title,
  Text,
  SimpleGrid,
  ActionIcon,
  Group,
  Badge,
  Loader,
  Box,
  Button,
} from '@mantine/core';
import { IconPlus, IconTrash, IconFile, IconPalette, IconDownload } from '@tabler/icons-react';
import type { SavedDesignFolder, SavedDesignFolderContents } from '@orchy/types';
import { GlassCard, GlassDashedCard, StyledModal } from '../theme';
import { DesignDetailModal } from '../components/design/DesignDetailModal';
import { HelpOverlay, HelpTrigger } from '../components/overlay';
import { useOrchestrator } from '../context/OrchestratorContext';

interface DesignsLibraryPageProps {
  onAddNew: () => void;
  onEdit?: (designName: string) => void;
}

export function DesignsLibraryPage({ onAddNew, onEdit }: DesignsLibraryPageProps) {
  const { port } = useOrchestrator();
  const effectivePort = port ?? (window as unknown as { __ORCHESTRATOR_PORT__?: number }).__ORCHESTRATOR_PORT__ ?? 3456;

  const [designs, setDesigns] = useState<SavedDesignFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [selectedDesign, setSelectedDesign] = useState<SavedDesignFolderContents | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingDesign, setLoadingDesign] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedDesignFolder | null>(null);

  // Fetch designs on mount
  const fetchDesigns = useCallback(async () => {
    if (!effectivePort) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`http://localhost:${effectivePort}/api/designs`);
      if (!response.ok) {
        throw new Error('Failed to fetch designs');
      }
      const data = await response.json();
      setDesigns(data.designs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load designs');
    } finally {
      setLoading(false);
    }
  }, [effectivePort]);

  useEffect(() => {
    fetchDesigns();
  }, [fetchDesigns]);

  // Handle clicking on a design card
  const handleDesignClick = async (design: SavedDesignFolder) => {
    if (!effectivePort) return;

    setLoadingDesign(design.name);

    try {
      const response = await fetch(`http://localhost:${effectivePort}/api/designs/${encodeURIComponent(design.name)}`);
      if (!response.ok) {
        throw new Error('Failed to load design');
      }
      const contents: SavedDesignFolderContents = await response.json();
      setSelectedDesign(contents);
      setModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load design');
    } finally {
      setLoadingDesign(null);
    }
  };

  // Handle download button click
  const handleDownloadClick = (design: SavedDesignFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = `http://localhost:${effectivePort}/api/designs/${encodeURIComponent(design.name)}/download`;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Handle delete button click - opens confirmation modal
  const handleDeleteClick = (design: SavedDesignFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(design);
  };

  // Handle confirmed deletion
  const handleConfirmDelete = async () => {
    if (!effectivePort || !deleteTarget) return;

    try {
      const response = await fetch(`http://localhost:${effectivePort}/api/designs/${encodeURIComponent(deleteTarget.name)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete design');
      }
      // Refresh the list
      fetchDesigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete design');
    } finally {
      setDeleteTarget(null);
    }
  };

  // Close the modal
  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedDesign(null);
  };

  return (
    <>
      <Container size="md" py={60}>
        <Stack gap="xl">
          {/* Header */}
          <Stack gap={0}>
            <Title order={2} style={{ letterSpacing: '-.02em' }}>
              Designs Library
            </Title>
            <Group gap="xs">
              <Text c="dimmed" size="sm">
                Your saved design systems
              </Text>
              <Text c="dimmed" size="sm">·</Text>
              <HelpOverlay
                trigger={<HelpTrigger />}
                title="Getting Started with Designs"
                icon={<IconPalette size={20} style={{ color: 'var(--mantine-color-lavender-5)' }} />}
                maxWidth={580}
              >
                <Stack gap="md">
                  <Box>
                    <Text fw={600} size="sm" mb={4}>What's a design system?</Text>
                    <Text size="sm" c="dimmed">
                      Think of it as your project's style guide — the colors, fonts, buttons, and overall look that makes everything feel polished and professional. Instead of making design decisions from scratch for every project, you create one design system and reuse it.
                    </Text>
                  </Box>

                  <Box>
                    <Text fw={600} size="sm" mb={10}>How to create one:</Text>
                    <Stack gap={8}>
                      {[
                        { step: 1, title: 'Click "New Design"', desc: 'Start a guided conversation' },
                        { step: 2, title: 'Pick a category', desc: 'Tell us what you\'re building — an app, website, dashboard, etc.' },
                        { step: 3, title: 'Chat about your style', desc: 'Describe the vibe you\'re going for and we\'ll generate options' },
                        { step: 4, title: 'Preview and choose', desc: 'See live previews of themes, components, and layouts' },
                        { step: 5, title: 'Save to your library', desc: 'Your design is ready to use!' },
                      ].map(({ step, title, desc }) => (
                        <Group
                          key={step}
                          gap="xs"
                          wrap="nowrap"
                          align="center"
                          px="sm"
                          py={8}
                          style={{
                            background: 'rgba(250, 247, 245, 0.8)',
                            borderRadius: 10,
                            border: '1px solid rgba(160, 130, 110, 0.08)',
                          }}
                        >
                          <Box
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              background: 'var(--mantine-color-peach-1)',
                              color: 'var(--mantine-color-peach-6)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 11,
                              fontWeight: 600,
                              flexShrink: 0,
                            }}
                          >
                            {step}
                          </Box>
                          <Box style={{ flex: 1, minWidth: 0 }}>
                            <Text size="xs"><Text span fw={500}>{title}</Text> <Text span c="dimmed">— {desc}</Text></Text>
                          </Box>
                        </Group>
                      ))}
                    </Stack>
                  </Box>

                  <Box>
                    <Text fw={600} size="sm" mb={4}>Using your designs:</Text>
                    <Text size="sm" c="dimmed">
                      When you create a new workspace project, you'll be able to select any design from this library. Your project will automatically use those colors, typography, and component styles — giving you a consistent, professional look from the start.
                    </Text>
                  </Box>
                </Stack>
              </HelpOverlay>
            </Group>
          </Stack>

          {/* Loading State */}
          {loading && (
            <Stack align="center" py="xl">
              <Loader color="peach" size="md" />
              <Text c="dimmed" size="sm">Loading designs...</Text>
            </Stack>
          )}

          {/* Error State */}
          {error && (
            <Text c="red" size="sm" ta="center">{error}</Text>
          )}

          {/* Design Cards Grid */}
          {!loading && (
            <SimpleGrid
              cols={{ base: 1, xs: 2, sm: 3 }}
              spacing="md"
            >
              {/* Add New Card */}
              <GlassDashedCard
                onClick={onAddNew}
                style={{
                  minHeight: 160,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Stack align="center" gap="xs">
                  <IconPlus size={28} style={{ opacity: 0.5 }} />
                  <Text size="sm" fw={500} style={{ opacity: 0.6 }}>New Design</Text>
                </Stack>
              </GlassDashedCard>

              {/* Existing Design Cards */}
              {designs.map((design) => (
                <DesignCard
                  key={design.path}
                  design={design}
                  loading={loadingDesign === design.name}
                  onClick={() => handleDesignClick(design)}
                  onDelete={(e) => handleDeleteClick(design, e)}
                  onDownload={(e) => handleDownloadClick(design, e)}
                />
              ))}
            </SimpleGrid>
          )}

        </Stack>
      </Container>

      {/* Design Detail Modal */}
      <DesignDetailModal
        opened={modalOpen}
        design={selectedDesign}
        onClose={handleCloseModal}
        onEdit={(name) => {
          handleCloseModal();
          onEdit?.(name);
        }}
      />

      {/* Delete Confirmation Modal */}
      <StyledModal
        title="Delete Design"
        opened={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        size="sm"
        footer={
          <Group justify="flex-end" gap="sm">
            <Button variant="subtle" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button color="rose" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </Group>
        }
      >
        <Text size="sm">
          Are you sure you want to delete <Text span fw={600}>"{deleteTarget?.name}"</Text>? This cannot be undone.
        </Text>
      </StyledModal>
    </>
  );
}

// Design Card Component
interface DesignCardProps {
  design: SavedDesignFolder;
  loading: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onDownload: (e: React.MouseEvent) => void;
}

function DesignCard({ design, loading, onClick, onDelete, onDownload }: DesignCardProps) {
  const pageCount = design.pages.length;
  const createdDate = new Date(design.createdAt).toLocaleDateString();

  return (
    <GlassCard
      hoverable
      onClick={onClick}
      p="lg"
      style={{
        minHeight: 160,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Action buttons */}
      <Group gap={2} style={{ position: 'absolute', top: 8, right: 8 }}>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          onClick={onDownload}
        >
          <IconDownload size={14} />
        </ActionIcon>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          onClick={onDelete}
        >
          <IconTrash size={14} />
        </ActionIcon>
      </Group>

      {/* Loading overlay */}
      {loading && (
        <Box
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(255, 255, 255, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'inherit',
          }}
        >
          <Loader color="peach" size="sm" />
        </Box>
      )}

      {/* Content */}
      <Stack gap="sm" style={{ flex: 1 }}>
        <Stack gap={4}>
          <Text fw={600} size="md">{design.name}</Text>
          <Text size="xs" c="dimmed">{createdDate}</Text>
        </Stack>

        <Group gap="xs" mt="auto">
          {design.hasTheme && (
            <Badge size="xs" variant="light" color="peach">Theme</Badge>
          )}
          {pageCount > 0 && (
            <Badge size="xs" variant="light" color="gray" leftSection={<IconFile size={10} />}>
              {pageCount} {pageCount === 1 ? 'page' : 'pages'}
            </Badge>
          )}
        </Group>
      </Stack>
    </GlassCard>
  );
}
