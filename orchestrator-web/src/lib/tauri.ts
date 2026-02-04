/**
 * Tauri integration helpers for the Orchestrator frontend
 *
 * This module provides utilities for:
 * - Detecting if running inside Tauri
 * - Getting the backend port from Tauri
 * - Listening for Tauri events
 */

// Types are defined in ../types/global.d.ts

/**
 * Check if running inside Tauri
 */
export function isTauri(): boolean {
  const result = typeof window !== 'undefined' && !!window.__TAURI__;
  console.log('[Tauri] isTauri check:', result, 'window.__TAURI__:', typeof window !== 'undefined' ? window.__TAURI__ : 'undefined');
  return result;
}

/**
 * Get the backend port from Tauri
 * Returns null if not in Tauri or port not yet available
 */
export async function getBackendPort(): Promise<number | null> {
  // Check window variable first (set by Tauri on startup)
  if (typeof window !== 'undefined' && window.__ORCHESTRATOR_PORT__) {
    return window.__ORCHESTRATOR_PORT__;
  }

  // Try Tauri invoke if available (Tauri v2 uses core.invoke)
  if (isTauri() && window.__TAURI__) {
    try {
      // Tauri v2: invoke is under core
      const invoke = window.__TAURI__.core?.invoke || window.__TAURI__.invoke;
      if (invoke) {
        const port = await invoke<number | null>('get_backend_port');
        return port;
      }
    } catch (e) {
      console.error('Failed to get backend port from Tauri:', e);
    }
  }

  return null;
}

/**
 * Check if the backend is ready
 */
export async function isBackendReady(): Promise<boolean> {
  if (isTauri() && window.__TAURI__) {
    try {
      // Tauri v2: invoke is under core
      const invoke = window.__TAURI__.core?.invoke || window.__TAURI__.invoke;
      if (invoke) {
        return await invoke<boolean>('is_backend_ready');
      }
    } catch (e) {
      console.error('Failed to check backend status:', e);
    }
  }

  // If not in Tauri, assume backend is ready (user started it manually)
  return true;
}

/**
 * Listen for backend ready event from Tauri
 */
export async function onBackendReady(callback: (port: number) => void): Promise<() => void> {
  console.log('[Tauri] onBackendReady called, isTauri:', isTauri());
  if (isTauri() && window.__TAURI__) {
    console.log('[Tauri] Setting up backend-ready listener, __TAURI__.event:', window.__TAURI__.event);
    return window.__TAURI__.event.listen<number>('backend-ready', (event) => {
      console.log('[Tauri] backend-ready event received:', event);
      callback(event.payload);
    });
  }

  console.log('[Tauri] Not in Tauri mode, returning no-op');
  // No-op cleanup function if not in Tauri
  return () => {};
}

/**
 * Listen for backend error event from Tauri
 */
export async function onBackendError(callback: (error: string) => void): Promise<() => void> {
  if (isTauri() && window.__TAURI__) {
    return window.__TAURI__.event.listen<string>('backend-error', (event) => {
      callback(event.payload);
    });
  }

  return () => {};
}

/**
 * Get the socket URL for connecting to the backend
 * Handles both Tauri and standalone modes
 */
export async function getSocketUrl(): Promise<string> {
  const port = await getBackendPort();

  if (port) {
    return `http://localhost:${port}`;
  }

  // Default fallback
  return 'http://localhost:3456';
}

/**
 * Open a URL in the system browser.
 * Uses Tauri shell plugin when in Tauri, falls back to window.open otherwise.
 */
export async function openUrl(url: string): Promise<void> {
  if (isTauri() && window.__TAURI__) {
    try {
      // Tauri v2: use @tauri-apps/plugin-shell
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(url);
      return;
    } catch (e) {
      console.error('[Tauri] Failed to open URL via shell plugin:', e);
      // Fall through to window.open
    }
  }

  // Fallback for non-Tauri or if shell plugin fails
  window.open(url, '_blank');
}
