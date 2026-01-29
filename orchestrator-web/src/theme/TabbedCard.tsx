import { forwardRef } from 'react';
import { Box, Group, Text, UnstyledButton, type BoxProps } from '@mantine/core';
import { glass, radii } from './tokens';

interface Tab {
  value: string;
  label: React.ReactNode;
}

interface TabbedCardProps extends Omit<BoxProps, 'children'> {
  /** Tabs to display in the header */
  tabs: Tab[];
  /** Currently active tab value */
  activeTab: string;
  /** Callback when tab changes */
  onTabChange: (value: string) => void;
  /** Content to render for the active tab */
  children: React.ReactNode;
  /** If true, content area uses flex layout to fill available space */
  flexContent?: boolean;
}

/**
 * Card with tabs in the header zone - like palette.html mockup.
 * Solid white background with warm shadow.
 */
export const TabbedCard = forwardRef<HTMLDivElement, TabbedCardProps>(
  ({ tabs, activeTab, onTabChange, style, children, flexContent, ...rest }, ref) => {
    return (
      <Box
        ref={ref}
        style={{
          borderRadius: radii.surface,
          background: glass.formCard.bg,
          border: glass.formCard.border,
          boxShadow: glass.formCard.shadow,
          overflow: 'hidden',
          ...(flexContent ? { display: 'flex', flexDirection: 'column' as const } : {}),
          ...(typeof style === 'object' ? style : {}),
        }}
        {...rest}
      >
        {/* Tab Header */}
        <Box
          style={{
            background: glass.modalZone.bg,
            borderBottom: glass.modalZone.border,
            flexShrink: 0,
          }}
        >
          <Group gap={0}>
            {tabs.map((tab) => {
              const isActive = tab.value === activeTab;
              return (
                <UnstyledButton
                  key={tab.value}
                  onClick={() => onTabChange(tab.value)}
                  px="lg"
                  py="sm"
                  style={{
                    borderBottom: isActive
                      ? '2px solid var(--mantine-color-peach-6)'
                      : '2px solid transparent',
                    marginBottom: '-1px',
                    transition: 'all 0.15s ease',
                    background: isActive ? 'rgba(255, 255, 255, 0.5)' : 'transparent',
                  }}
                >
                  <Text
                    size="sm"
                    fw={isActive ? 600 : 500}
                    c={isActive ? 'peach.7' : 'dimmed'}
                  >
                    {tab.label}
                  </Text>
                </UnstyledButton>
              );
            })}
          </Group>
        </Box>

        {/* Content */}
        <Box
          p="lg"
          style={flexContent ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } : undefined}
        >
          {children}
        </Box>
      </Box>
    );
  }
);

TabbedCard.displayName = 'TabbedCard';
