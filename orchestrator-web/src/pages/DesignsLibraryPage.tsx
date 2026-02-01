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
} from '@mantine/core';
import { IconPlus, IconTrash, IconFile } from '@tabler/icons-react';
import type { SavedDesignFolder, SavedDesignFolderContents } from '@orchy/types';
import { GlassCard, GlassDashedCard } from '../theme';
import { DesignDetailModal } from '../components/design/DesignDetailModal';
import { useOrchestrator } from '../context/OrchestratorContext';

interface DesignsLibraryPageProps {
  onAddNew: () => void;
}

export function DesignsLibraryPage({ onAddNew }: DesignsLibraryPageProps) {
  const { port } = useOrchestrator();

  const [designs, setDesigns] = useState<SavedDesignFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [selectedDesign, setSelectedDesign] = useState<SavedDesignFolderContents | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingDesign, setLoadingDesign] = useState<string | null>(null);

  // Fetch designs on mount
  const fetchDesigns = useCallback(async () => {
    if (!port) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`http://localhost:${port}/api/designs`);
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
  }, [port]);

  useEffect(() => {
    fetchDesigns();
  }, [fetchDesigns]);

  // Handle clicking on a design card
  const handleDesignClick = async (design: SavedDesignFolder) => {
    if (!port) return;

    setLoadingDesign(design.name);

    try {
      const response = await fetch(`http://localhost:${port}/api/designs/${encodeURIComponent(design.name)}`);
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

  // Handle deleting a design
  const handleDeleteDesign = async (design: SavedDesignFolder, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!port) return;
    if (!confirm(`Delete "${design.name}"? This cannot be undone.`)) return;

    try {
      const response = await fetch(`http://localhost:${port}/api/designs/${encodeURIComponent(design.name)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete design');
      }
      // Refresh the list
      fetchDesigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete design');
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
            <Text c="dimmed" size="sm">
              Your saved design systems
            </Text>
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
                  onDelete={(e) => handleDeleteDesign(design, e)}
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
      />
    </>
  );
}

// Design Card Component
interface DesignCardProps {
  design: SavedDesignFolder;
  loading: boolean;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}

function DesignCard({ design, loading, onClick, onDelete }: DesignCardProps) {
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
      {/* Delete button */}
      <ActionIcon
        variant="subtle"
        color="gray"
        size="sm"
        style={{ position: 'absolute', top: 8, right: 8 }}
        onClick={onDelete}
      >
        <IconTrash size={14} />
      </ActionIcon>

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
          {design.hasComponents && (
            <Badge size="xs" variant="light" color="sage">Components</Badge>
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
