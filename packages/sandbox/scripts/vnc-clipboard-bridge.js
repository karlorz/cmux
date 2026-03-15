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
 * - XK_Shift_L: 0xffe1
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
  var XK_Shift_L = 0xffe1;
  var XK_v = 0x0076;

  // Debounce timeout ID to prevent stacking rapid paste requests
  var pendingPasteTimeout = null;

  // Flag to track if we should use sendKey fallback for typing
  var useSendKeyFallback = false;

  // Maximum text length for sendKey fallback (longer texts should use clipboard)
  var SENDKEY_FALLBACK_MAX_LENGTH = 500;

  /**
   * Get the RFB instance from noVNC.
   * noVNC stores the RFB instance on the UI object after connection.
   * Note: UI.rfb is only set AFTER VNC connects, so this may return null initially.
   */
  function getRfbInstance() {
    // noVNC's vnc.html stores the RFB instance in window.rfb after connection
    // or in the UI.rfb property if using the default UI
    if (typeof window.rfb !== 'undefined' && window.rfb) {
      return window.rfb;
    }

    // Check if noVNC's UI module stored the instance
    // UI is exposed by our module script: import UI from './app/ui.js'; window.UI = UI;
    if (typeof window.UI !== 'undefined' && window.UI && window.UI.rfb) {
      return window.UI.rfb;
    }

    return null;
  }

  /**
   * Wait for RFB instance to be available, then call callback.
   * RFB is only created after VNC connection is established.
   */
  function withRfbInstance(callback, maxRetries) {
    maxRetries = maxRetries || 50; // 5 seconds max
    var retries = 0;

    function tryGetRfb() {
      var rfb = getRfbInstance();
      if (rfb) {
        callback(rfb);
        return;
      }
      retries++;
      if (retries < maxRetries) {
        setTimeout(tryGetRfb, 100);
      } else {
        console.warn('[VNC Clipboard Bridge] RFB instance not available after ' + maxRetries + ' retries');
      }
    }

    tryGetRfb();
  }

  /**
   * Map a character to its X11 keysym.
   * Returns an object with keysym and whether shift is required.
   *
   * @param {string} char - Single character to map
   * @returns {{ keysym: number, shift: boolean } | null}
   */
  function charToKeysym(char) {
    var code = char.charCodeAt(0);

    // ASCII printable range (32-126)
    if (code >= 32 && code <= 126) {
      // Lowercase letters: a-z (keysym 0x61-0x7a)
      if (code >= 97 && code <= 122) {
        return { keysym: code, shift: false };
      }
      // Uppercase letters: A-Z (keysym 0x41-0x5a)
      if (code >= 65 && code <= 90) {
        return { keysym: code, shift: true };
      }
      // Digits: 0-9 (keysym 0x30-0x39)
      if (code >= 48 && code <= 57) {
        return { keysym: code, shift: false };
      }
      // Special characters that require shift on US keyboard
      var shiftChars = '~!@#$%^&*()_+{}|:"<>?';
      var noShiftEquiv = '`1234567890-=[]\\;\',./';
      var shiftIdx = shiftChars.indexOf(char);
      if (shiftIdx !== -1) {
        return { keysym: noShiftEquiv.charCodeAt(shiftIdx), shift: true };
      }
      // Other printable ASCII (space, punctuation without shift)
      return { keysym: code, shift: false };
    }

    // Common special keysyms
    switch (code) {
      case 10:  // LF
      case 13:  // CR
        return { keysym: 0xff0d, shift: false }; // XK_Return
      case 9:   // Tab
        return { keysym: 0xff09, shift: false }; // XK_Tab
      case 8:   // Backspace
        return { keysym: 0xff08, shift: false }; // XK_BackSpace
      default:
        // For Unicode characters, use Unicode keysym (0x01000000 + code)
        if (code > 126) {
          return { keysym: 0x01000000 + code, shift: false };
        }
        return null;
    }
  }

  /**
   * Type text character by character using sendKey.
   * This is a fallback when clipboardPasteFrom + Ctrl+V doesn't work.
   *
   * @param {object} rfb - The noVNC RFB instance
   * @param {string} text - The text to type
   */
  function typeTextViaSendKey(rfb, text) {
    if (typeof rfb.sendKey !== 'function') {
      console.warn('[VNC Clipboard Bridge] sendKey not available for fallback typing');
      return;
    }

    var i = 0;
    var delay = 10; // ms between keystrokes

    function typeNextChar() {
      if (i >= text.length) {
        console.log('[VNC Clipboard Bridge] Finished typing ' + text.length + ' characters');
        return;
      }

      var char = text[i];
      var keyInfo = charToKeysym(char);

      if (keyInfo) {
        try {
          // Press shift if needed
          if (keyInfo.shift) {
            rfb.sendKey(XK_Shift_L, 'ShiftLeft', true);
          }
          // Press and release the key
          rfb.sendKey(keyInfo.keysym, null, true);
          rfb.sendKey(keyInfo.keysym, null, false);
          // Release shift if it was pressed
          if (keyInfo.shift) {
            rfb.sendKey(XK_Shift_L, 'ShiftLeft', false);
          }
        } catch (e) {
          console.warn('[VNC Clipboard Bridge] Error sending key for char "' + char + '":', e);
        }
      }

      i++;
      setTimeout(typeNextChar, delay);
    }

    console.log('[VNC Clipboard Bridge] Starting sendKey fallback typing for ' + text.length + ' characters');
    typeNextChar();
  }

  /**
   * Inject clipboard text into the VNC session.
   *
   * Primary method: Uses noVNC's clipboardPasteFrom() to set the remote clipboard,
   * then simulates Ctrl+V to trigger paste in the remote session.
   *
   * Fallback: If useSendKeyFallback is enabled and text is short enough,
   * types the text character by character using sendKey().
   *
   * @param {string} text - The text to paste
   */
  function injectClipboard(text) {
    withRfbInstance(function(rfb) {
      doInjectClipboard(rfb, text);
    });
  }

  function doInjectClipboard(rfb, text) {

    // If fallback mode is enabled and text is short, type directly
    if (useSendKeyFallback && text.length <= SENDKEY_FALLBACK_MAX_LENGTH) {
      console.log('[VNC Clipboard Bridge] Using sendKey fallback mode');
      typeTextViaSendKey(rfb, text);
      return;
    }

    try {
      // Set the clipboard text on the remote server
      if (typeof rfb.clipboardPasteFrom === 'function') {
        rfb.clipboardPasteFrom(text);
        console.log('[VNC Clipboard Bridge] Set remote clipboard via clipboardPasteFrom');
      } else {
        console.warn('[VNC Clipboard Bridge] clipboardPasteFrom not available');
        // Fall back to typing if clipboard method isn't available
        if (text.length <= SENDKEY_FALLBACK_MAX_LENGTH) {
          console.log('[VNC Clipboard Bridge] Falling back to sendKey typing');
          typeTextViaSendKey(rfb, text);
        }
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

        console.log('[VNC Clipboard Bridge] Sent Ctrl+V keystroke');
      }, 50);
    } catch (error) {
      console.error('[VNC Clipboard Bridge] Error injecting clipboard:', error);
      // Try fallback on error if text is short enough
      if (text.length <= SENDKEY_FALLBACK_MAX_LENGTH) {
        console.log('[VNC Clipboard Bridge] Attempting sendKey fallback after error');
        typeTextViaSendKey(rfb, text);
      }
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

    // Handle clipboard paste message
    if (isVncClipboardPasteMessage(data)) {
      injectClipboard(data.text);
      return;
    }

    // Handle fallback mode toggle
    if (typeof data === 'object' && data !== null && data.type === 'vnc-clipboard-fallback') {
      useSendKeyFallback = !!data.enabled;
      console.log('[VNC Clipboard Bridge] Fallback mode ' + (useSendKeyFallback ? 'enabled' : 'disabled'));
      return;
    }
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

  /**
   * Set up clipboard event listener on RFB to sync VNC clipboard to parent.
   * When user copies text in the VNC session, noVNC fires a 'clipboard' event.
   * We forward this to the parent window so it can write to the local clipboard.
   */
  function setupClipboardListener(rfb) {
    if (!rfb) return;

    rfb.addEventListener('clipboard', function(event) {
      var text = event.detail && event.detail.text;
      if (text && window.parent && window.parent !== window) {
        console.log('[VNC Clipboard Bridge] Remote clipboard changed, sending to parent');
        window.parent.postMessage({
          type: 'vnc-clipboard-sync',
          text: text
        }, '*');
      }
    });

    console.log('[VNC Clipboard Bridge] Clipboard sync listener attached to RFB');
  }

  // Attach clipboard listener once RFB is available
  withRfbInstance(setupClipboardListener);

  // Log initialization (debug)
  console.log('[VNC Clipboard Bridge] Initialized with keyboard listener and clipboard sync');
})();
