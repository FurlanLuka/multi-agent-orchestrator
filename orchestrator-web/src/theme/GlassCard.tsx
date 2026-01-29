import { forwardRef, useState } from 'react';
import { Box, type BoxProps } from '@mantine/core';
import { glass, radii, transitions } from './tokens';

interface GlassCardProps extends BoxProps {
  hoverable?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  children: React.ReactNode;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ hoverable = false, onClick, style, children, ...rest }, ref) => {
    const [hovered, setHovered] = useState(false);

    return (
      <Box
        ref={ref}
        onClick={onClick}
        onMouseEnter={hoverable ? () => setHovered(true) : undefined}
        onMouseLeave={hoverable ? () => setHovered(false) : undefined}
        style={{
          borderRadius: radii.card,
          background: hovered ? glass.card.bgHover : glass.card.bg,
          backdropFilter: glass.card.blur,
          WebkitBackdropFilter: glass.card.blur,
          border: glass.card.border,
          boxShadow: hovered ? glass.card.shadowHover : glass.card.shadow,
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
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
