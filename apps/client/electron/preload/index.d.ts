import { ElectronAPI } from "@electron-toolkit/preload";

declare global {
  interface Window {
    electron: ElectronAPI;
    api: unknown;
    cmux: {
      getCurrentWebContentsId: () => number;
      register: (meta: { auth?: string; team?: string; auth_json?: string }) => Promise<unknown>;
      rpc: (event: string, ...args: unknown[]) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => () => void;
      off: (event: string, callback?: (...args: unknown[]) => void) => void;
      ui: {
        focusWebContents: (id: number) => Promise<{ ok: boolean; queued?: boolean }>;
        restoreLastFocusInWebContents: (id: number) => Promise<{ ok: boolean; queued?: boolean }>;
        restoreLastFocusInFrame: (
          contentsId: number,
          frameRoutingId: number,
          frameProcessId: number
        ) => Promise<{ ok: boolean; queued?: boolean }>;
        setCommandPaletteOpen: (open: boolean) => Promise<{ ok: boolean }>;
        setPreviewReloadVisible: (visible: boolean) => Promise<{ ok: boolean }>;
        restoreLastFocus: () => Promise<{ ok: boolean; queued?: boolean }>;
        onWindowFocus: (callback: () => void) => () => void;
      };
      socket: {
        connect: (query: Record<string, string>) => Promise<unknown>;
        disconnect: (socketId: string) => Promise<unknown>;
        emit: (socketId: string, eventName: string, ...args: unknown[]) => Promise<unknown>;
        on: (socketId: string, eventName: string) => Promise<unknown>;
        onEvent: (
          socketId: string,
          callback: (eventName: string, ...args: unknown[]) => void
        ) => void;
      };
      autoUpdate: {
        check: () =>
          Promise<{
            ok: boolean;
            reason?: string;
            updateAvailable?: boolean;
            version?: string | null;
          }>;
        install: () => Promise<{ ok: boolean; reason?: string }>;
      };
      webContentsView?: {
        create: (options: {
          url: string;
          requestUrl?: string;
          bounds?: { x: number; y: number; width: number; height: number };
          backgroundColor?: string;
          borderRadius?: number;
          persistKey?: string;
        }) => Promise<{ id: number; webContentsId: number; restored: boolean }>;
        setBounds: (options: {
          id: number;
          bounds: { x: number; y: number; width: number; height: number };
          visible?: boolean;
        }) => Promise<{ ok: boolean }>;
        loadURL: (id: number, url: string) => Promise<{ ok: boolean }>;
        release: (options: { id: number; persist?: boolean }) => Promise<{ ok: boolean; suspended: boolean }>;
        destroy: (id: number) => Promise<{ ok: boolean }>;
        updateStyle: (options: {
          id: number;
          backgroundColor?: string;
          borderRadius?: number;
        }) => Promise<{ ok: boolean }>;
        goBack: (id: number) => Promise<{ ok: boolean }>;
        goForward: (id: number) => Promise<{ ok: boolean }>;
        reload: (id: number) => Promise<{ ok: boolean }>;
        onEvent: (id: number, callback: (event: unknown) => void) => () => void;
        getState: (id: number) => Promise<{ ok: boolean; state?: unknown }>;
        getAllStates: () => Promise<{ ok: boolean; states?: unknown[] }>;
        getSnapshot: (id: number) => Promise<{ ok: boolean; snapshot?: unknown }>;
        openDevTools: (id: number, mode: string) => Promise<{ ok: boolean }>;
        closeDevTools: (id: number) => Promise<{ ok: boolean }>;
      };
    };
  }
}
