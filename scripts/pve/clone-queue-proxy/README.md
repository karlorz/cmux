# PVE Clone Queue Proxy

A lightweight Go middleware that serializes Proxmox VE LXC clone operations to prevent concurrent clone failures.

## Problem

When multiple LXC clone requests hit PVE simultaneously (e.g., spawning multiple coding agent sandboxes), concurrent clones from the same template fail with "CT is locked" or task busy errors. Proxmox acquires locks on the template/storage during clone operations, and concurrent cloning from one template is not supported.

## Solution

This proxy intercepts clone requests (`POST /api2/json/nodes/{node}/lxc/{vmid}/clone`) and queues them, ensuring only one clone operation runs at a time. All other PVE API requests pass through unchanged.

The proxy:
1. Intercepts clone POST requests
2. Queues them in a channel
3. Processes one at a time
4. Polls the UPID task status until completion
5. Returns the response only after the clone is fully complete

## Installation

### 1. Build the binary

```bash
cd scripts/pve/clone-queue-proxy
go build -o pve-clone-queue-proxy .
```

Or cross-compile for your PVE host:

```bash
GOOS=linux GOARCH=amd64 go build -o pve-clone-queue-proxy .
```

### 2. Install on PVE host

```bash
# Copy binary
scp pve-clone-queue-proxy root@pve:/usr/local/bin/
ssh root@pve chmod +x /usr/local/bin/pve-clone-queue-proxy

# Copy systemd unit
scp pve-clone-queue-proxy.service root@pve:/etc/systemd/system/

# Enable and start
ssh root@pve "systemctl daemon-reload && systemctl enable --now pve-clone-queue-proxy"
```

### 3. Configure Caddy

Add to your Caddyfile (see `Caddyfile.example` for full options):

```caddyfile
pve.example.com {
    tls /etc/ssl/certs/pve.crt /etc/ssl/private/pve.key

    reverse_proxy localhost:8081 {
        transport http {
            tls_insecure_skip_verify
            read_timeout 10m
            write_timeout 10m
        }
    }
}
```

Then reload Caddy:

```bash
systemctl reload caddy
```

## Configuration

Command-line flags:

| Flag | Default | Description |
|------|---------|-------------|
| `-listen` | `:8081` | Address to listen on |
| `-backend` | `https://127.0.0.1:8006` | PVE API backend URL |
| `-insecure` | `true` | Skip TLS verification for backend |
| `-poll-delay` | `500ms` | Delay between task status polls |
| `-task-timeout` | `5m` | Maximum time to wait for clone task |
| `-request-timeout` | `30s` | Timeout for individual API requests |

## Architecture

```
                                    +-------------------+
                                    |   Caddy (TLS)     |
                                    |   pve.example.com |
                                    +--------+----------+
                                             |
                                             v
+------------------+               +-------------------+
|  cmux client     | --HTTPS-->   |  Clone Queue      |
|  (clone request) |               |  Proxy (:8081)    |
+------------------+               +--------+----------+
                                             |
                    +------------------------+------------------------+
                    |                                                 |
                    v                                                 v
          +-----------------+                               +-----------------+
          | Clone Request?  |                               | Other Request?  |
          | (POST .../clone)|                               | (pass-through)  |
          +--------+--------+                               +--------+--------+
                   |                                                 |
                   v                                                 |
          +------------------+                                       |
          |  Queue (channel) |                                       |
          +--------+---------+                                       |
                   |                                                 |
                   v                                                 |
          +------------------+                                       |
          | Process one at   |                                       |
          | a time (mutex)   |                                       |
          +--------+---------+                                       |
                   |                                                 |
                   +------------------------+------------------------+
                                            |
                                            v
                                   +-------------------+
                                   |  PVE API (:8006)  |
                                   +-------------------+
```

## Monitoring

View logs:

```bash
journalctl -u pve-clone-queue-proxy -f
```

Example output:

```
CLONE QUEUED: node=pve vmid=9000
CLONE START: node=pve vmid=9000
CLONE TASK: node=pve vmid=9000 upid=UPID:pve:00001234:...
TASK POLLING: status=running
TASK POLLING: status=running
CLONE COMPLETE: node=pve vmid=9000 upid=UPID:pve:00001234:... (elapsed: 2.3s)
```

## Troubleshooting

### Clone requests timing out

Increase `-task-timeout`:

```bash
ExecStart=/usr/local/bin/pve-clone-queue-proxy -task-timeout 10m
```

### Connection refused to backend

Ensure PVE API is running:

```bash
systemctl status pvedaemon pveproxy
```

### Queue full errors

Increase queue buffer in source (default: 100) if you have many concurrent requests.

## License

MIT - Part of the cmux project.
