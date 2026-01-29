import { Stack, Title, Text, SimpleGrid, Group, Badge, ActionIcon } from '@mantine/core';
import { IconPalette, IconTrash, IconEye } from '@tabler/icons-react';
import { FormCard, GlassSurface } from '../../theme';

interface SavedDesign {
  name: string;
  path: string;
  createdAt: number;
  context?: string;
  themeMode?: 'light' | 'dark' | 'both';
}

interface DesignLibraryProps {
  designs: SavedDesign[];
  onSelectDesign: (path: string) => void;
  onDeleteDesign: (path: string) => void;
  onPreviewDesign: (path: string) => void;
}

export function DesignLibrary({
  designs,
  onSelectDesign,
  onDeleteDesign,
  onPreviewDesign,
}: DesignLibraryProps) {
  if (designs.length === 0) {
    return (
      <GlassSurface p="xl" ta="center">
        <Stack align="center" gap="sm">
          <IconPalette size={48} color="var(--mantine-color-gray-5)" />
          <Title order={4} c="dimmed">No saved designs yet</Title>
          <Text size="sm" c="dimmed">
            Complete a design session to add designs to your library
          </Text>
        </Stack>
      </GlassSurface>
    );
  }

  return (
    <Stack gap="md">
      <Title order={4} fw={600}>
        Design Library
      </Title>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {designs.map((design) => (
          <DesignCard
            key={design.path}
            design={design}
            onSelect={() => onSelectDesign(design.path)}
            onDelete={() => onDeleteDesign(design.path)}
            onPreview={() => onPreviewDesign(design.path)}
          />
        ))}
      </SimpleGrid>
    </Stack>
  );
}

interface DesignCardProps {
  design: SavedDesign;
  onSelect: () => void;
  onDelete: () => void;
  onPreview: () => void;
}

function DesignCard({ design, onSelect, onDelete, onPreview }: DesignCardProps) {
  const formattedDate = new Date(design.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <FormCard
      hoverable
      onClick={onSelect}
      style={{ cursor: 'pointer' }}
    >
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text fw={600} size="sm">
              {design.name}
            </Text>
            <Text size="xs" c="dimmed">
              {formattedDate}
            </Text>
          </div>

          <Group gap={4}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onPreview();
              }}
            >
              <IconEye size={14} />
            </ActionIcon>
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        </Group>

        {design.context && (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {design.context}
          </Text>
        )}

        {design.themeMode && (
          <Badge variant="light" color="peach" size="xs">
            {design.themeMode === 'both' ? 'Light + Dark' : design.themeMode}
          </Badge>
        )}
      </Stack>
    </FormCard>
  );
}
