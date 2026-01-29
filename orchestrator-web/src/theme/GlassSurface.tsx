import { forwardRef } from 'react';
import { Box, type BoxProps } from '@mantine/core';
import { glass, radii, transitions } from './tokens';

interface GlassSurfaceProps extends BoxProps {
  children: React.ReactNode;
}

export const GlassSurface = forwardRef<HTMLDivElement, GlassSurfaceProps>(
  ({ style, children, ...rest }, ref) => {
    return (
      <Box
        ref={ref}
        style={{
          borderRadius: radii.surface,
          background: glass.surface.bg,
          backdropFilter: glass.surface.blur,
          WebkitBackdropFilter: glass.surface.blur,
          border: glass.surface.border,
          boxShadow: glass.surface.shadow,
          transition: transitions.default,
          ...(typeof style === 'object' ? style : {}),
        }}
        {...rest}
      >
        {children}
      </Box>
    );
  }
);

GlassSurface.displayName = 'GlassSurface';
