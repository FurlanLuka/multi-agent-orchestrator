import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Box, Group, Text, Button } from '@mantine/core';
import { IconHelp } from '@tabler/icons-react';
import { glass, radii } from '../../theme/tokens';

interface HelpOverlayProps {
  trigger: ReactNode;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  confirmText?: string;
  confirmColor?: string;
  maxWidth?: number;
}

/**
 * A reusable help overlay component with:
 * - Trigger element (typically "Need help?" text)
 * - Dimmed backdrop using glass.overlay tokens
 * - Centered glass card using glass.modal tokens
 * - Header with icon and title
 * - Content area for help text
 * - "Got it!" button to close
 * - Click-outside and Escape key to dismiss
 */
export function HelpOverlay({
  trigger,
  title,
  icon,
  children,
  confirmText = 'Got it!',
  confirmColor = 'peach',
  maxWidth = 440,
}: HelpOverlayProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpen = useCallback(() => setIsOpen(true), []);
  const handleClose = useCallback(() => setIsOpen(false), []);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Prevent body scroll when overlay is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Trigger */}
      <Box onClick={handleOpen} style={{ cursor: 'pointer' }}>
        {trigger}
      </Box>

      {/* Overlay */}
      {isOpen && (
        <Box
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          {/* Backdrop */}
          <Box
            onClick={handleClose}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: glass.overlay.bg,
              backdropFilter: glass.overlay.blur,
              WebkitBackdropFilter: glass.overlay.blur,
              animation: 'helpOverlayFadeIn 0.2s ease',
            }}
          />

          {/* Card */}
          <Box
            style={{
              position: 'relative',
              width: '100%',
              maxWidth,
              background: glass.modal.bg,
              backdropFilter: glass.modal.blur,
              WebkitBackdropFilter: glass.modal.blur,
              border: glass.modal.border,
              boxShadow: glass.modal.shadow,
              borderRadius: radii.modal,
              overflow: 'hidden',
              animation: 'helpOverlayScaleIn 0.2s ease',
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
              <Group gap="sm">
                {icon || <IconHelp size={20} style={{ color: 'var(--mantine-color-lavender-5)' }} />}
                <Text fw={600} size="md">
                  {title}
                </Text>
              </Group>
            </Box>

            {/* Content */}
            <Box
              p="lg"
              style={{
                maxHeight: 'calc(100vh - 200px)',
                overflowY: 'auto',
              }}
            >
              {children}
            </Box>

            {/* Footer */}
            <Box
              px="lg"
              py="md"
              style={{
                background: glass.modalZone.bg,
                borderTop: glass.modalZone.border,
              }}
            >
              <Group justify="flex-end">
                <Button color={confirmColor} onClick={handleClose}>
                  {confirmText}
                </Button>
              </Group>
            </Box>
          </Box>

          {/* Animations */}
          <style>{`
            @keyframes helpOverlayFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes helpOverlayScaleIn {
              from {
                opacity: 0;
                transform: scale(0.95);
              }
              to {
                opacity: 1;
                transform: scale(1);
              }
            }
          `}</style>
        </Box>
      )}
    </>
  );
}
