import { Template } from 'e2b'
import * as fs from 'node:fs'
import * as path from 'node:path'

// Read files from the worker directory
const workerDir = path.join(__dirname, '../worker')
const xstartupContent = fs.readFileSync(path.join(workerDir, 'xstartup'), 'utf8')
const startServicesContent = fs.readFileSync(path.join(workerDir, 'start-services-lite.sh'), 'utf8')

// Read Go source files for worker daemon
const goModContent = fs.readFileSync(path.join(__dirname, '../go.mod'), 'utf8')
const goSumContent = fs.readFileSync(path.join(__dirname, '../go.sum'), 'utf8')

// Read worker daemon source
const workerMainContent = fs.readFileSync(path.join(__dirname, '../cmd/worker/main.go'), 'utf8')
const browserContent = fs.readFileSync(path.join(__dirname, '../cmd/worker/browser.go'), 'utf8')
const vncContent = fs.readFileSync(path.join(__dirname, '../cmd/worker/vnc.go'), 'utf8')

// Helper to escape content for shell (used internally by base64 encoding)
function _escapeForShell(content: string): string {
  return content.replace(/'/g, "'\"'\"'")
}

export const template = Template()
  .fromBaseImage()

  // Install system packages
  .aptInstall([
    'curl', 'wget', 'git', 'build-essential', 'ca-certificates', 'gnupg', 'lsb-release', 'jq',
    'netcat-openbsd', 'python3', 'python3-pip', 'unzip', 'openssl', 'rsync',
    'xfce4', 'xfce4-goodies', 'dbus-x11', 'tigervnc-standalone-server',
    'fonts-liberation', 'fonts-dejavu-core', 'fonts-noto-color-emoji'
  ])

  // Install Node.js 22 via direct download (not nodesource to avoid cache issues)
  .runCmd('curl -fsSL https://nodejs.org/dist/v22.14.0/node-v22.14.0-linux-x64.tar.xz | sudo tar -xJ -C /usr/local --strip-components=1')

  // Install Bun
  .runCmd('curl -fsSL https://bun.sh/install | bash && sudo cp ~/.bun/bin/bun /usr/local/bin/bun && sudo ln -sf /usr/local/bin/bun /usr/local/bin/bunx')

  // Install Rust
  .runCmd(`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo sudo -E sh -s -- -y --default-toolchain stable --no-modify-path && sudo chmod -R a+rX /usr/local/rustup /usr/local/cargo && sudo ln -sf /usr/local/cargo/bin/* /usr/local/bin/`)

  // Install GitHub CLI
  .runCmd(`curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null && sudo apt-get update && sudo apt-get install -y gh`)

  // Install cmux-code (VSCode fork)
  .runCmd(`RELEASE_URL=$(curl -s https://api.github.com/repos/manaflow-ai/vscode-1/releases/latest | grep "browser_download_url.*vscode-server-linux-x64-web.tar.gz" | cut -d '"' -f 4) && wget -q "$RELEASE_URL" -O /tmp/cmux-code.tar.gz && sudo mkdir -p /app/cmux-code && sudo tar -xzf /tmp/cmux-code.tar.gz -C /app/cmux-code --strip-components=1 && rm /tmp/cmux-code.tar.gz && sudo chmod -R 755 /app/cmux-code`)

  // Install noVNC (clone as root since /opt requires root permissions)
  .gitClone('https://github.com/novnc/noVNC.git', '/opt/noVNC', { depth: 1, user: 'root' })
  .gitClone('https://github.com/novnc/websockify.git', '/opt/noVNC/utils/websockify', { depth: 1, user: 'root' })
  .runCmd('sudo ln -s /opt/noVNC/vnc.html /opt/noVNC/index.html && sudo chmod -R 755 /opt/noVNC')

  // Install Chrome
  .runCmd(`wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list && sudo apt-get update && sudo apt-get install -y google-chrome-stable`)

  // Setup directories
  .makeDir('/home/user/workspace')
  .makeDir('/home/user/.vnc')
  .makeDir('/home/user/.chrome-data')
  .makeDir('/home/user/.config')
  .makeDir('/home/user/.vscode-server-oss/data/User/profiles/default-profile')
  .makeDir('/home/user/.vscode-server-oss/data/Machine')
  .makeDir('/home/user/.vscode-server-oss/extensions')

  // Configure VSCode settings
  .runCmd(`echo '{"workbench.colorTheme":"Default Dark Modern","security.workspace.trust.enabled":false,"extensions.verifySignature":false}' > ~/.vscode-server-oss/data/User/settings.json && cp ~/.vscode-server-oss/data/User/settings.json ~/.vscode-server-oss/data/User/profiles/default-profile/settings.json && cp ~/.vscode-server-oss/data/User/settings.json ~/.vscode-server-oss/data/Machine/settings.json`)

  // Set up VNC password (empty)
  .runCmd('echo "" | vncpasswd -f > ~/.vnc/passwd && chmod 600 ~/.vnc/passwd')

  // Write xstartup script using base64 to avoid shell escaping issues
  .runCmd(`echo '${Buffer.from(xstartupContent).toString('base64')}' | base64 -d > ~/.vnc/xstartup && chmod 755 ~/.vnc/xstartup`)

  // Write start services script
  .runCmd(`echo '${Buffer.from(startServicesContent).toString('base64')}' | base64 -d | sudo tee /usr/local/bin/start-services.sh > /dev/null && sudo chmod 755 /usr/local/bin/start-services.sh`)

  // Install Go
  .runCmd('wget -q https://go.dev/dl/go1.24.2.linux-amd64.tar.gz && sudo tar -C /usr/local -xzf go1.24.2.linux-amd64.tar.gz && rm go1.24.2.linux-amd64.tar.gz')

  // Write Go source files using base64
  .makeDir('/tmp/worker-build/cmd/worker')
  .runCmd(`echo '${Buffer.from(goModContent).toString('base64')}' | base64 -d > /tmp/worker-build/go.mod`)
  .runCmd(`echo '${Buffer.from(goSumContent).toString('base64')}' | base64 -d > /tmp/worker-build/go.sum`)
  .runCmd(`echo '${Buffer.from(workerMainContent).toString('base64')}' | base64 -d > /tmp/worker-build/cmd/worker/main.go`)
  .runCmd(`echo '${Buffer.from(browserContent).toString('base64')}' | base64 -d > /tmp/worker-build/cmd/worker/browser.go`)
  .runCmd(`echo '${Buffer.from(vncContent).toString('base64')}' | base64 -d > /tmp/worker-build/cmd/worker/vnc.go`)

  // Build worker daemon
  .runCmd('cd /tmp/worker-build && /usr/local/go/bin/go mod download && /usr/local/go/bin/go build -ldflags="-s -w" -o /tmp/worker-daemon ./cmd/worker && sudo mv /tmp/worker-daemon /usr/local/bin/worker-daemon && rm -rf /tmp/worker-build')

  // Cleanup
  .runCmd('sudo rm -rf /var/lib/apt/lists/*')

  // Set start command
  .setStartCmd('/usr/local/bin/start-services.sh')
  .setReadyCmd('curl -sf http://localhost:39377/health || exit 1')
