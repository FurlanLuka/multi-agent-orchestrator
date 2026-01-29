import { Modal, Box, Group, Title, CloseButton, type ModalProps } from '@mantine/core';
import { glass, radii } from './tokens';

interface StyledModalProps extends Omit<ModalProps, 'title'> {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Modal with warm header and footer zones.
 * Header has title and close button on warm background.
 * Footer (optional) has action buttons on warm background.
 */
export function StyledModal({
  title,
  children,
  footer,
  ...props
}: StyledModalProps) {
  return (
    <Modal.Root {...props}>
      <Modal.Overlay />
      <Modal.Content
        radius={radii.modal}
        style={{
          overflow: 'hidden',
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
            <Title order={4} style={{ fontWeight: 600 }}>
              {title}
            </Title>
            <CloseButton onClick={props.onClose} />
          </Group>
        </Box>

        {/* Body */}
        <Modal.Body p="lg">
          {children}
        </Modal.Body>

        {/* Footer */}
        {footer && (
          <Box
            px="lg"
            py="md"
            style={{
              background: glass.modalZone.bg,
              borderTop: glass.modalZone.border,
            }}
          >
            {footer}
          </Box>
        )}
      </Modal.Content>
    </Modal.Root>
  );
}
