/**
 * Ghostty Terminal Webview Script
 *
 * This is the webview-side code for the Ghostty terminal panel.
 * Uses ghostty-web for WASM-based terminal rendering with xterm.js API compatibility.
 */

import { Ghostty, Terminal } from 'ghostty-web';

// Get WASM URL from extension host (set in HTML before this script loads)
declare global {
  interface Window {
    __GHOSTTY_WASM_URL__?: string;
  }
}

// VS Code API
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface GhosttyState {
  ptyId: string | null;
  cols: number;
  rows: number;
}

interface ExtensionMessage {
  type: 'connect' | 'connected' | 'disconnected' | 'output' | 'error';
  ptyId?: string;
  data?: string;
  error?: string;
}

// Initialize VS Code API
const vscode = acquireVsCodeApi();

// DOM elements
let terminalContainer: HTMLElement | null = null;
let statusEl: HTMLElement | null = null;

// Ghostty terminal instance
let terminal: Terminal | null = null;
let ghosttyInstance: Ghostty | null = null;

// State
let currentState: GhosttyState = {
  ptyId: null,
  cols: 80,
  rows: 24,
};

/**
 * Initialize WASM and create terminal
 */
async function initializeTerminal(): Promise<void> {
  if (!terminalContainer) return;

  try {
    setStatus('Loading WASM...', 'connecting');

    // Load Ghostty WASM with custom path from extension host
    if (!ghosttyInstance) {
      const wasmUrl = window.__GHOSTTY_WASM_URL__;
      if (!wasmUrl) {
        throw new Error('WASM URL not provided by extension host');
      }
      ghosttyInstance = await Ghostty.load(wasmUrl);
    }

    // Create terminal with VS Code-friendly theme
    // Pass ghostty instance directly to skip global init() requirement
    terminal = new Terminal({
      ghostty: ghosttyInstance,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      cursorBlink: true,
      cursorStyle: 'block',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        cursorAccent: '#000000',
        selectionBackground: 'rgba(255, 255, 255, 0.3)',
      },
    });

    // Clear placeholder and open terminal
    terminalContainer.innerHTML = '';
    terminal.open(terminalContainer);

    // Handle user input - send to extension host
    terminal.onData((data: string) => {
      sendInput(data);
    });

    // Handle resize events from terminal
    terminal.onResize(({ cols, rows }) => {
      if (cols !== currentState.cols || rows !== currentState.rows) {
        currentState.cols = cols;
        currentState.rows = rows;
        saveState();
        vscode.postMessage({ type: 'resize', cols, rows });
      }
    });

    // Set up resize observer to fit terminal when container resizes
    const resizeObserver = new ResizeObserver(() => {
      fitTerminal();
    });
    resizeObserver.observe(terminalContainer);

    // Initial fit after a short delay for layout to settle
    setTimeout(fitTerminal, 50);

    console.log('[ghostty-webview] Terminal initialized');
    setStatus('Ready', 'connected');
    setTimeout(() => hideStatus(), 1500);
  } catch (error) {
    console.error('[ghostty-webview] Failed to initialize terminal:', error);
    setStatus('WASM load failed', 'error');
  }
}

/**
 * Initialize the webview
 */
async function initialize(): Promise<void> {
  terminalContainer = document.getElementById('terminal-container');
  statusEl = document.getElementById('status');

  // Restore previous state
  const previousState = vscode.getState() as GhosttyState | null;
  if (previousState) {
    currentState = previousState;
    console.log('[ghostty-webview] Restored state:', currentState);
  }

  // Set up message handler
  window.addEventListener('message', handleMessage);

  // Initialize ghostty-web terminal
  await initializeTerminal();

  // Report ready
  vscode.postMessage({ type: 'ready' });
}

/**
 * Handle messages from extension host
 */
function handleMessage(event: MessageEvent<ExtensionMessage>): void {
  const message = event.data;

  switch (message.type) {
    case 'connect':
      setStatus('Connecting...', 'connecting');
      if (message.ptyId) {
        currentState.ptyId = message.ptyId;
        saveState();
      }
      break;

    case 'connected':
      setStatus('Connected', 'connected');
      setTimeout(() => hideStatus(), 2000);
      break;

    case 'disconnected':
      setStatus('Disconnected', 'error');
      break;

    case 'output':
      handleOutput(message.data || '');
      break;

    case 'error':
      setStatus(`Error: ${message.error || 'Unknown'}`, 'error');
      break;
  }
}

/**
 * Handle terminal output - write to ghostty-web terminal
 */
function handleOutput(data: string): void {
  if (terminal) {
    terminal.write(data);
  }
}

/**
 * Fit terminal to container size
 * Uses terminal's actual font metrics for accurate dimensions
 */
function fitTerminal(): void {
  if (!terminal || !terminalContainer) return;

  // Get renderer metrics if available, otherwise use defaults
  const metrics = terminal.renderer?.getMetrics();
  const charWidth = metrics?.width ?? 9;
  const charHeight = metrics?.height ?? 17;

  const cols = Math.floor(terminalContainer.clientWidth / charWidth);
  const rows = Math.floor(terminalContainer.clientHeight / charHeight);

  if (cols > 0 && rows > 0 && (cols !== terminal.cols || rows !== terminal.rows)) {
    terminal.resize(cols, rows);
    // onResize handler will update state and notify extension
  }
}

/**
 * Send input to extension host (called from terminal onData)
 */
function sendInput(data: string): void {
  vscode.postMessage({ type: 'input', data });
}

/**
 * Update status display
 */
function setStatus(text: string, className: 'connecting' | 'connected' | 'error'): void {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = `status ${className}`;
  statusEl.style.display = 'block';
}

/**
 * Hide status display
 */
function hideStatus(): void {
  if (!statusEl) return;
  statusEl.style.display = 'none';
}

/**
 * Save state for restoration
 */
function saveState(): void {
  vscode.setState(currentState);
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void initialize());
} else {
  void initialize();
}
