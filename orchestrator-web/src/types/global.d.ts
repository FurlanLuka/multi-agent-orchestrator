/**
 * Global type declarations for Window object extensions
 */

interface TauriInternals {
  // Tauri v1 style (invoke directly on __TAURI__)
  invoke?<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  // Tauri v2 style (invoke under core)
  core?: {
    invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  };
  event: {
    listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<() => void>;
    once<T>(event: string, handler: (event: { payload: T }) => void): Promise<() => void>;
  };
}

declare global {
  interface Window {
    /** Port injected by Tauri at runtime */
    __ORCHESTRATOR_PORT__?: number;
    /** Tauri internals - only available when running in Tauri */
    __TAURI__?: TauriInternals;
  }
}

export {};
