import { ActionIcon } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

interface BackButtonProps {
  to?: string | number;  // string path or -1 to go back
  onClick?: () => void;
}

export function BackButton({ to, onClick }: BackButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (to !== undefined) {
      if (typeof to === 'number') {
        navigate(to);
      } else {
        navigate(to);
      }
    } else {
      navigate(-1);
    }
  };

  return (
    <ActionIcon
      variant="subtle"
      color="gray"
      size="lg"
      onClick={handleClick}
      style={{
        position: 'fixed',
        top: 20,
        left: 20,
        zIndex: 100,
      }}
    >
      <IconArrowLeft size={20} />
    </ActionIcon>
  );
}
