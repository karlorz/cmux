#!/usr/bin/env bun
/**
 * Local script to build a Modal snapshot with all deps pre-installed.
 * Reads MODAL_TOKEN_ID and MODAL_TOKEN_SECRET from .env.
 *
 * Usage:
 *   bun scripts/build-modal-snapshot.ts
 */

import { ModalClient } from "@cmux/modal-client";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Load .env
const envPath = resolve(import.meta.dirname!, "../.env");
const envContent = readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
}

const tokenId = env.MODAL_TOKEN_ID;
const tokenSecret = env.MODAL_TOKEN_SECRET;

if (!tokenId || !tokenSecret) {
  console.error(
    "Missing MODAL_TOKEN_ID or MODAL_TOKEN_SECRET in .env",
  );
  process.exit(1);
}

const CMUX_CODE_VERSION = "0.9.0";

const INSTALL_SCRIPT = `#!/bin/bash
set -e

# Create workspace directory
mkdir -p /home/user/workspace

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq > /dev/null 2>&1
apt-get install -y -qq \\
  curl procps jq wget gnupg pip \\
  tigervnc-standalone-server tigervnc-common \\
  xfce4 xfce4-terminal dbus-x11 \\
  novnc python3-websockify \\
  fonts-liberation fonts-dejavu \\
  > /dev/null 2>&1

# Install Google Chrome
curl -fsSL https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -o /tmp/chrome.deb
apt-get install -y -qq /tmp/chrome.deb > /dev/null 2>&1 || apt-get install -y -qq -f > /dev/null 2>&1
rm -f /tmp/chrome.deb

# Install cmux-code (VSCode fork)
mkdir -p /app/cmux-code
curl -fSL --retry 3 --retry-delay 2 -o /tmp/cmux-code.tar.gz \\
  "https://github.com/manaflow-ai/vscode-1/releases/download/v${CMUX_CODE_VERSION}/vscode-server-linux-x64-web.tar.gz"
tar xf /tmp/cmux-code.tar.gz -C /app/cmux-code/ --strip-components=1
rm -f /tmp/cmux-code.tar.gz

# Install worker daemon (Go binary for PTY/SSH)
curl -fSL --retry 3 --retry-delay 2 -o /usr/local/bin/worker-daemon \\
  "https://github.com/manaflow-ai/vscode-1/releases/download/v${CMUX_CODE_VERSION}/worker-daemon"
chmod +x /usr/local/bin/worker-daemon

# Install JupyterLab
pip install -q jupyterlab 2>/dev/null || true

# Set Google Chrome as the default browser (system-level)
update-alternatives --set x-www-browser /usr/bin/google-chrome-stable 2>/dev/null || true
update-alternatives --set gnome-www-browser /usr/bin/google-chrome-stable 2>/dev/null || true
# Note: XFCE helpers.rc is set in the startup script since startxfce4 recreates config

# Create VNC viewer wrapper that strips auth token from visible URL
cat > /usr/share/novnc/viewer.html << 'VIEWER_EOF'
<!DOCTYPE html>
<html style="margin:0;padding:0;height:100%;overflow:hidden">
<head><meta charset="utf-8"><title>VNC</title></head>
<body style="margin:0;padding:0;height:100%;overflow:hidden">
<iframe id="vnc" style="width:100%;height:100%;border:none"></iframe>
<script>
(function(){
  var params = new URLSearchParams(location.search);
  // Copy tkn to token so noVNC passes it on WebSocket connections
  if (params.has('tkn') && !params.has('token')) {
    params.set('token', params.get('tkn'));
  }
  document.getElementById('vnc').src = 'vnc.html?' + params.toString();
  // Strip secrets from visible URL
  params.delete('tkn');
  params.delete('token');
  var clean = location.pathname + (params.toString() ? '?' + params.toString() : '');
  history.replaceState(null, '', clean);
})();
</script>
</body>
</html>
VIEWER_EOF

# auth-websockify is created as a separate step after install

# Clean apt cache to reduce snapshot size
apt-get clean > /dev/null 2>&1
rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

echo "INSTALL_COMPLETE"
`;

async function main() {
  const client = new ModalClient({ tokenId, tokenSecret });

  try {
    console.log("[build-snapshot] Creating sandbox from python:3.11-slim...");
    const startTime = Date.now();

    const instance = await client.instances.start({
      image: "python:3.11-slim",
      timeoutSeconds: 30 * 60,
      encryptedPorts: [8888, 39377, 39378, 39380],
    });

    console.log(
      `[build-snapshot] Sandbox created: ${instance.id} (${((Date.now() - startTime) / 1000).toFixed(1)}s)`,
    );

    console.log("[build-snapshot] Running install script...");
    const installStart = Date.now();
    const result = await instance.exec(INSTALL_SCRIPT);

    if (result.exit_code !== 0) {
      console.error("[build-snapshot] Install failed:");
      console.error("stdout:", result.stdout);
      console.error("stderr:", result.stderr);
      process.exit(1);
    }

    console.log(
      `[build-snapshot] Install complete (${((Date.now() - installStart) / 1000).toFixed(1)}s)`,
    );

    // Upload locally-built worker-daemon if available (overrides the release binary)
    const localWorkerDaemon = resolve(import.meta.dirname!, "/tmp/worker-daemon-linux");
    if (existsSync(localWorkerDaemon)) {
      console.log("[build-snapshot] Uploading local worker-daemon binary...");
      const binary = readFileSync(localWorkerDaemon);
      const b64 = binary.toString("base64");
      // Write base64 chunks to avoid shell arg limits
      const chunkSize = 65536;
      const chunks = Math.ceil(b64.length / chunkSize);
      await instance.exec("rm -f /tmp/worker-daemon.b64");
      for (let i = 0; i < chunks; i++) {
        const chunk = b64.slice(i * chunkSize, (i + 1) * chunkSize);
        await instance.exec(`printf '%s' '${chunk}' >> /tmp/worker-daemon.b64`);
      }
      const uploadResult = await instance.exec(
        "base64 -d /tmp/worker-daemon.b64 > /usr/local/bin/worker-daemon && chmod +x /usr/local/bin/worker-daemon && rm /tmp/worker-daemon.b64 && echo UPLOAD_OK",
      );
      if (uploadResult.stdout.includes("UPLOAD_OK")) {
        console.log("[build-snapshot] Local worker-daemon uploaded successfully");
      } else {
        console.error("[build-snapshot] Failed to upload worker-daemon:", uploadResult.stderr);
      }
    }

    // Create auth-websockify script (separate exec to avoid heredoc issues in main script)
    console.log("[build-snapshot] Installing auth-websockify...");
    const authWsScript = [
      "#!/usr/bin/python3",
      "import sys, os, urllib.parse",
      "from websockify import websocketproxy",
      "",
      "TOKEN_FILE = '/home/user/.worker-auth-token'",
      "",
      "def _read_token():",
      "    try:",
      "        with open(TOKEN_FILE) as f:",
      "            return f.read().strip()",
      "    except Exception:",
      "        return None",
      "",
      "def _validate_token(handler):",
      "    parsed = urllib.parse.urlparse(handler.path)",
      "    params = urllib.parse.parse_qs(parsed.query)",
      "    tkn = params.get('tkn', params.get('token', [None]))[0]",
      "    expected = _read_token()",
      "    return tkn is not None and expected is not None and tkn == expected",
      "",
      "class AuthRequestHandler(websocketproxy.ProxyRequestHandler):",
      "    def do_GET(self):",
      "        if not _validate_token(self):",
      "            self.send_error(403, 'Forbidden: missing or invalid token')",
      "            return",
      "        return super().do_GET()",
      "",
      "    def do_proxy(self):",
      "        if not _validate_token(self):",
      "            self.send_error(403, 'Forbidden: missing or invalid token')",
      "            return",
      "        return super().do_proxy()",
      "",
      "# Override WebSocketProxy to always use AuthRequestHandler",
      "# (default param is evaluated at define time, so monkey-patching module attr won't work)",
      "OrigWebSocketProxy = websocketproxy.WebSocketProxy",
      "class AuthWebSocketProxy(OrigWebSocketProxy):",
      "    def __init__(self, RequestHandlerClass=AuthRequestHandler, *args, **kwargs):",
      "        super().__init__(RequestHandlerClass=RequestHandlerClass, *args, **kwargs)",
      "websocketproxy.WebSocketProxy = AuthWebSocketProxy",
      "",
      "if __name__ == '__main__':",
      "    websocketproxy.websockify_init()",
    ].join("\n");
    const authWsB64 = Buffer.from(authWsScript).toString("base64");
    const authResult = await instance.exec(
      `echo '${authWsB64}' | base64 -d > /usr/local/bin/auth-websockify && chmod +x /usr/local/bin/auth-websockify && echo AUTH_WS_OK`,
    );
    if (authResult.stdout.includes("AUTH_WS_OK")) {
      console.log("[build-snapshot] auth-websockify installed successfully");
    } else {
      console.error("[build-snapshot] Failed to install auth-websockify:", authResult.stderr);
    }

    console.log("[build-snapshot] Snapshotting filesystem...");
    const snapStart = Date.now();
    const snapshotImageId = await instance.snapshotFilesystem(5 * 60 * 1000);
    console.log(
      `[build-snapshot] Snapshot created: ${snapshotImageId} (${((Date.now() - snapStart) / 1000).toFixed(1)}s)`,
    );

    await instance.stop();

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[build-snapshot] Done in ${totalTime}s`);
    console.log(`\nSnapshot ID: ${snapshotImageId}`);
    console.log(
      `\nTo use this snapshot, update Convex env:\n  cd packages/convex && bunx convex env set MODAL_SNAPSHOT_IMAGE_ID "${snapshotImageId}"`,
    );
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
