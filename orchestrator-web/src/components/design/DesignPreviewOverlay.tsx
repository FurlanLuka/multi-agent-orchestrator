import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Group,
  Title,
  Text,
  Button,
  ActionIcon,
} from '@mantine/core';
import { IconX, IconMessageCircle, IconCheck, IconWand } from '@tabler/icons-react';
import type { ThemeOption, ComponentStyleOption, MockupOption } from '@orchy/types';
import { TabbedCard, glass, radii } from '../../theme';
import { useOrchestrator } from '../../context/OrchestratorContext';

interface DesignPreviewOverlayProps {
  opened: boolean;
  type: 'theme' | 'component' | 'mockup';
  options: ThemeOption[] | ComponentStyleOption[] | MockupOption[];
  onSelect: (index: number) => void;
  onRefine: (index: number) => void;
  onBackToDiscovery: () => void;
  onClose: () => void;
}

const typeLabels = {
  theme: 'Theme',
  component: 'Component Style',
  mockup: 'Layout Mockup',
};

export function DesignPreviewOverlay({
  opened,
  type,
  options,
  onSelect,
  onRefine,
  onBackToDiscovery,
  onClose,
}: DesignPreviewOverlayProps) {
  const [activeTab, setActiveTab] = useState('0');
  const { port } = useOrchestrator();

  // Reset tab when options change
  useEffect(() => {
    setActiveTab('0');
  }, [options]);

  if (!opened || options.length === 0) return null;

  const tabs = options.map((opt, i) => ({
    value: String(i),
    label: (opt as ThemeOption | ComponentStyleOption | MockupOption).name,
  }));

  const currentOption = options[Number(activeTab)] as ThemeOption | ComponentStyleOption | MockupOption;

  return (
    <Box
      style={{
        position: 'fixed',
        inset: 0,
        background: glass.overlay.bg,
        backdropFilter: glass.overlay.blur,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        padding: 24,
      }}
    >
      {/* Header with title and close */}
      <Group justify="space-between" mb="md">
        <Title order={4} fw={600} c="white">
          Choose a {typeLabels[type]}
        </Title>
        <ActionIcon variant="subtle" color="gray" onClick={onClose} style={{ color: 'white' }}>
          <IconX size={20} />
        </ActionIcon>
      </Group>

      {/* TabbedCard with preview */}
      <TabbedCard
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        flexContent
        style={{ flex: 1, overflow: 'hidden' }}
      >
        <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Description */}
          <Text size="sm" c="dimmed" mb="md">
            {currentOption.description}
          </Text>

          {/* Preview iframe */}
          <Box style={{ flex: 1, minHeight: 0 }}>
            {type === 'mockup' ? (
              <MockupFrame
                html={(currentOption as MockupOption).previewHtml}
                draftIndex={(currentOption as MockupOption).draftIndex}
                port={port}
              />
            ) : (
              <PreviewFrame html={(currentOption as ThemeOption | ComponentStyleOption).previewHtml} />
            )}
          </Box>
        </Box>
      </TabbedCard>

      {/* Footer with actions */}
      <Group justify="space-between" mt="md">
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconMessageCircle size={16} />}
          onClick={onBackToDiscovery}
          style={{ color: 'white' }}
        >
          Let me explain more
        </Button>
        <Group gap="sm">
          <Button
            variant="subtle"
            color="gray"
            leftSection={<IconWand size={16} />}
            onClick={() => onRefine(Number(activeTab))}
            style={{ color: 'white' }}
          >
            Refine this one
          </Button>
          <Button
            variant="filled"
            color="peach"
            leftSection={<IconCheck size={16} />}
            onClick={() => onSelect(Number(activeTab))}
          >
            Select & continue
          </Button>
        </Group>
      </Group>
    </Box>
  );
}

/**
 * Standard preview frame for theme and component previews
 */
function PreviewFrame({ html }: { html: string }) {
  return (
    <Box
      style={{
        background: '#ffffff',
        borderRadius: radii.input,
        border: glass.surface.border,
        overflow: 'hidden',
        height: '100%',
      }}
    >
      <iframe
        srcDoc={html}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
        }}
        title="Design Preview"
      />
    </Box>
  );
}

/**
 * Mockup frame with fake browser chrome
 * Supports both direct HTML (previewHtml) and draft fetching (draftIndex)
 */
function MockupFrame({
  html,
  draftIndex,
  port,
}: {
  html?: string;
  draftIndex?: number;
  port: number | null;
}) {
  // Determine iframe source - either direct HTML (srcDoc) or URL (src)
  const iframeSrc = useMemo(() => {
    if (draftIndex !== undefined && port) {
      return `http://localhost:${port}/api/designer/draft/${draftIndex}`;
    }
    return undefined;
  }, [draftIndex, port]);

  // Use srcDoc for direct HTML, src for draft URL
  const useDirectHtml = html && draftIndex === undefined;

  return (
    <Box
      style={{
        background: '#ffffff',
        borderRadius: radii.input,
        border: glass.surface.border,
        overflow: 'hidden',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Browser Chrome */}
      <Box
        style={{
          background: '#f5f5f5',
          padding: '10px 16px',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        {/* Traffic lights */}
        <Box
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#ff5f57',
          }}
        />
        <Box
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#febc2e',
          }}
        />
        <Box
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: '#28c840',
          }}
        />
        {/* URL bar */}
        <Box
          style={{
            flex: 1,
            marginLeft: 16,
            padding: '4px 12px',
            background: '#ffffff',
            borderRadius: 6,
            border: '1px solid #e0e0e0',
          }}
        >
          <Text size="xs" c="dimmed">
            preview.design
          </Text>
        </Box>
      </Box>

      {/* Iframe - uses src for draft URL, srcDoc for direct HTML */}
      {useDirectHtml ? (
        <iframe
          srcDoc={html}
          style={{
            width: '100%',
            flex: 1,
            border: 'none',
          }}
          title="Mockup Preview"
        />
      ) : iframeSrc ? (
        <iframe
          src={iframeSrc}
          style={{
            width: '100%',
            flex: 1,
            border: 'none',
          }}
          title="Mockup Preview"
        />
      ) : (
        <Box
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text c="dimmed">No preview available</Text>
        </Box>
      )}
    </Box>
  );
}
