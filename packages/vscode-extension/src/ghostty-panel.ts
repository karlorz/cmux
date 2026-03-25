import * as vscode from 'vscode';

/**
 * Ghostty WebviewPanel POC
 *
 * Based on vault research notes:
 * - 2026-03-25-vscode-ghostty-webview-panel-plan.md
 * - 2026-03-26-ghostty-web-production-readiness-vscode-webview.md
 *
 * Design principles:
 * - Single panel MVP, one session at a time
 * - Extension-host PTY relay (not direct localhost)
 * - Lightweight state persistence via getState/setState
 * - Strict CSP from the start
 * - Reconnect-friendly design (don't retain context when hidden)
 */

interface GhosttyPanelState {
  ptyId: string | null;
  cols: number;
  rows: number;
  connectionState: 'disconnected' | 'connecting' | 'connected';
}

// WebSocket connection to PTY server
let ptyWebSocket: WebSocket | null = null;

// Active panel instance
let currentPanel: vscode.WebviewPanel | null = null;

// Panel state
const panelState: GhosttyPanelState = {
  ptyId: null,
  cols: 80,
  rows: 24,
  connectionState: 'disconnected',
};

function getConfig() {
  const config = vscode.workspace.getConfiguration('cmux');
  return {
    serverUrl: config.get<string>('ptyServerUrl', 'http://localhost:39383'),
  };
}

/**
 * Get the webview HTML content with strict CSP
 * Uses bundled assets from out/webview/
 */
function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  // Generate nonce for CSP
  const nonce = getNonce();

  // Get URIs for bundled webview assets
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'ghostty-terminal.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'ghostty-terminal.css')
  );
  const wasmUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'ghostty-vt.wasm')
  );

  // Use bundled assets with proper CSP
  // CSP allows scripts/styles from webview origin, WASM from same origin
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource} 'nonce-${nonce}' 'wasm-unsafe-eval'; style-src ${webview.cspSource} 'unsafe-inline'; connect-src ws://localhost:* http://localhost:*; img-src ${webview.cspSource};">
  <title>Ghostty Terminal</title>
  <link rel="stylesheet" href="${styleUri}">
  <script nonce="${nonce}">
    // Pass WASM URL to webview script
    window.__GHOSTTY_WASM_URL__ = "${wasmUri}";
  </script>
</head>
<body>
  <div id="terminal-container">
    <div class="placeholder">
      <h2>Ghostty Terminal</h2>
      <p>Loading WASM terminal...</p>
    </div>
  </div>
  <div id="status" class="status connecting">Initializing...</div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Connect to a PTY session via WebSocket
 */
function connectToPty(ptyId: string): void {
  if (ptyWebSocket) {
    ptyWebSocket.close();
    ptyWebSocket = null;
  }

  const config = getConfig();
  const wsUrl = config.serverUrl.replace(/^http/, 'ws');
  const fullUrl = `${wsUrl}/sessions/${ptyId}/ws`;

  console.log(`[ghostty-panel] Connecting to PTY: ${fullUrl}`);

  panelState.connectionState = 'connecting';
  currentPanel?.webview.postMessage({ type: 'connect', ptyId });

  const ws = new WebSocket(fullUrl);
  ptyWebSocket = ws;

  ws.onopen = () => {
    if (ptyWebSocket !== ws) return;
    console.log('[ghostty-panel] WebSocket connected');
    panelState.connectionState = 'connected';
    panelState.ptyId = ptyId;
    currentPanel?.webview.postMessage({ type: 'connected' });

    // Send initial resize
    ws.send(JSON.stringify({
      type: 'resize',
      cols: panelState.cols,
      rows: panelState.rows,
    }));
  };

  ws.onmessage = async (event) => {
    if (ptyWebSocket !== ws) return;

    try {
      let text: string;
      if (event.data instanceof Blob) {
        text = await event.data.text();
      } else if (typeof event.data === 'string') {
        text = event.data;
      } else {
        return;
      }

      // Forward output to webview
      // Control messages are prefixed with \x00
      if (text.startsWith('\x00')) {
        const jsonText = text.slice(1);
        try {
          const msg = JSON.parse(jsonText);
          if (msg.type === 'exit') {
            console.log('[ghostty-panel] PTY exited');
            currentPanel?.webview.postMessage({ type: 'disconnected' });
            panelState.connectionState = 'disconnected';
            return;
          }
          if (msg.type === 'output' && msg.data) {
            currentPanel?.webview.postMessage({ type: 'output', data: msg.data });
          }
        } catch {
          // Malformed control message
        }
      } else {
        currentPanel?.webview.postMessage({ type: 'output', data: text });
      }
    } catch (e) {
      console.error('[ghostty-panel] Error processing message:', e);
    }
  };

  ws.onerror = (error) => {
    console.error('[ghostty-panel] WebSocket error:', error);
    currentPanel?.webview.postMessage({ type: 'error', error: 'Connection failed' });
  };

  ws.onclose = () => {
    if (ptyWebSocket !== ws) return;
    console.log('[ghostty-panel] WebSocket closed');
    panelState.connectionState = 'disconnected';
    currentPanel?.webview.postMessage({ type: 'disconnected' });
    ptyWebSocket = null;
  };
}

/**
 * Send input to the PTY
 */
function sendInput(data: string): void {
  if (ptyWebSocket && ptyWebSocket.readyState === WebSocket.OPEN) {
    ptyWebSocket.send(JSON.stringify({ type: 'input', data }));
  }
}

/**
 * Send resize to the PTY
 */
function sendResize(cols: number, rows: number): void {
  panelState.cols = cols;
  panelState.rows = rows;

  if (ptyWebSocket && ptyWebSocket.readyState === WebSocket.OPEN) {
    ptyWebSocket.send(JSON.stringify({ type: 'resize', cols, rows }));
  }
}

/**
 * Create or show the Ghostty panel
 */
export function createGhosttyPanel(context: vscode.ExtensionContext, ptyId?: string): vscode.WebviewPanel {
  // If panel exists, reveal it
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Beside);
    if (ptyId && ptyId !== panelState.ptyId) {
      connectToPty(ptyId);
    }
    return currentPanel;
  }

  // Create new panel
  const panel = vscode.window.createWebviewPanel(
    'cmux.ghosttyTerminal',
    'Ghostty Terminal',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      // Restrict resource access to extension directory
      localResourceRoots: [context.extensionUri],
      // Don't retain context - reconnect on reveal instead
      retainContextWhenHidden: false,
    }
  );

  currentPanel = panel;

  // Set HTML content
  panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

  // Handle messages from webview
  panel.webview.onDidReceiveMessage(
    message => {
      switch (message.type) {
        case 'ready':
          console.log('[ghostty-panel] Webview ready');
          // Connect to PTY if we have one
          if (ptyId) {
            connectToPty(ptyId);
          } else if (panelState.ptyId) {
            // Reconnect to previous session
            connectToPty(panelState.ptyId);
          }
          break;

        case 'input':
          sendInput(message.data);
          break;

        case 'resize':
          sendResize(message.cols, message.rows);
          break;
      }
    },
    undefined,
    context.subscriptions
  );

  // Handle panel visibility changes
  panel.onDidChangeViewState(
    e => {
      if (e.webviewPanel.visible) {
        console.log('[ghostty-panel] Panel became visible');
        // Reconnect if we have a PTY ID
        if (panelState.ptyId && panelState.connectionState === 'disconnected') {
          connectToPty(panelState.ptyId);
        }
      }
    },
    undefined,
    context.subscriptions
  );

  // Clean up on dispose
  panel.onDidDispose(
    () => {
      console.log('[ghostty-panel] Panel disposed');
      currentPanel = null;
      if (ptyWebSocket) {
        ptyWebSocket.close();
        ptyWebSocket = null;
      }
    },
    undefined,
    context.subscriptions
  );

  return panel;
}

/**
 * Activate Ghostty panel feature
 */
export function activateGhosttyPanel(context: vscode.ExtensionContext): void {
  console.log('[ghostty-panel] Activating Ghostty panel feature');

  // Register command to open Ghostty panel
  context.subscriptions.push(
    vscode.commands.registerCommand('cmux.openGhosttyPanel', async () => {
      // Get list of PTY sessions
      const config = getConfig();
      try {
        const response = await fetch(`${config.serverUrl}/sessions`);
        if (!response.ok) {
          vscode.window.showErrorMessage('Failed to fetch PTY sessions');
          createGhosttyPanel(context);
          return;
        }

        const data = await response.json();
        const sessions = Array.isArray(data) ? data : data.sessions || [];

        if (sessions.length === 0) {
          vscode.window.showInformationMessage('No active PTY sessions. Opening empty panel.');
          createGhosttyPanel(context);
          return;
        }

        // Show quick pick to select session
        interface SessionItem extends vscode.QuickPickItem {
          id: string;
        }
        const items: SessionItem[] = sessions.map((s: { id: string; name: string; shell: string }) => ({
          label: s.name,
          description: `Shell: ${s.shell}`,
          detail: `ID: ${s.id}`,
          id: s.id,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a PTY session to attach',
        });

        if (selected) {
          createGhosttyPanel(context, selected.id);
        }
      } catch (error) {
        console.error('[ghostty-panel] Error fetching sessions:', error);
        vscode.window.showErrorMessage('Failed to connect to PTY server');
        createGhosttyPanel(context);
      }
    })
  );

  console.log('[ghostty-panel] Ghostty panel feature activated');
}

/**
 * Deactivate Ghostty panel feature
 */
export function deactivateGhosttyPanel(): void {
  console.log('[ghostty-panel] Deactivating Ghostty panel feature');

  if (currentPanel) {
    currentPanel.dispose();
    currentPanel = null;
  }

  if (ptyWebSocket) {
    ptyWebSocket.close();
    ptyWebSocket = null;
  }
}
