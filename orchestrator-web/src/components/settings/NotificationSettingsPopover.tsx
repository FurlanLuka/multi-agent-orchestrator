import { useState, useCallback } from 'react';
import {
  Popover,
  Stack,
  Group,
  Text,
  Switch,
  Slider,
  ActionIcon,
  Badge,
  Divider,
  Box,
} from '@mantine/core';
import {
  IconBell,
  IconVolume,
  IconBrowserCheck,
  IconEyeOff,
} from '@tabler/icons-react';
import { useNotificationSettings, type BrowserPermissionStatus } from '../../hooks/useNotificationSettings';
import { useAudioNotifications } from '../../hooks/useAudioNotifications';

export function NotificationSettingsPopover() {
  const [opened, setOpened] = useState(false);
  const { settings, updateSettings, getBrowserPermissionStatus, requestBrowserPermission } = useNotificationSettings();
  const { play } = useAudioNotifications();

  const browserPermission = getBrowserPermissionStatus();

  const handleSoundToggle = useCallback((enabled: boolean) => {
    updateSettings({ soundEnabled: enabled });
    if (enabled) {
      // Play a test sound when enabling
      play('soft', settings.soundVolume);
    }
  }, [updateSettings, play, settings.soundVolume]);

  const handleVolumeChange = useCallback((value: number) => {
    updateSettings({ soundVolume: value });
  }, [updateSettings]);

  const handleVolumeChangeEnd = useCallback((value: number) => {
    // Play a test sound when user releases the slider
    if (settings.soundEnabled) {
      play('soft', value);
    }
  }, [settings.soundEnabled, play]);

  const handleBrowserNotificationsToggle = useCallback(async (enabled: boolean) => {
    if (enabled) {
      // Request permission if not already granted
      const granted = await requestBrowserPermission();
      updateSettings({ browserNotificationsEnabled: granted });
    } else {
      updateSettings({ browserNotificationsEnabled: false });
    }
  }, [updateSettings, requestBrowserPermission]);

  const handleOnlyWhenHiddenToggle = useCallback((enabled: boolean) => {
    updateSettings({ notifyOnlyWhenHidden: enabled });
  }, [updateSettings]);

  const getPermissionBadge = useCallback((status: BrowserPermissionStatus) => {
    switch (status) {
      case 'granted':
        return <Badge size="xs" color="sage" variant="light">Allowed</Badge>;
      case 'denied':
        return <Badge size="xs" color="rose" variant="light">Blocked</Badge>;
      case 'default':
        return <Badge size="xs" color="honey" variant="light">Ask</Badge>;
      case 'unsupported':
        return <Badge size="xs" color="gray" variant="light">Unavailable</Badge>;
    }
  }, []);

  // Determine if the browser notification switch should be disabled
  const isBrowserNotificationDisabled = browserPermission === 'denied' || browserPermission === 'unsupported';

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      shadow="md"
      radius="lg"
      width={300}
    >
      <Popover.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="lg"
          onClick={() => setOpened(o => !o)}
          aria-label="Notification settings"
        >
          <IconBell size={20} />
        </ActionIcon>
      </Popover.Target>

      <Popover.Dropdown p="md">
        <Stack gap="md">
          <Text fw={600} size="sm" c="dimmed" tt="uppercase">
            Notifications
          </Text>

          {/* Sound notifications */}
          <Box>
            <Group justify="space-between" mb="xs">
              <Group gap="xs">
                <IconVolume size={16} style={{ color: 'var(--text-dimmed)' }} />
                <Text size="sm">Sound notifications</Text>
              </Group>
              <Switch
                checked={settings.soundEnabled}
                onChange={e => handleSoundToggle(e.currentTarget.checked)}
                size="sm"
              />
            </Group>
            {settings.soundEnabled && (
              <Slider
                value={settings.soundVolume}
                onChange={handleVolumeChange}
                onChangeEnd={handleVolumeChangeEnd}
                min={0}
                max={1}
                step={0.1}
                label={value => `${Math.round(value * 100)}%`}
                size="sm"
                color="peach"
                mt="xs"
                ml={24}
              />
            )}
          </Box>

          <Divider />

          {/* Browser notifications */}
          <Box>
            <Group justify="space-between">
              <Group gap="xs">
                <IconBrowserCheck size={16} style={{ color: 'var(--text-dimmed)' }} />
                <Text size="sm">Browser notifications</Text>
              </Group>
              <Group gap="xs">
                {getPermissionBadge(browserPermission)}
                <Switch
                  checked={settings.browserNotificationsEnabled && browserPermission === 'granted'}
                  onChange={e => handleBrowserNotificationsToggle(e.currentTarget.checked)}
                  disabled={isBrowserNotificationDisabled}
                  size="sm"
                />
              </Group>
            </Group>
            {browserPermission === 'denied' && (
              <Text size="xs" c="dimmed" mt="xs" ml={24}>
                Enable in browser settings to use notifications
              </Text>
            )}
          </Box>

          <Divider />

          {/* Only when hidden */}
          <Group justify="space-between">
            <Group gap="xs">
              <IconEyeOff size={16} style={{ color: 'var(--text-dimmed)' }} />
              <Text size="sm">Only when tab hidden</Text>
            </Group>
            <Switch
              checked={settings.notifyOnlyWhenHidden}
              onChange={e => handleOnlyWhenHiddenToggle(e.currentTarget.checked)}
              size="sm"
            />
          </Group>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
