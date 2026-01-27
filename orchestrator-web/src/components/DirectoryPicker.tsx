import { useState, useEffect } from 'react';
import {
  TextInput,
  Button,
  Stack,
  Text,
  Group,
  ActionIcon,
  Loader,
  Alert,
  ScrollArea,
  Modal,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconFolder,
  IconFolderSearch,
  IconArrowUp,
} from '@tabler/icons-react';

interface DirectoryPickerProps {
  value: string;
  onChange: (path: string) => void;
  placeholder?: string;
  label?: string;
  description?: string;
  error?: string;
  port: number;
}

export function DirectoryPicker({ value, onChange, placeholder, label, description, error, port }: DirectoryPickerProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [currentPath, setCurrentPath] = useState(value || '~');
  const [directories, setDirectories] = useState<{name: string, path: string}[]>([]);
  const [parentPath, setParentPath] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchDirectories = async (pathToFetch: string) => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`http://localhost:${port}/api/directories?path=${encodeURIComponent(pathToFetch)}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to fetch directories');
      }
      const data = await res.json();
      setDirectories(data.directories);
      setCurrentPath(data.current);
      setParentPath(data.parent);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch directories');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (opened) {
      fetchDirectories(value || '~');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const handleOpen = () => {
    setCurrentPath(value || '~');
    open();
  };

  return (
    <>
      <TextInput
        label={label}
        description={description}
        error={error}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        leftSection={<IconFolder size={16} />}
        rightSection={
          <ActionIcon variant="subtle" onClick={handleOpen}>
            <IconFolderSearch size={16} />
          </ActionIcon>
        }
      />
      <Modal opened={opened} onClose={close} title="Select Directory" size="md">
        <Stack gap="md">
          <TextInput
            value={currentPath}
            onChange={(e) => setCurrentPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchDirectories(currentPath)}
            leftSection={<IconFolder size={16} />}
            placeholder="Enter path and press Enter"
          />

          {fetchError && (
            <Alert color="red" variant="light">
              {fetchError}
            </Alert>
          )}

          <Button
            variant="subtle"
            leftSection={<IconArrowUp size={14} />}
            onClick={() => fetchDirectories(parentPath)}
            disabled={loading || currentPath === parentPath}
          >
            Go Up
          </Button>

          <ScrollArea h={300}>
            <Stack gap="xs">
              {loading ? (
                <Group justify="center" py="xl">
                  <Loader size="sm" />
                </Group>
              ) : directories.length === 0 ? (
                <Text size="sm" c="dimmed" ta="center" py="xl">
                  No subdirectories found
                </Text>
              ) : (
                directories.map(dir => (
                  <Button
                    key={dir.path}
                    variant="subtle"
                    justify="flex-start"
                    leftSection={<IconFolder size={14} />}
                    onClick={() => fetchDirectories(dir.path)}
                  >
                    {dir.name}
                  </Button>
                ))
              )}
            </Stack>
          </ScrollArea>

          <Button onClick={() => { onChange(currentPath); close(); }} disabled={loading}>
            Select This Directory
          </Button>
        </Stack>
      </Modal>
    </>
  );
}
