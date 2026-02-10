import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Group,
  Title,
  Text,
  Button,
  ActionIcon,
  Loader,
} from '@mantine/core';
import { IconX, IconMessageCircle, IconCheck, IconWand } from '@tabler/icons-react';
import type { ThemeOption, ComponentStyleOption, MockupOption } from '@orchy/types';
import { TabbedCard, GlassTextInput, glass, radii } from '../../theme';
import { useOrchestrator } from '../../context/OrchestratorContext';

/**
 * Zero-HTML Architecture: Options now contain only metadata (id, name, description).
 * Preview HTML is fetched from /api/designer/draft/:type/:index endpoint.
 */
interface DesignPreviewOverlayProps {
  opened: boolean;
  type: 'theme' | 'component' | 'mockup';
  options: ThemeOption[] | ComponentStyleOption[] | MockupOption[];
  onSelect: (index: number, pageName?: string) => void;
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
  const [pageName, setPageName] = useState('');
  const { port } = useOrchestrator();

  // Reset tab when options change
  useEffect(() => {
    setActiveTab('0');
  }, [options]);

  // Initialize page name from current mockup option name when tab changes
  useEffect(() => {
    if (type === 'mockup' && options.length > 0) {
      const currentOption = options[Number(activeTab)] as MockupOption;
      setPageName(currentOption?.name || 'New Page');
    }
  }, [type, activeTab, options]);

  if (!opened || options.length === 0) return null;

  const tabs = options.map((opt, i) => ({
    value: String(i),
    label: (opt as ThemeOption | ComponentStyleOption | MockupOption).name,
  }));

  const currentOption = options[Number(activeTab)] as ThemeOption | ComponentStyleOption | MockupOption;
  const currentIndex = Number(activeTab);

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

          {/* Preview iframe - fetches from API based on type */}
          <Box style={{ flex: 1, minHeight: 0 }}>
            <PreviewFrame
              type={type}
              index={currentIndex}
              port={port}
              // Legacy support: use previewHtml if provided
              legacyHtml={(currentOption as any).previewHtml}
            />
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
          {/* Page name input for mockups */}
          {type === 'mockup' && (
            <GlassTextInput
              placeholder="Page name"
              value={pageName}
              onChange={(e) => setPageName(e.currentTarget.value)}
              style={{ width: 200 }}
              styles={{
                input: {
                  background: 'rgba(255, 255, 255, 0.1)',
                  borderColor: 'rgba(255, 255, 255, 0.2)',
                  color: 'white',
                },
              }}
            />
          )}
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
            onClick={() => onSelect(Number(activeTab), type === 'mockup' ? pageName : undefined)}
          >
            Select & continue
          </Button>
        </Group>
      </Group>
    </Box>
  );
}

/**
 * Unified preview frame that fetches HTML from the API.
 * Zero-HTML Architecture: Always fetches from /api/designer/draft/:type/:index
 * Falls back to legacyHtml for backwards compatibility.
 */
function PreviewFrame({
  type,
  index,
  port,
  legacyHtml,
}: {
  type: 'theme' | 'component' | 'mockup';
  index: number;
  port: number | null;
  legacyHtml?: string;
}) {
  // Build the API URL for fetching the draft
  const iframeSrc = useMemo(() => {
    if (port) {
      return `http://localhost:${port}/api/designer/draft/${type}/${index}`;
    }
    return undefined;
  }, [type, index, port]);

  // Use legacy HTML if provided and no port (backwards compatibility)
  const useLegacyHtml = legacyHtml && !port;

  // Mockups get browser chrome, themes/components don't
  if (type === 'mockup') {
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
          <Box style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }} />
          <Box style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }} />
          <Box style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }} />
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
            <Text size="xs" c="dimmed">preview.design</Text>
          </Box>
        </Box>

        {/* Iframe */}
        {useLegacyHtml ? (
          <iframe
            srcDoc={legacyHtml}
            style={{ width: '100%', flex: 1, border: 'none' }}
            title="Mockup Preview"
          />
        ) : iframeSrc ? (
          <iframe
            src={iframeSrc}
            style={{ width: '100%', flex: 1, border: 'none' }}
            title="Mockup Preview"
          />
        ) : (
          <Box style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader size="sm" color="gray" />
          </Box>
        )}
      </Box>
    );
  }

  // Theme and component previews (no browser chrome)
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
      {useLegacyHtml ? (
        <iframe
          srcDoc={legacyHtml}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="Design Preview"
        />
      ) : iframeSrc ? (
        <iframe
          src={iframeSrc}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="Design Preview"
        />
      ) : (
        <Box style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader size="sm" color="gray" />
        </Box>
      )}
    </Box>
  );
}
