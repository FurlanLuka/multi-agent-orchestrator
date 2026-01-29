import { forwardRef, useState } from 'react';
import { Box, Title, Group, ActionIcon, type BoxProps } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { glass, radii, transitions } from './tokens';

interface FormCardProps extends BoxProps {
  /** Card title - renders in warm header zone. Can be string or ReactNode for complex headers. */
  title?: React.ReactNode;
  /** Back button callback - renders arrow left of title */
  onBack?: () => void;
  /** Footer content - renders in warm footer zone (typically action buttons) */
  footer?: React.ReactNode;
  /** Enable hover lift effect */
  hoverable?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  children: React.ReactNode;
}

/**
 * Solid white card with warm shadow - "style-a" from mockup.
 * Used for forms and modal-like content that needs to stand out
 * from the warm gradient background.
 *
 * Supports optional title (renders in warm header) and footer (renders in warm footer zone).
 */
export const FormCard = forwardRef<HTMLDivElement, FormCardProps>(
  ({ title, onBack, footer, hoverable = false, onClick, style, children, ...rest }, ref) => {
    const [hovered, setHovered] = useState(false);

    const hasZones = title || footer;

    return (
      <Box
        ref={ref}
        onClick={onClick}
        onMouseEnter={hoverable ? () => setHovered(true) : undefined}
        onMouseLeave={hoverable ? () => setHovered(false) : undefined}
        style={{
          borderRadius: radii.surface,
          background: glass.formCard.bg,
          border: glass.formCard.border,
          boxShadow: hovered ? glass.formCard.shadowHover : glass.formCard.shadow,
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
          transition: transitions.lift,
          cursor: onClick ? 'pointer' : undefined,
          overflow: 'hidden',
          ...(typeof style === 'object' ? style : {}),
        }}
        {...rest}
      >
        {/* Header zone */}
        {title && (
          <Box
            px="lg"
            py="md"
            style={{
              background: glass.modalZone.bg,
              borderBottom: glass.modalZone.border,
            }}
          >
            <Group gap="sm" align="center">
              {onBack && (
                <ActionIcon variant="subtle" color="gray" size="md" onClick={onBack}>
                  <IconArrowLeft size={18} />
                </ActionIcon>
              )}
              {typeof title === 'string' ? (
                <Title order={4} style={{ fontWeight: 600 }}>
                  {title}
                </Title>
              ) : (
                title
              )}
            </Group>
          </Box>
        )}

        {/* Content */}
        <Box p={hasZones ? 'lg' : 24}>
          {children}
        </Box>

        {/* Footer zone */}
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
      </Box>
    );
  }
);

FormCard.displayName = 'FormCard';
