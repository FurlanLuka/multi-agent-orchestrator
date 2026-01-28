import { useRef } from 'react';
import {
  Paper,
  Group,
  TextInput,
  ActionIcon,
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
    <Paper p="sm" withBorder radius="md" shadow="sm">
      <Group gap="xs">
        <TextInput
          ref={inputRef}
          placeholder={placeholder}
          style={{ flex: 1 }}
          disabled={disabled}
          onKeyDown={handleKeyDown}
          radius="md"
          size="md"
        />
        <ActionIcon
          size="xl"
          variant="filled"
          color={actionColor}
          radius="md"
          onClick={handleSend}
          disabled={disabled}
        >
          <IconSend size={20} />
        </ActionIcon>
      </Group>
    </Paper>
  );
}
