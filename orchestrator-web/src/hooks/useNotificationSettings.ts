import { useLocalStorage } from '@mantine/hooks';
import { useCallback } from 'react';

export interface NotificationSettings {
  soundEnabled: boolean;
  soundVolume: number;        // 0-1
  browserNotificationsEnabled: boolean;
  notifyOnlyWhenHidden: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  soundEnabled: true,
  soundVolume: 0.5,
  browserNotificationsEnabled: false,
  notifyOnlyWhenHidden: true,
};

export type BrowserPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export function useNotificationSettings() {
  const [settings, setSettings] = useLocalStorage<NotificationSettings>({
    key: 'orchy-notification-settings',
    defaultValue: DEFAULT_SETTINGS,
  });

  const updateSettings = useCallback((updates: Partial<NotificationSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, [setSettings]);

  const getBrowserPermissionStatus = useCallback((): BrowserPermissionStatus => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission as BrowserPermissionStatus;
  }, []);

  const requestBrowserPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission === 'denied') {
      return false;
    }

    // Permission is 'default', so request it
    const result = await Notification.requestPermission();
    return result === 'granted';
  }, []);

  return {
    settings,
    updateSettings,
    getBrowserPermissionStatus,
    requestBrowserPermission,
  };
}
