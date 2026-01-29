import { useState, useEffect, useRef } from 'react';
import {
  Combobox,
  TextInput,
  useCombobox,
  Loader,
  Group,
  Text,
  Box,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconFolder, IconFolderOpen } from '@tabler/icons-react';
import { glass, radii, text } from '../theme';

interface DirectoryPickerProps {
  value: string;
  onChange: (path: string) => void;
  placeholder?: string;
  label?: string;
  description?: string;
  error?: string;
  port: number;
}

interface DirectoryResult {
  name: string;
  path: string;
}

interface CachedDir {
  current: string;
  directories: DirectoryResult[];
}

// In-memory cache shared across all instances
const pathCache = new Map<string, CachedDir>();

export function DirectoryPicker({ value, onChange, placeholder, label, description, error, port }: DirectoryPickerProps) {
  const [inputValue, setInputValue] = useState(value);
  const [directories, setDirectories] = useState<DirectoryResult[]>([]);
  const [currentDir, setCurrentDir] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [debouncedValue] = useDebouncedValue(inputValue, 150);
  const abortControllerRef = useRef<AbortController | null>(null);
  const homePathRef = useRef<string>('');

  // Shorten path by replacing home directory with ~
  const shortenPath = (path: string): string => {
    const home = homePathRef.current;
    if (!home || !path) return path;
    if (path.startsWith(home)) {
      return '~' + path.slice(home.length);
    }
    return path;
  };

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  // Sync external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Normalize path - prepend ~/ if doesn't start with / or ~
  const normalizePath = (path: string): string => {
    if (!path) return '~';
    if (path.startsWith('/') || path.startsWith('~')) return path;
    return '~/' + path;
  };

  // Get parent directory and search term from a path
  const getParentAndSearch = (path: string): { parent: string; search: string } => {
    const normalized = normalizePath(path);
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash === -1) {
      return { parent: '~', search: normalized.toLowerCase() };
    }
    const parent = normalized.slice(0, lastSlash) || '~';
    const search = normalized.slice(lastSlash + 1).toLowerCase();
    return { parent, search };
  };

  // Fetch directories for a given path
  const fetchDirectories = async (pathToFetch: string, filterTerm?: string) => {
    const normalizedPath = normalizePath(pathToFetch);

    // Check cache first
    const cacheKey = `${port}:${normalizedPath}`;
    const cached = pathCache.get(cacheKey);

    if (cached) {
      // Capture home path from cache if needed
      if (normalizedPath === '~' && cached.current && !homePathRef.current) {
        homePathRef.current = cached.current;
      }

      let dirs = cached.directories.map((dir: DirectoryResult) => ({
        ...dir,
        path: shortenPath(dir.path),
      }));

      // Apply case-insensitive filter if provided
      if (filterTerm) {
        dirs = dirs.filter(d => d.name.toLowerCase().includes(filterTerm));
      }

      setDirectories(dirs);
      setCurrentDir(shortenPath(cached.current || normalizedPath));
      if (dirs.length > 0) {
        combobox.openDropdown();
      }
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    try {
      const res = await fetch(
        `http://localhost:${port}/api/directories?path=${encodeURIComponent(normalizedPath)}`,
        { signal: abortControllerRef.current.signal }
      );
      if (!res.ok) {
        setDirectories([]);
        return;
      }
      const data = await res.json();

      // Capture home path on first ~ fetch
      if (normalizedPath === '~' && data.current && !homePathRef.current) {
        homePathRef.current = data.current;
      }

      // Cache the raw result
      pathCache.set(cacheKey, {
        current: data.current,
        directories: data.directories || [],
      });

      // Shorten all paths with ~
      let shortenedDirs = (data.directories || []).map((dir: DirectoryResult) => ({
        ...dir,
        path: shortenPath(dir.path),
      }));

      // Apply case-insensitive filter if provided
      if (filterTerm) {
        shortenedDirs = shortenedDirs.filter((d: DirectoryResult) =>
          d.name.toLowerCase().includes(filterTerm)
        );
      }

      setDirectories(shortenedDirs);
      setCurrentDir(shortenPath(data.current || normalizedPath));

      // Open dropdown if we have suggestions
      if (shortenedDirs.length > 0) {
        combobox.openDropdown();
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setDirectories([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch suggestions when input changes (only after user has interacted)
  useEffect(() => {
    // Don't fetch until user has clicked/focused the input
    if (!hasInteracted) return;

    // Empty input - show home directory
    if (!debouncedValue) {
      fetchDirectories('~');
      return;
    }

    const normalized = normalizePath(debouncedValue);

    // If ends with /, fetch that directory directly
    if (normalized.endsWith('/')) {
      fetchDirectories(normalized.slice(0, -1));
      return;
    }

    // Otherwise, get parent directory and filter by search term
    const { parent, search } = getParentAndSearch(debouncedValue);
    if (search) {
      fetchDirectories(parent, search);
    } else {
      fetchDirectories(parent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedValue, port, hasInteracted]);

  const handleInputChange = (val: string) => {
    setInputValue(val);
    onChange(val);
    combobox.openDropdown();
  };

  const handleFocus = () => {
    setHasInteracted(true);
    combobox.openDropdown();
    // If empty or no directories shown, fetch home
    if (!inputValue || directories.length === 0) {
      fetchDirectories('~');
    }
  };

  const handleOptionSelect = (path: string) => {
    // When selecting a directory, append a slash to continue browsing
    const newValue = path.endsWith('/') ? path : path + '/';
    setInputValue(newValue);
    onChange(newValue);
    // Keep dropdown open to show subdirectories
    combobox.openDropdown();
  };

  const options = directories.map((dir) => (
    <Combobox.Option value={dir.path} key={dir.path}>
      <Group gap="xs">
        <IconFolder size={14} style={{ color: 'var(--color-primary)' }} />
        <Text size="sm">{dir.name}</Text>
      </Group>
    </Combobox.Option>
  ));

  return (
    <Box>
      {label && (
        <Text
          component="label"
          size="sm"
          fw={500}
          mb={4}
          style={{ display: 'block', color: text.label }}
        >
          {label}
        </Text>
      )}
      {description && (
        <Text size="xs" mb={6} style={{ color: text.dimmed }}>
          {description}
        </Text>
      )}
      <Combobox
        store={combobox}
        onOptionSubmit={handleOptionSelect}
      >
        <Combobox.Target>
          <TextInput
            value={inputValue}
            onChange={(e) => handleInputChange(e.currentTarget.value)}
            onClick={handleFocus}
            onFocus={handleFocus}
            onBlur={() => combobox.closeDropdown()}
            placeholder={placeholder}
            error={error}
            leftSection={<IconFolderOpen size={16} style={{ color: 'var(--text-placeholder)' }} />}
            rightSection={loading ? <Loader size={14} /> : null}
            radius={radii.input}
            styles={{
              input: {
                backgroundColor: glass.input.bg,
                backdropFilter: glass.input.blur,
                WebkitBackdropFilter: glass.input.blur,
                border: glass.input.border,
                transition: 'all 0.2s ease',
                '&:focus': {
                  backgroundColor: glass.input.bgFocus,
                  borderColor: glass.input.borderFocusColor,
                  boxShadow: glass.input.focusRing,
                },
              },
            }}
          />
        </Combobox.Target>

        <Combobox.Dropdown>
          <Combobox.Options>
            {loading ? (
              <Combobox.Empty>
                <Group justify="center" py="xs">
                  <Loader size="xs" />
                  <Text size="sm" c="dimmed">Loading...</Text>
                </Group>
              </Combobox.Empty>
            ) : options.length > 0 ? (
              <>
                {currentDir && (
                  <Text
                    size="xs"
                    c="dimmed"
                    px="sm"
                    py={4}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {currentDir}
                  </Text>
                )}
                {options}
              </>
            ) : inputValue ? (
              <Combobox.Empty>
                <Text size="sm" c="dimmed">No subdirectories found</Text>
              </Combobox.Empty>
            ) : null}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
      {error && (
        <Text size="xs" c="red" mt={4}>
          {error}
        </Text>
      )}
    </Box>
  );
}
