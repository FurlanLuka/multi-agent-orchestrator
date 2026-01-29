import { forwardRef } from 'react';
import { Group, type GroupProps } from '@mantine/core';
import { glass } from './tokens';

interface GlassBarProps extends GroupProps {
  position?: 'top' | 'bottom';
  children: React.ReactNode;
}

export const GlassBar = forwardRef<HTMLDivElement, GlassBarProps>(
  ({ position = 'top', style, children, ...rest }, ref) => {
    return (
      <Group
        ref={ref}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          zIndex: 100,
          ...(position === 'top' ? { top: 0 } : { bottom: 0 }),
          background: glass.bar.bg,
          backdropFilter: glass.bar.blur,
          WebkitBackdropFilter: glass.bar.blur,
          borderBottom: position === 'top' ? glass.bar.border : undefined,
          borderTop: position === 'bottom' ? glass.bar.border : undefined,
          boxShadow: glass.bar.shadow,
          ...(typeof style === 'object' ? style : {}),
        }}
        {...rest}
      >
        {children}
      </Group>
    );
  }
);

GlassBar.displayName = 'GlassBar';
