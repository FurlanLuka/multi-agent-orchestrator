import { useState, useEffect } from 'react';
import {
  Modal,
  Box,
  Group,
  Title,
  CloseButton,
  Tabs,
  Text,
  Stack,
} from '@mantine/core';
import { IconPalette, IconComponents, IconFile } from '@tabler/icons-react';
import type { SavedDesignFolderContents } from '@orchy/types';
import { glass } from '../../theme';

interface DesignDetailModalProps {
  opened: boolean;
  design: SavedDesignFolderContents | null;
  onClose: () => void;
}

export function DesignDetailModal({ opened, design, onClose }: DesignDetailModalProps) {
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Build tabs array
  const tabs: Array<{ value: string; label: string; icon: React.ReactNode; html?: string }> = [];

  if (design?.hasTheme) {
    tabs.push({
      value: 'theme',
      label: 'Theme',
      icon: <IconPalette size={14} />,
      html: design.themeHtml,
    });
  }

  if (design?.hasComponents) {
    tabs.push({
      value: 'components',
      label: 'Components',
      icon: <IconComponents size={14} />,
      html: design.componentsHtml,
    });
  }

  // Add page tabs
  if (design?.pages) {
    for (const page of design.pages) {
      // Convert filename to display name
      const displayName = page
        .replace('.html', '')
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      tabs.push({
        value: page,
        label: displayName,
        icon: <IconFile size={14} />,
        html: design.pageHtmls[page],
      });
    }
  }

  // Set active tab to first available when design changes or modal opens
  useEffect(() => {
    if (opened && design && tabs.length > 0) {
      setActiveTab(tabs[0].value);
    }
  }, [opened, design?.name]);

  return (
    <Modal.Root
      opened={opened}
      onClose={onClose}
      fullScreen
      transitionProps={{ transition: 'fade', duration: 200 }}
    >
      <Modal.Overlay />
      <Modal.Content
        style={{
          background: glass.modal.bg,
          backdropFilter: glass.modal.blur,
        }}
      >
        {/* Header */}
        <Box
          px="lg"
          py="md"
          style={{
            background: glass.modalZone.bg,
            borderBottom: glass.modalZone.border,
          }}
        >
          <Group justify="space-between" align="center">
            <Group gap="md">
              <Title order={4} style={{ fontWeight: 600 }}>
                {design?.name || 'Design'}
              </Title>
            </Group>
            <CloseButton onClick={onClose} />
          </Group>
        </Box>

        {/* Tabs */}
        {design && tabs.length > 0 && (
          <Tabs
            value={activeTab}
            onChange={setActiveTab}
            style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}
          >
            <Tabs.List
              px="lg"
              style={{
                background: glass.modalZone.bg,
                borderBottom: glass.modalZone.border,
              }}
            >
              {tabs.map((tab) => (
                <Tabs.Tab
                  key={tab.value}
                  value={tab.value}
                  leftSection={tab.icon}
                >
                  {tab.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>

            {/* Tab Panels */}
            {tabs.map((tab) => (
              <Tabs.Panel
                key={tab.value}
                value={tab.value}
                style={{ flex: 1, overflow: 'hidden' }}
              >
                {tab.html ? (
                  <Box
                    style={{
                      height: '100%',
                      background: '#ffffff',
                    }}
                  >
                    <iframe
                      srcDoc={tab.html}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                      }}
                      title={tab.label}
                    />
                  </Box>
                ) : (
                  <Stack align="center" justify="center" h="100%" gap="md">
                    <Text c="dimmed" size="sm">No content available</Text>
                  </Stack>
                )}
              </Tabs.Panel>
            ))}
          </Tabs>
        )}

        {/* Empty state */}
        {design && tabs.length === 0 && (
          <Stack align="center" justify="center" h="calc(100vh - 60px)" gap="md">
            <Text c="dimmed" size="sm">This design has no content</Text>
          </Stack>
        )}
      </Modal.Content>
    </Modal.Root>
  );
}
