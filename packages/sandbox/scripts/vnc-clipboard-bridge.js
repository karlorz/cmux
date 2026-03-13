/**
 * VNC Clipboard Bridge - Receiver Script
 *
 * This script is injected into noVNC's vnc.html to enable clipboard paste from
 * the parent window into the VNC session.
 *
 * The parent window (cmux client) intercepts paste events and keyboard shortcuts
 * when the VNC iframe is focused, reads the clipboard, and sends the text via
 * postMessage. This script receives those messages and injects the text into
 * the VNC session using noVNC's RFB API.
 *
 * Related file: apps/client/src/hooks/useVncClipboardBridge.ts (parent-side hook)
 *
 * Key X11 symbols for keyboard simulation:
 * - XK_Control_L: 0xffe3
 * - XK_Meta_L: 0xffe7
 * - XK_Meta_R: 0xffe8
 * - XK_Super_L: 0xffeb
 * - XK_Super_R: 0xffec
 * - XK_v: 0x0076
 */

(function () {
  'use strict';

  /**
   * Message type identifier - must match VNC_CLIPBOARD_MESSAGE_TYPE in useVncClipboardBridge.ts
   */
  var MESSAGE_TYPE = 'vnc-clipboard-paste';

  // Key symbols for VNC keyboard simulation (same values as in vnc-viewer.tsx)
  var XK_Meta_L = 0xffe7;
  var XK_Meta_R = 0xffe8;
  var XK_Super_L = 0xffeb;
  var XK_Super_R = 0xffec;
  var XK_Control_L = 0xffe3;
  var XK_v = 0x0076;

  // Debounce timeout ID to prevent stacking rapid paste requests
  var pendingPasteTimeout = null;

  /**
   * Get the RFB instance from noVNC.
   * noVNC stores the RFB instance on the UI object after connection.
   */
  function getRfbInstance() {
    // noVNC's vnc.html stores the RFB instance in window.rfb after connection
    // or in the UI.rfb property if using the default UI
    if (typeof window.rfb !== 'undefined' && window.rfb) {
      return window.rfb;
    }

    // Check if noVNC's UI module stored the instance
    if (typeof window.UI !== 'undefined' && window.UI && window.UI.rfb) {
      return window.UI.rfb;
    }

    return null;
  }

  /**
   * Inject clipboard text into the VNC session.
   *
   * Uses noVNC's clipboardPasteFrom() to set the remote clipboard,
   * then simulates Ctrl+V to trigger paste in the remote session.
   *
   * @param {string} text - The text to paste
   */
  function injectClipboard(text) {
    var rfb = getRfbInstance();
    if (!rfb) {
      console.warn('[VNC Clipboard Bridge] RFB instance not available');
      return;
    }

    try {
      // Set the clipboard text on the remote server
      if (typeof rfb.clipboardPasteFrom === 'function') {
        rfb.clipboardPasteFrom(text);
      } else {
        console.warn('[VNC Clipboard Bridge] clipboardPasteFrom not available');
        return;
      }

      // Clear any pending paste to debounce rapid requests
      if (pendingPasteTimeout !== null) {
        clearTimeout(pendingPasteTimeout);
      }

      // Wait 50ms for clipboardPasteFrom to propagate to the remote clipboard
      // before simulating Ctrl+V. This delay is necessary because the VNC
      // clipboard sync is asynchronous.
      pendingPasteTimeout = setTimeout(function () {
        pendingPasteTimeout = null;

        if (typeof rfb.sendKey !== 'function') {
          console.warn('[VNC Clipboard Bridge] sendKey not available');
          return;
        }

        // Release any stuck meta/super keys first (Mac Cmd keys map to these)
        rfb.sendKey(XK_Meta_L, 'MetaLeft', false);
        rfb.sendKey(XK_Meta_R, 'MetaRight', false);
        rfb.sendKey(XK_Super_L, 'OSLeft', false);
        rfb.sendKey(XK_Super_R, 'OSRight', false);

        // Send Ctrl+V
        rfb.sendKey(XK_Control_L, 'ControlLeft', true);
        rfb.sendKey(XK_v, 'KeyV', true);
        rfb.sendKey(XK_v, 'KeyV', false);
        rfb.sendKey(XK_Control_L, 'ControlLeft', false);
      }, 50);
    } catch (error) {
      console.error('[VNC Clipboard Bridge] Error injecting clipboard:', error);
    }
  }

  /**
   * Validate incoming message format
   *
   * @param {*} data - The message data to validate
   * @returns {boolean} - True if valid clipboard paste message
   */
  /**
   * Type guard for clipboard paste messages.
   * Note: This logic is duplicated from apps/client/src/hooks/useVncClipboardBridge.ts
   * because this script runs in a separate context and cannot import the TypeScript module.
   */
  function isVncClipboardPasteMessage(data) {
    return (
      typeof data === 'object' &&
      data !== null &&
      data.type === MESSAGE_TYPE &&
      typeof data.text === 'string'
    );
  }

  /**
   * Handle incoming postMessage events from parent window
   *
   * @param {MessageEvent} event - The message event
   */
  function handleMessage(event) {
    // We accept messages from any origin since:
    // 1. The parent is cross-origin by design
    // 2. The message format is specific enough to avoid collisions
    // 3. This only affects clipboard paste, which is user-initiated

    var data = event.data;

    if (!isVncClipboardPasteMessage(data)) {
      return;
    }

    injectClipboard(data.text);
  }

  // Listen for messages from parent window
  window.addEventListener('message', handleMessage, false);

  /**
   * Handle keyboard events to request clipboard from parent.
   * When user presses Cmd/Ctrl+V inside the VNC iframe, we request
   * the clipboard from the parent window which has access to it.
   */
  function handleKeyDown(event) {
    var code = event.code || event.key;
    var isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

    // Check for paste shortcut (Cmd+V on Mac, Ctrl+V elsewhere)
    var isPasteShortcut = isMac
      ? event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && (code === 'KeyV' || code === 'v')
      : event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && (code === 'KeyV' || code === 'v');

    if (isPasteShortcut) {
      event.preventDefault();
      event.stopPropagation();
      console.log('[VNC Clipboard Bridge] Paste shortcut detected in iframe, requesting clipboard from parent');

      // Request clipboard from parent window
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'vnc-clipboard-request' }, '*');
      }
    }
  }

  // Listen for keyboard events in the iframe
  document.addEventListener('keydown', handleKeyDown, { capture: true });

  // Log initialization (debug)
  console.log('[VNC Clipboard Bridge] Initialized with keyboard listener');
})();
