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
 * Message type identifier for clipboard paste messages.
 * Must match the value in packages/sandbox/scripts/vnc-clipboard-bridge.js
 */
const VNC_CLIPBOARD_MESSAGE_TYPE = "vnc-clipboard-paste" as const;

/**
 * Message type sent to the iframe for clipboard paste
 */
interface VncClipboardPasteMessage {
  type: typeof VNC_CLIPBOARD_MESSAGE_TYPE;
  text: string;
}

/**
 * Type guard for VncClipboardPasteMessage.
 * Note: This logic is duplicated in packages/sandbox/scripts/vnc-clipboard-bridge.js
 * because the bridge script runs in a separate context and cannot import this module.
 */
function isVncClipboardPasteMessage(
  data: unknown
): data is VncClipboardPasteMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as VncClipboardPasteMessage).type === VNC_CLIPBOARD_MESSAGE_TYPE &&
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
     * Get the iframe element if it's currently focused.
     * Returns the iframe with contentWindow if focused, null otherwise.
     * This combines focus check and element retrieval to avoid redundant lookups.
     */
    const getFocusedIframe = (): HTMLIFrameElement | null => {
      const iframe = persistentIframeManager.getIframeElement(persistKey);
      if (!iframe?.contentWindow) {
        return null;
      }

      // Check if iframe itself is focused (document.activeElement === iframe)
      // or if we're in a wrapper that contains focus
      const wrapper = persistentIframeManager.getIframeWrapperElement(persistKey);
      if (!wrapper) {
        return null;
      }

      const activeElement = document.activeElement;
      const isFocused = activeElement === iframe || wrapper.contains(activeElement);
      return isFocused ? iframe : null;
    };

    /**
     * Send clipboard text to the iframe via postMessage
     */
    const sendClipboardToIframe = (iframe: HTMLIFrameElement, text: string): void => {
      const message: VncClipboardPasteMessage = {
        type: VNC_CLIPBOARD_MESSAGE_TYPE,
        text,
      };

      // Send to iframe - use '*' for origin since the iframe is cross-origin
      iframe.contentWindow?.postMessage(message, "*");
    };

    /**
     * Handle paste events when the iframe is focused
     */
    const handlePaste = (event: ClipboardEvent): void => {
      const iframe = getFocusedIframe();
      if (!iframe) {
        return;
      }

      const text =
        event.clipboardData?.getData("text/plain") ||
        event.clipboardData?.getData("text");

      if (text) {
        event.preventDefault();
        event.stopPropagation();
        sendClipboardToIframe(iframe, text);
      }
    };

    /**
     * Handle keyboard shortcuts (Cmd+V on Mac, Ctrl+V on other platforms)
     */
    const handleKeyDown = (event: KeyboardEvent): void => {
      const iframe = getFocusedIframe();
      if (!iframe) {
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
        // Read clipboard and send - fire-and-forget to avoid blocking
        navigator.clipboard.readText().then(
          (text) => {
            if (text) {
              sendClipboardToIframe(iframe, text);
            }
          },
          (error) => {
            console.error("[VncClipboardBridge] Failed to read clipboard:", error);
          }
        );
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
