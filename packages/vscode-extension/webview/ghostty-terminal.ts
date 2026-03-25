/**
 * Ghostty Terminal Webview Script
 *
 * This is the webview-side code for the Ghostty terminal panel.
 * It will be bundled separately and loaded into the webview.
 *
 * Future: integrate ghostty-web npm package here
 */

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

// State
let currentState: GhosttyState = {
  ptyId: null,
  cols: 80,
  rows: 24,
};

/**
 * Initialize the webview
 */
function initialize(): void {
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

  // Set up resize observer
  if (terminalContainer) {
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(terminalContainer);
  }

  // Report ready
  vscode.postMessage({ type: 'ready' });

  // Report initial dimensions
  setTimeout(reportDimensions, 100);
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
 * Handle terminal output
 * Future: write to ghostty-web terminal instance
 */
function handleOutput(data: string): void {
  // For now, just log - will integrate ghostty-web here
  console.log('[ghostty-webview] Output:', data.length, 'bytes');

  // TODO: When ghostty-web is integrated:
  // terminal.write(data);
}

/**
 * Handle resize events
 */
function handleResize(): void {
  reportDimensions();
}

/**
 * Report current dimensions to extension host
 */
function reportDimensions(): void {
  if (!terminalContainer) return;

  // Approximate character dimensions (will be refined with actual font metrics)
  const charWidth = 9;
  const charHeight = 17;

  const cols = Math.floor(terminalContainer.clientWidth / charWidth);
  const rows = Math.floor(terminalContainer.clientHeight / charHeight);

  if (cols !== currentState.cols || rows !== currentState.rows) {
    currentState.cols = cols;
    currentState.rows = rows;
    saveState();
    vscode.postMessage({ type: 'resize', cols, rows });
  }
}

/**
 * Send input to terminal
 * Future: called from ghostty-web onData
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

// Export for potential future use
(window as unknown as { ghosttyTerminal: { sendInput: typeof sendInput } }).ghosttyTerminal = {
  sendInput,
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
