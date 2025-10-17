# Devbox Proxy Setup for Electron WebContentsView

This document describes how to set up the proxy on the devbox to enable Electron WebContentsView to load localhost services.

## Overview

The setup installs sing-box, a fast proxy that supports both HTTP and SOCKS5 on a single port (39384). This allows the Electron app to access localhost services on the devbox via the proxy.

## Installation on Devbox

### 1. Install sing-box

Download and install sing-box from the latest release:

```bash
# Determine architecture
arch="$(uname -m)"
case "${arch}" in
  x86_64) singbox_arch="linux-amd64" ;;
  aarch64|arm64) singbox_arch="linux-arm64" ;;
  *) echo "Unsupported architecture: ${arch}"; exit 1 ;;
esac

# Get latest version
version="$(curl -fsSL https://api.github.com/repos/SagerNet/sing-box/releases/latest | jq -r '.tag_name')"

# Download and install
curl -fsSL "https://github.com/SagerNet/sing-box/releases/download/${version}/sing-box-${version#v}-${singbox_arch}.tar.gz" -o /tmp/sing-box.tar.gz
tar -xzf /tmp/sing-box.tar.gz -C /tmp
sudo install -m 0755 /tmp/sing-box*/sing-box /usr/local/bin/sing-box
rm -rf /tmp/sing-box.tar.gz /tmp/sing-box*
```

### 2. Create config directory and file

```bash
sudo mkdir -p /etc/sing-box
sudo tee /etc/sing-box/config.json > /dev/null << 'EOF'
{
  "log": {
    "level": "info"
  },
  "inbounds": [
    {
      "type": "mixed",
      "tag": "mixed-in",
      "listen": "::",
      "listen_port": 39384,
      "sniff": true,
      "sniff_override_destination": true
    }
  ],
  "outbounds": [
    {
      "type": "direct",
      "tag": "direct"
    }
  ],
  "route": {
    "rules": [
      {
        "inbound": ["mixed-in"],
        "outbound": "direct"
      }
    ]
  }
}
EOF
```

### 3. Install systemd service

Create `/etc/systemd/system/sing-box.service`:

```ini
[Unit]
Description=sing-box proxy service
After=network.target
Wants=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/sing-box run -c /etc/sing-box/config.json
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable sing-box
sudo systemctl start sing-box
```

## Electron App Configuration

The Electron app automatically configures the proxy when launching. The proxy settings are:

- **Host**: Configurable via `DEVBOX_HOST` environment variable (defaults to `localhost`)
- **Port**: 39384
- **Protocols**: HTTP, HTTPS, SOCKS5
- **Bypass**: Loopback addresses (`<-loopback>`)

To override the devbox host:

```bash
DEVBOX_HOST=your-devbox-host electron .
```

## Verification

### 1. Check proxy is running

```bash
sudo systemctl status sing-box
```

### 2. Test proxy connectivity

```bash
# Test HTTP proxy
curl -x http://localhost:39384 http://localhost:3000

# Test HTTPS proxy
curl -x https://localhost:39384 https://localhost:3000

# Test SOCKS5 proxy
curl --socks5 localhost:39384 http://localhost:3000
```

### 3. Test WebSocket connections

```bash
# Test ws://
curl --proxy http://localhost:39384 --include --no-buffer --header "Connection: Upgrade" --header "Upgrade: websocket" --header "Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==" --header "Sec-WebSocket-Version: 13" ws://localhost:3000/ws
```

## Docker Container Setup

The Docker container automatically includes sing-box setup. The container exposes port 39384 and includes a healthcheck.

To run the container:

```bash
docker run -p 39384:39384 your-image
```

## Troubleshooting

### Proxy not responding

Check logs:
```bash
sudo journalctl -u sing-box -f
```

### Port already in use

Find what's using port 39384:
```bash
sudo lsof -i :39384
```

### Electron proxy issues

Ensure the `DEVBOX_HOST` is correctly set to the IP/hostname where sing-box is running.