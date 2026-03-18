# @cmux/pve-lxc-client

Proxmox VE LXC client for managing containers on self-hosted Proxmox infrastructure.

## Overview

This client provides a consistent interface for managing LXC containers on Proxmox VE, mirroring the MorphCloudClient API for seamless provider switching between cloud (Morph, E2B) and self-hosted (PVE-LXC) sandboxes.

## Features

- **Container Lifecycle**: Create, start, stop, and delete LXC containers
- **Command Execution**: Run commands inside containers via `lxc-attach`
- **HTTP Services**: Expose and manage HTTP services from containers
- **Snapshot Support**: Clone containers from templates using canonical snapshot IDs
- **Cloudflare Integration**: Optional public domain routing via Cloudflare Tunnel

## Installation

This is a private workspace package. Import from other packages:

```typescript
import { PveLxcClient, PveLxcInstance } from "@cmux/pve-lxc-client";
```

## Configuration

```typescript
const client = new PveLxcClient({
  apiUrl: "https://pve.example.com:8006",
  apiToken: "user@pam!tokenid=secret-token-uuid",
  node: "pve",
  publicDomain: "example.com", // Optional: for Cloudflare Tunnel
  verifyTls: true,
});
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `PVE_API_URL` | Proxmox VE API endpoint |
| `PVE_API_TOKEN` | API token in `user@realm!tokenid=secret` format |
| `PVE_PUBLIC_DOMAIN` | Public domain for Cloudflare Tunnel (optional) |

## Usage

### Create a Container

```typescript
const instance = await client.startContainer({
  snapshotId: "snapshot_abc123",
  metadata: {
    app: "cmux",
    teamId: "team_123",
  },
});

console.log(instance.id); // "pvelxc-xyz789"
console.log(instance.networking.httpServices);
```

### Execute Commands

```typescript
const result = await instance.exec("echo hello");
console.log(result.stdout); // "hello"
console.log(result.exit_code); // 0
```

### Stop and Delete

```typescript
await instance.stop();
await instance.delete();
```

## API Reference

### PveLxcClient

| Method | Description |
|--------|-------------|
| `startContainer(options)` | Create and start a new container from snapshot |
| `getInstance(id)` | Get an existing container instance |
| `listInstances()` | List all managed containers |
| `stopContainer(id)` | Stop a running container |
| `deleteContainer(id)` | Delete a container |

### PveLxcInstance

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Instance ID (e.g., "pvelxc-abc123") |
| `vmid` | number | Proxmox VMID |
| `status` | ContainerStatus | "running", "stopped", "paused", "unknown" |
| `networking` | ContainerNetworking | HTTP services and hostname |
| `metadata` | ContainerMetadata | Custom metadata tags |

| Method | Description |
|--------|-------------|
| `exec(command)` | Execute command in container |
| `stop()` | Stop the container |
| `delete()` | Delete the container |

## Related

- `apps/edge-router-pvelxc/` - Edge router for PVE-LXC sandboxes
- `scripts/snapshot-pvelxc.py` - Snapshot builder script
- `scripts/pve/pve-lxc-setup.sh` - Template setup script
