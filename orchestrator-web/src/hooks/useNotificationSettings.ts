import { useLocalStorage } from '@mantine/hooks';
import { useCallback, useState, useEffect } from 'react';
import { isTauri } from '../lib/tauri';

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

  // Track permission status for async updates (Tauri)
  const [permissionStatus, setPermissionStatus] = useState<BrowserPermissionStatus>('default');

  const updateSettings = useCallback((updates: Partial<NotificationSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, [setSettings]);

  // Check permission status on mount and when needed
  const refreshPermissionStatus = useCallback(async (): Promise<BrowserPermissionStatus> => {
    console.log('[NotificationSettings] refreshPermissionStatus called, isTauri:', isTauri());
    if (isTauri() && window.__TAURI__) {
      try {
        const { isPermissionGranted } = await import('@tauri-apps/plugin-notification');
        const granted = await isPermissionGranted();
        console.log('[NotificationSettings] Tauri isPermissionGranted:', granted);
        const status = granted ? 'granted' : 'default';
        setPermissionStatus(status);
        return status;
      } catch (err) {
        console.error('[NotificationSettings] Tauri permission check error:', err);
        setPermissionStatus('unsupported');
        return 'unsupported';
      }
    }

    // Browser fallback
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermissionStatus('unsupported');
      return 'unsupported';
    }
    const status = Notification.permission as BrowserPermissionStatus;
    setPermissionStatus(status);
    return status;
  }, []);

  // Sync version that returns cached status (for UI)
  const getBrowserPermissionStatus = useCallback((): BrowserPermissionStatus => {
    return permissionStatus;
  }, [permissionStatus]);

  const requestBrowserPermission = useCallback(async (): Promise<boolean> => {
    if (isTauri() && window.__TAURI__) {
      try {
        const { isPermissionGranted, requestPermission } =
          await import('@tauri-apps/plugin-notification');

        let permitted = await isPermissionGranted();
        if (!permitted) {
          const result = await requestPermission();
          permitted = result === 'granted';
        }
        setPermissionStatus(permitted ? 'granted' : 'denied');
        return permitted;
      } catch {
        setPermissionStatus('unsupported');
        return false;
      }
    }

    // Browser fallback
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
    const granted = result === 'granted';
    setPermissionStatus(granted ? 'granted' : 'denied');
    return granted;
  }, []);

  // Initialize permission status on mount
  useEffect(() => {
    refreshPermissionStatus();
  }, [refreshPermissionStatus]);

  return {
    settings,
    updateSettings,
    getBrowserPermissionStatus,
    requestBrowserPermission,
    refreshPermissionStatus,
  };
}
