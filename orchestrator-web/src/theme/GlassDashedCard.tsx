import { forwardRef, useState } from 'react';
import { Box, type BoxProps } from '@mantine/core';
import { glass, radii, transitions } from './tokens';

interface GlassDashedCardProps extends BoxProps {
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  children: React.ReactNode;
}

export const GlassDashedCard = forwardRef<HTMLDivElement, GlassDashedCardProps>(
  ({ onClick, style, children, ...rest }, ref) => {
    const [hovered, setHovered] = useState(false);

    return (
      <Box
        ref={ref}
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          borderRadius: radii.card,
          background: hovered ? glass.dashed.bgHover : glass.dashed.bg,
          backdropFilter: glass.dashed.blur,
          WebkitBackdropFilter: glass.dashed.blur,
          border: hovered ? glass.dashed.borderHover : glass.dashed.border,
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

GlassDashedCard.displayName = 'GlassDashedCard';
