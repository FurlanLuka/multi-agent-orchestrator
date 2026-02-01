import { ActionIcon } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

interface BackButtonProps {
  to?: string;
  onClick?: () => void;
}

export function BackButton({ to, onClick }: BackButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (to) {
      navigate(to);
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
