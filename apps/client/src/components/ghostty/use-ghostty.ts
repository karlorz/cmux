import { init, Terminal } from "ghostty-web";
import type { ITerminalAddon, ITerminalOptions } from "ghostty-web";
import { useEffect, useRef, useState } from "react";

export interface UseGhosttyProps {
  addons?: ITerminalAddon[];
  options?: ITerminalOptions;
  listeners?: {
    onBinary?(data: string): void;
    onCursorMove?(): void;
    onData?(data: string): void;
    onKey?: (event: { key: string; domEvent: KeyboardEvent }) => void;
    onLineFeed?(): void;
    onScroll?(newPosition: number): void;
    onSelectionChange?(): void;
    onRender?(event: { start: number; end: number }): void;
    onResize?(event: { cols: number; rows: number }): void;
    onTitleChange?(newTitle: string): void;
    customKeyEventHandler?(event: KeyboardEvent): boolean;
  };
}

let ghosttyInitPromise: Promise<void> | null = null;

function ensureGhosttyInitialized() {
  if (!ghosttyInitPromise) {
    ghosttyInitPromise = init();
  }
  return ghosttyInitPromise;
}

export function useGhostty({ options, addons, listeners }: UseGhosttyProps = {}) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const listenersRef = useRef<UseGhosttyProps["listeners"]>(listeners);
  const [terminalInstance, setTerminalInstance] = useState<Terminal | null>(null);

  useEffect(() => {
    listenersRef.current = listeners;
  }, [listeners]);

  useEffect(() => {
    let cancelled = false;
    let instance: Terminal | null = null;

    void (async () => {
      try {
        await ensureGhosttyInitialized();
        if (cancelled) {
          return;
        }

        instance = new Terminal({
          cursorBlink: true,
          ...options,
        });

        addons?.forEach((addon) => instance?.loadAddon(addon));

        const l = listenersRef.current;
        if (l?.onCursorMove) {
          instance.onCursorMove(l.onCursorMove);
        }
        if (l?.onScroll) {
          instance.onScroll(l.onScroll);
        }
        if (l?.onSelectionChange) {
          instance.onSelectionChange(l.onSelectionChange);
        }
        if (l?.onRender) {
          instance.onRender(l.onRender);
        }
        if (l?.onResize) {
          instance.onResize(l.onResize);
        }
        if (l?.onTitleChange) {
          instance.onTitleChange(l.onTitleChange);
        }
        if (l?.onKey) {
          instance.onKey(l.onKey);
        }
        if (l?.onData) {
          instance.onData(l.onData);
        }
        if (l?.customKeyEventHandler) {
          instance.attachCustomKeyEventHandler(l.customKeyEventHandler);
        }

        if (terminalRef.current) {
          instance.open(terminalRef.current);
          instance.focus();
        }

        if (!cancelled) {
          setTerminalInstance(instance);
        }
      } catch (error) {
        console.error("[useGhostty] Failed to initialize terminal", error);
      }
    })();

    return () => {
      cancelled = true;
      instance?.dispose();
      setTerminalInstance(null);
    };
  }, [addons, options]);

  return {
    ref: terminalRef,
    instance: terminalInstance,
  };
}
