import { Modal, Box, Group, Title, CloseButton, type ModalProps } from '@mantine/core';
import { glass, radii } from './tokens';

interface StyledModalProps extends Omit<ModalProps, 'title'> {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
}

/**
 * Modal with warm header and footer zones.
 * Header has title and close button on warm background.
 * Footer (optional) has action buttons on warm background.
 */
// Map Mantine size names to fixed pixel widths
const sizeMap: Record<string, number> = {
  xs: 320,
  sm: 380,
  md: 440,
  lg: 620,
  xl: 780,
};

export function StyledModal({
  title,
  children,
  footer,
  size = 'md',
  ...props
}: StyledModalProps) {
  // Get fixed width from size prop
  const fixedWidth = typeof size === 'number' ? size : sizeMap[size] || sizeMap.md;

  return (
    <Modal.Root
      {...props}
      size={fixedWidth}
      centered
      styles={{
        content: {
          width: fixedWidth,
          maxHeight: 'calc(100vh - 80px)',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <Modal.Overlay />
      <Modal.Content radius={radii.modal}>
        {/* Header */}
        <Box
          px="lg"
          py="md"
          style={{
            background: glass.modalZone.bg,
            borderBottom: glass.modalZone.border,
            flexShrink: 0,
          }}
        >
          <Group justify="space-between" align="center">
            <Title order={4} style={{ fontWeight: 600 }}>
              {title}
            </Title>
            <CloseButton onClick={props.onClose} />
          </Group>
        </Box>

        {/* Body */}
        <Box
          p="lg"
          style={{
            flex: 1,
            overflowY: 'auto',
            minHeight: 0,
          }}
        >
          {children}
        </Box>

        {/* Footer */}
        {footer && (
          <Box
            px="lg"
            py="md"
            style={{
              background: glass.modalZone.bg,
              borderTop: glass.modalZone.border,
              flexShrink: 0,
            }}
          >
            {footer}
          </Box>
        )}
      </Modal.Content>
    </Modal.Root>
  );
}
