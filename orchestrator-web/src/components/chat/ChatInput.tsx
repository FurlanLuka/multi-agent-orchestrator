import { useRef } from 'react';
import {
  Group,
  ActionIcon,
  TextInput,
} from '@mantine/core';
import { IconSend } from '@tabler/icons-react';

interface ChatInputProps {
  placeholder: string;
  disabled: boolean;
  actionColor: string;
  onSend: (message: string) => void;
}

export function ChatInput({ placeholder, disabled, actionColor, onSend }: ChatInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    const input = inputRef.current;
    if (input && input.value.trim()) {
      onSend(input.value.trim());
      input.value = '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Group gap="sm">
      <TextInput
        ref={inputRef}
        placeholder={placeholder}
        style={{ flex: 1 }}
        disabled={disabled}
        onKeyDown={handleKeyDown}
        size="md"
        radius="md"
        styles={{
          input: {
            background: 'white',
            border: '1px solid #e8e4e0',
            '&:focus': {
              borderColor: 'var(--mantine-color-peach-5)',
            },
          },
        }}
      />
      <ActionIcon
        size="xl"
        variant="filled"
        color={actionColor === 'blue' ? 'peach' : actionColor}
        radius="md"
        onClick={handleSend}
        disabled={disabled}
      >
        <IconSend size={20} />
      </ActionIcon>
    </Group>
  );
}
