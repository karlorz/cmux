import { useEffect, useRef } from "react";
import { persistentIframeManager } from "../lib/persistentIframeManager";

interface UseVncClipboardBridgeOptions {
  /**
   * The persist key used to identify the iframe in persistentIframeManager
   */
  persistKey: string;

  /**
   * Whether the clipboard bridge is enabled (default: true)
   */
  enabled?: boolean;
}

/**
 * Message type sent to the iframe for clipboard paste
 */
interface VncClipboardPasteMessage {
  type: "vnc-clipboard-paste";
  text: string;
}

function isVncClipboardPasteMessage(
  data: unknown
): data is VncClipboardPasteMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as VncClipboardPasteMessage).type === "vnc-clipboard-paste" &&
    typeof (data as VncClipboardPasteMessage).text === "string"
  );
}

/**
 * Hook that creates a clipboard bridge between the parent window and a VNC iframe.
 *
 * Cross-origin iframes cannot access the parent window's clipboard directly.
 * This hook intercepts paste events and keyboard shortcuts (Cmd+V/Ctrl+V) in the
 * parent window when the VNC iframe is focused, reads the clipboard, and sends
 * the text to the iframe via postMessage.
 *
 * The iframe must include the vnc-clipboard-bridge.js script to receive and
 * inject the clipboard text into the VNC session.
 */
export function useVncClipboardBridge({
  persistKey,
  enabled = true,
}: UseVncClipboardBridgeOptions): void {
  const isMacRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Detect platform once
    if (isMacRef.current === null) {
      isMacRef.current = /Mac|iPhone|iPad|iPod/i.test(
        navigator.platform || navigator.userAgent
      );
    }
    const isMac = isMacRef.current;

    /**
     * Check if the VNC iframe is currently focused
     */
    const isIframeFocused = (): boolean => {
      const iframe = persistentIframeManager.getIframeElement(persistKey);
      if (!iframe) {
        return false;
      }

      // Check if iframe itself is focused (document.activeElement === iframe)
      // or if we're in a wrapper that contains focus
      const wrapper = persistentIframeManager.getIframeWrapperElement(persistKey);
      if (!wrapper) {
        return false;
      }

      const activeElement = document.activeElement;
      return activeElement === iframe || wrapper.contains(activeElement);
    };

    /**
     * Send clipboard text to the iframe via postMessage
     */
    const sendClipboardToIframe = (text: string): void => {
      const iframe = persistentIframeManager.getIframeElement(persistKey);
      if (!iframe?.contentWindow) {
        return;
      }

      const message: VncClipboardPasteMessage = {
        type: "vnc-clipboard-paste",
        text,
      };

      // Send to iframe - use '*' for origin since the iframe is cross-origin
      iframe.contentWindow.postMessage(message, "*");
    };

    /**
     * Read clipboard and send to iframe
     */
    const pasteClipboardToIframe = async (): Promise<void> => {
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          sendClipboardToIframe(text);
        }
      } catch (error) {
        console.error("[VncClipboardBridge] Failed to read clipboard:", error);
      }
    };

    /**
     * Handle paste events when the iframe is focused
     */
    const handlePaste = (event: ClipboardEvent): void => {
      if (!isIframeFocused()) {
        return;
      }

      const text =
        event.clipboardData?.getData("text/plain") ||
        event.clipboardData?.getData("text");

      if (text) {
        event.preventDefault();
        event.stopPropagation();
        sendClipboardToIframe(text);
      }
    };

    /**
     * Handle keyboard shortcuts (Cmd+V on Mac, Ctrl+V on other platforms)
     */
    const handleKeyDown = async (event: KeyboardEvent): Promise<void> => {
      if (!isIframeFocused()) {
        return;
      }

      const code = event.code;

      // Check for paste shortcut (Cmd+V on Mac, Ctrl+V elsewhere)
      const isPasteShortcut = isMac
        ? event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && code === "KeyV"
        : event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && code === "KeyV";

      if (isPasteShortcut) {
        event.preventDefault();
        event.stopPropagation();
        await pasteClipboardToIframe();
      }
    };

    // Add listeners with capture to intercept before iframe
    document.addEventListener("paste", handlePaste, { capture: true });
    document.addEventListener("keydown", handleKeyDown, { capture: true });

    return () => {
      document.removeEventListener("paste", handlePaste, { capture: true });
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [persistKey, enabled]);
}

// Export the message type checker for use in the receiver script
export { isVncClipboardPasteMessage };
export type { VncClipboardPasteMessage };
