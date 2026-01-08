# PVE Sandbox Pool Service

A lightweight middleware service that maintains a pool of pre-created LXC containers to handle bursty sandbox creation requests without hitting Proxmox VE's template lock issues.

## Problem

When multiple sandbox creation requests hit simultaneously (e.g., running the same prompt with different models), concurrent LXC clone operations from the same template fail because Proxmox acquires locks on the template/storage. Only one clone operation can run at a time per template.

## Solution

The pool service:
1. **Pre-creates containers** during idle periods (serialized cloning)
2. **Allocates containers instantly** from the pool on-demand
3. **Replenishes the pool** in the background
4. **Falls back gracefully** to queued cloning if pool is empty

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         PVE Host                                │
│                                                                 │
│  ┌──────────────┐     ┌─────────────────────┐                  │
│  │    Caddy     │────▶│  Pool Service       │                  │
│  │  (optional)  │     │  (FastAPI on :8007) │                  │
│  └──────────────┘     │                     │                  │
│         │             │  - Pool Manager     │                  │
│         │             │  - Background Filler│                  │
│         ▼             │  - Allocator API    │                  │
│  ┌──────────────┐     └─────────┬───────────┘                  │
│  │   PVE API    │◀──────────────┘ (serialized clone requests)  │
│  │   (:8006)    │                                              │
│  └──────────────┘                                              │
│                                                                 │
│  Pool: [CT-201] [CT-202] [CT-203] [CT-204] [CT-205] ...        │
│         stopped  stopped  stopped  stopped  stopped            │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

### Quick Install (on PVE host)

```bash
curl -fsSL https://raw.githubusercontent.com/manaflow-ai/cmux/main/scripts/pve/sandbox-pool/install.sh | bash
```

### Manual Install

```bash
# 1. Create installation directory
mkdir -p /opt/cmux-sandbox-pool
cd /opt/cmux-sandbox-pool

# 2. Copy files
cp pool_service.py requirements.txt .env.example ./

# 3. Create virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Edit .env with your PVE credentials

# 5. Install systemd service
cp sandbox-pool.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now sandbox-pool
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PVE_API_URL` | PVE API URL (required) | - |
| `PVE_API_TOKEN` | PVE API token (required) | - |
| `PVE_NODE` | PVE node name | Auto-detected |
| `POOL_TARGET_SIZE` | Target containers per template | `5` |
| `POOL_MIN_SIZE` | Minimum containers to maintain | `3` |
| `POOL_MAX_SIZE` | Maximum containers allowed | `10` |
| `REPLENISH_INTERVAL_SECONDS` | Replenishment check interval | `30` |

### cmux Integration

Add to your cmux `.env`:

```bash
# Direct connection (if cmux runs on PVE host or same network)
PVE_POOL_URL=http://127.0.0.1:8007

# Via Caddy proxy (recommended for remote access)
PVE_POOL_URL=https://pve.example.com/pool
```

### Caddy Configuration

If using Caddy as a reverse proxy:

```caddyfile
pve.example.com {
    # Route pool API requests
    handle /pool/* {
        uri strip_prefix /pool
        reverse_proxy 127.0.0.1:8007
    }

    # Route to PVE API
    handle {
        reverse_proxy https://127.0.0.1:8006 {
            transport http {
                tls_insecure_skip_verify
            }
        }
    }
}
```

## API Endpoints

### `GET /health`
Health check endpoint.

### `GET /status`
Get pool status including container counts per template.

```json
{
  "templates": {
    "9009": {
      "template_vmid": 9009,
      "ready_count": 3,
      "allocated_count": 2,
      "creating_count": 1,
      "target_size": 5,
      "containers": [...]
    }
  },
  "total_ready": 3,
  "total_allocated": 2,
  "total_creating": 1,
  "clone_queue_length": 0
}
```

### `POST /allocate`
Allocate a container from the pool.

Request:
```json
{
  "template_vmid": 9009,
  "instance_id": "pvelxc-abc123",
  "metadata": {"teamId": "...", "userId": "..."}
}
```

Query parameters:
- `start=true` (default): Start the container after allocation

Response:
```json
{
  "vmid": 205,
  "hostname": "pvelxc-abc123",
  "instance_id": "pvelxc-abc123",
  "template_vmid": 9009,
  "allocated_from_pool": true
}
```

### `POST /release/{vmid}`
Release a container back to the pool (stop and mark ready).

### `DELETE /containers/{vmid}`
Remove a container from the pool entirely.

### `POST /warm/{template_vmid}`
Pre-warm the pool for a specific template.

## Operations

### View logs
```bash
journalctl -fu sandbox-pool
```

### Check status
```bash
curl http://127.0.0.1:8007/status | jq
```

### Pre-warm pool for a template
```bash
curl -X POST "http://127.0.0.1:8007/warm/9009?count=5"
```

### Restart service
```bash
systemctl restart sandbox-pool
```

## How It Works

1. **Startup**: Service discovers existing pool containers (prefix `pool-*`)
2. **Background replenishment**: Every 30s, checks each template's pool size and queues clones if below target
3. **Clone worker**: Processes clone requests serially to avoid lock conflicts, with retry logic for transient errors
4. **Allocation**: Returns a ready container instantly, or queues a new clone if pool is empty
5. **Hostname rename**: On allocation, renames container to match requested instance ID

## Performance

| Scenario | Without Pool | With Pool |
|----------|--------------|-----------|
| Single request | ~15-30s (clone + start) | ~2-5s (start only) |
| 5 concurrent requests | Failures due to locks | All succeed instantly |
| Burst of 10 requests | Multiple failures | First 5 instant, rest queued |

## Troubleshooting

### Service won't start
```bash
systemctl status sandbox-pool
journalctl -u sandbox-pool --no-pager
```

### Pool not filling
- Check PVE API credentials in `.env`
- Verify template exists: `pct list | grep 9009`
- Check for storage space issues

### Clone errors
- "CT is locked": Normal, the service will retry
- Storage errors: Check `pvesm status`

## License

MIT License - See main cmux repository for details.
