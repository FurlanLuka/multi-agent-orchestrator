import { forwardRef, useState } from 'react';
import { Box, type BoxProps } from '@mantine/core';
import { glass, radii, transitions } from './tokens';

export interface GlassCardProps extends BoxProps {
  hoverable?: boolean;
  selected?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  children: React.ReactNode;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ hoverable = false, selected = false, onClick, style, children, ...rest }, ref) => {
    const [hovered, setHovered] = useState(false);

    const isActive = selected || hovered;

    return (
      <Box
        ref={ref}
        onClick={onClick}
        onMouseEnter={hoverable ? () => setHovered(true) : undefined}
        onMouseLeave={hoverable ? () => setHovered(false) : undefined}
        style={{
          borderRadius: radii.card,
          background: isActive ? glass.card.bgHover : glass.card.bg,
          backdropFilter: glass.card.blur,
          WebkitBackdropFilter: glass.card.blur,
          border: selected ? '1px solid var(--mantine-color-peach-6)' : glass.card.border,
          boxShadow: isActive ? glass.card.shadowHover : glass.card.shadow,
          transform: isActive ? 'translateY(-2px)' : 'translateY(0)',
          transition: transitions.lift,
          cursor: onClick ? 'pointer' : undefined,
          ...(typeof style === 'object' ? style : {}),
        }}
        {...rest}
      >
        {children}
      </Box>
    );
  }
);

GlassCard.displayName = 'GlassCard';
