#!/usr/bin/env python3
"""
PVE Sandbox Pool Service

A lightweight middleware service that maintains a pool of pre-created LXC containers
to handle bursty sandbox creation requests without hitting PVE's template lock issues.

The service:
1. Pre-creates containers from templates during idle periods (serialized cloning)
2. Allocates containers from the pool on-demand (instant, no cloning needed)
3. Replenishes the pool in the background
4. Handles container reset/cleanup for reuse (optional)

Run with: uvicorn pool_service:app --host 0.0.0.0 --port 8007
"""

import asyncio
import hashlib
import json
import logging
import os
import re
import secrets
import ssl
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from pydantic import BaseModel

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sandbox-pool")

# =============================================================================
# Configuration
# =============================================================================


@dataclass
class PoolConfig:
    """Pool service configuration"""

    # PVE API connection
    pve_api_url: str = field(default_factory=lambda: os.environ.get("PVE_API_URL", ""))
    pve_api_token: str = field(
        default_factory=lambda: os.environ.get("PVE_API_TOKEN", "")
    )
    pve_node: str | None = field(
        default_factory=lambda: os.environ.get("PVE_NODE", None)
    )
    pve_verify_tls: bool = field(
        default_factory=lambda: os.environ.get("PVE_VERIFY_TLS", "false").lower()
        == "true"
    )

    # Pool settings per template
    pool_min_size: int = field(
        default_factory=lambda: int(os.environ.get("POOL_MIN_SIZE", "3"))
    )
    pool_max_size: int = field(
        default_factory=lambda: int(os.environ.get("POOL_MAX_SIZE", "10"))
    )
    pool_target_size: int = field(
        default_factory=lambda: int(os.environ.get("POOL_TARGET_SIZE", "5"))
    )

    # Replenishment settings
    replenish_interval_seconds: int = field(
        default_factory=lambda: int(os.environ.get("REPLENISH_INTERVAL_SECONDS", "30"))
    )
    replenish_batch_size: int = field(
        default_factory=lambda: int(os.environ.get("REPLENISH_BATCH_SIZE", "1"))
    )

    # Container settings
    container_hostname_prefix: str = field(
        default_factory=lambda: os.environ.get("CONTAINER_HOSTNAME_PREFIX", "pool-")
    )
    container_vmid_start: int = field(
        default_factory=lambda: int(os.environ.get("CONTAINER_VMID_START", "200"))
    )

    # Clone retry settings
    clone_max_retries: int = field(
        default_factory=lambda: int(os.environ.get("CLONE_MAX_RETRIES", "3"))
    )
    clone_retry_delay_seconds: float = field(
        default_factory=lambda: float(os.environ.get("CLONE_RETRY_DELAY_SECONDS", "5"))
    )
    clone_retry_jitter_seconds: float = field(
        default_factory=lambda: float(
            os.environ.get("CLONE_RETRY_JITTER_SECONDS", "2")
        )
    )


# =============================================================================
# Data Models
# =============================================================================


class ContainerState(str, Enum):
    """Container lifecycle states in the pool"""

    CREATING = "creating"  # Clone in progress
    READY = "ready"  # Stopped, ready for allocation
    ALLOCATED = "allocated"  # Assigned to a user, starting/running
    FAILED = "failed"  # Creation failed


@dataclass
class PooledContainer:
    """A container in the pool"""

    vmid: int
    hostname: str
    template_vmid: int
    state: ContainerState
    created_at: datetime
    allocated_at: datetime | None = None
    allocated_to: str | None = None  # instanceId assigned on allocation
    error: str | None = None


class AllocateRequest(BaseModel):
    """Request to allocate a container from the pool"""

    template_vmid: int
    instance_id: str | None = None  # If not provided, will be generated
    metadata: dict[str, str] = {}


class AllocateResponse(BaseModel):
    """Response from container allocation"""

    vmid: int
    hostname: str
    instance_id: str
    template_vmid: int
    allocated_from_pool: bool  # True if instant from pool, False if created on-demand


class PoolStatus(BaseModel):
    """Pool status information"""

    templates: dict[int, "TemplatePoolStatus"]
    total_ready: int
    total_allocated: int
    total_creating: int
    clone_queue_length: int


class TemplatePoolStatus(BaseModel):
    """Status for a single template's pool"""

    template_vmid: int
    ready_count: int
    allocated_count: int
    creating_count: int
    target_size: int
    containers: list[dict[str, Any]]


# =============================================================================
# PVE API Client
# =============================================================================


class PveClient:
    """Async Proxmox VE API client"""

    def __init__(self, config: PoolConfig):
        self.config = config
        self.base_url = config.pve_api_url.rstrip("/")
        self.token = config.pve_api_token
        self._node: str | None = config.pve_node
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            ssl_context = (
                ssl.create_default_context()
                if self.config.pve_verify_tls
                else False  # noqa: FBT003
            )
            self._client = httpx.AsyncClient(
                verify=ssl_context,
                timeout=httpx.Timeout(60.0, connect=10.0),
                headers={"Authorization": f"PVEAPIToken={self.token}"},
            )
        return self._client

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None

    async def get_node(self) -> str:
        """Get the target node (auto-detect if not configured)"""
        if self._node:
            return self._node

        client = await self._get_client()
        response = await client.get(f"{self.base_url}/api2/json/nodes")
        response.raise_for_status()
        data = response.json()
        nodes = data.get("data", [])
        if not nodes:
            raise RuntimeError("No nodes found in PVE cluster")
        self._node = nodes[0]["node"]
        logger.info(f"Auto-detected PVE node: {self._node}")
        return self._node

    async def _request(
        self,
        method: str,
        path: str,
        data: dict[str, Any] | None = None,
    ) -> Any:
        """Make an API request to PVE"""
        client = await self._get_client()
        url = f"{self.base_url}{path}"

        if method.upper() == "GET":
            response = await client.get(url)
        elif method.upper() == "POST":
            # PVE uses form-urlencoded for POST
            response = await client.post(
                url,
                data={k: str(v) for k, v in (data or {}).items()},
            )
        elif method.upper() == "DELETE":
            response = await client.delete(url)
        else:
            raise ValueError(f"Unsupported method: {method}")

        response.raise_for_status()
        result = response.json()
        return result.get("data")

    async def get_task_status(self, upid: str) -> dict[str, Any]:
        """Get status of a PVE task"""
        node = await self.get_node()
        return await self._request(
            "GET", f"/api2/json/nodes/{node}/tasks/{upid}/status"
        )

    async def wait_for_task(
        self,
        upid: str,
        timeout_seconds: float = 300,
        poll_interval: float = 2.0,
    ) -> None:
        """Wait for a PVE task to complete"""
        if not upid:
            logger.warning("No UPID provided, assuming synchronous completion")
            return

        # Handle URL-encoded UPIDs
        if "%3A" in upid:
            import urllib.parse

            upid = urllib.parse.unquote(upid)

        start_time = time.monotonic()
        while time.monotonic() - start_time < timeout_seconds:
            try:
                status = await self.get_task_status(upid)
                if status.get("status") == "stopped":
                    exit_status = status.get("exitstatus", "")
                    if exit_status != "OK":
                        raise RuntimeError(f"Task failed: {exit_status}")
                    return
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 500:
                    # Task may have completed and been cleaned up
                    logger.warning(f"Task status check failed (may be completed): {e}")
                    return
                raise

            await asyncio.sleep(poll_interval)

        raise TimeoutError(f"Task {upid} did not complete within {timeout_seconds}s")

    async def list_containers(self) -> list[dict[str, Any]]:
        """List all LXC containers on the node"""
        node = await self.get_node()
        return await self._request("GET", f"/api2/json/nodes/{node}/lxc")

    async def get_container_config(self, vmid: int) -> dict[str, Any]:
        """Get container configuration"""
        node = await self.get_node()
        return await self._request("GET", f"/api2/json/nodes/{node}/lxc/{vmid}/config")

    async def get_container_status(self, vmid: int) -> dict[str, Any]:
        """Get container status"""
        node = await self.get_node()
        return await self._request(
            "GET", f"/api2/json/nodes/{node}/lxc/{vmid}/status/current"
        )

    async def linked_clone(
        self,
        template_vmid: int,
        new_vmid: int,
        hostname: str,
    ) -> str:
        """Create a linked clone from a template. Returns UPID."""
        node = await self.get_node()
        upid = await self._request(
            "POST",
            f"/api2/json/nodes/{node}/lxc/{template_vmid}/clone",
            {
                "newid": new_vmid,
                "hostname": hostname,
                "full": 0,  # Linked clone
            },
        )
        return upid

    async def start_container(self, vmid: int) -> str:
        """Start a container. Returns UPID."""
        node = await self.get_node()
        return await self._request(
            "POST", f"/api2/json/nodes/{node}/lxc/{vmid}/status/start"
        )

    async def stop_container(self, vmid: int) -> str:
        """Stop a container. Returns UPID."""
        node = await self.get_node()
        return await self._request(
            "POST", f"/api2/json/nodes/{node}/lxc/{vmid}/status/stop"
        )

    async def delete_container(self, vmid: int) -> str:
        """Delete a container. Returns UPID."""
        node = await self.get_node()
        return await self._request("DELETE", f"/api2/json/nodes/{node}/lxc/{vmid}")

    async def set_container_hostname(self, vmid: int, hostname: str) -> None:
        """Update container hostname in config"""
        node = await self.get_node()
        await self._request(
            "POST",
            f"/api2/json/nodes/{node}/lxc/{vmid}/config",
            {"hostname": hostname},
        )


# =============================================================================
# Pool Manager
# =============================================================================


class PoolManager:
    """Manages the pool of pre-created containers"""

    def __init__(self, config: PoolConfig, pve: PveClient):
        self.config = config
        self.pve = pve

        # Pool state: template_vmid -> list of PooledContainer
        self.pools: dict[int, list[PooledContainer]] = {}

        # Clone queue for serialized cloning
        self._clone_queue: asyncio.Queue[tuple[int, asyncio.Future[PooledContainer]]] = (
            asyncio.Queue()
        )
        self._clone_worker_task: asyncio.Task | None = None
        self._replenish_task: asyncio.Task | None = None

        # Lock for pool state modifications
        self._pool_lock = asyncio.Lock()

        # Used VMIDs tracking
        self._used_vmids: set[int] = set()

    async def start(self):
        """Start the pool manager background tasks"""
        logger.info("Starting pool manager...")

        # Discover existing pool containers
        await self._discover_existing_containers()

        # Start background workers
        self._clone_worker_task = asyncio.create_task(self._clone_worker())
        self._replenish_task = asyncio.create_task(self._replenish_worker())

        logger.info("Pool manager started")

    async def stop(self):
        """Stop the pool manager"""
        logger.info("Stopping pool manager...")

        if self._clone_worker_task:
            self._clone_worker_task.cancel()
            try:
                await self._clone_worker_task
            except asyncio.CancelledError:
                pass

        if self._replenish_task:
            self._replenish_task.cancel()
            try:
                await self._replenish_task
            except asyncio.CancelledError:
                pass

        await self.pve.close()
        logger.info("Pool manager stopped")

    async def _discover_existing_containers(self):
        """Discover existing pool containers on startup"""
        try:
            containers = await self.pve.list_containers()
            prefix = self.config.container_hostname_prefix

            for container in containers:
                hostname = container.get("name", "")
                vmid = container.get("vmid")

                if not hostname.startswith(prefix) or vmid is None:
                    continue

                self._used_vmids.add(vmid)

                # Parse template VMID from hostname: pool-{template_vmid}-{random}
                match = re.match(rf"^{re.escape(prefix)}(\d+)-", hostname)
                if not match:
                    continue

                template_vmid = int(match.group(1))
                status = container.get("status", "unknown")

                # Determine container state
                if status == "stopped":
                    state = ContainerState.READY
                elif status == "running":
                    state = ContainerState.ALLOCATED
                else:
                    state = ContainerState.FAILED

                pooled = PooledContainer(
                    vmid=vmid,
                    hostname=hostname,
                    template_vmid=template_vmid,
                    state=state,
                    created_at=datetime.now(timezone.utc),
                )

                if template_vmid not in self.pools:
                    self.pools[template_vmid] = []
                self.pools[template_vmid].append(pooled)

                logger.info(
                    f"Discovered existing pool container: {hostname} (vmid={vmid}, state={state})"
                )

        except Exception as e:
            logger.error(f"Failed to discover existing containers: {e}")

    def _generate_hostname(self, template_vmid: int) -> str:
        """Generate a unique hostname for a pool container"""
        random_suffix = secrets.token_hex(4)
        return f"{self.config.container_hostname_prefix}{template_vmid}-{random_suffix}"

    async def _find_next_vmid(self) -> int:
        """Find the next available VMID"""
        try:
            containers = await self.pve.list_containers()
            used = {c.get("vmid") for c in containers if c.get("vmid")}
            used.update(self._used_vmids)

            vmid = self.config.container_vmid_start
            while vmid in used:
                vmid += 1

            self._used_vmids.add(vmid)
            return vmid

        except Exception as e:
            logger.error(f"Failed to find next VMID: {e}")
            # Fallback: use timestamp-based VMID
            vmid = self.config.container_vmid_start + (int(time.time()) % 10000)
            self._used_vmids.add(vmid)
            return vmid

    async def _clone_worker(self):
        """Worker that processes clone requests serially"""
        logger.info("Clone worker started")

        while True:
            try:
                template_vmid, future = await self._clone_queue.get()

                try:
                    container = await self._create_container(template_vmid)
                    future.set_result(container)
                except Exception as e:
                    logger.error(f"Clone failed for template {template_vmid}: {e}")
                    future.set_exception(e)
                finally:
                    self._clone_queue.task_done()

            except asyncio.CancelledError:
                logger.info("Clone worker cancelled")
                break
            except Exception as e:
                logger.error(f"Clone worker error: {e}")
                await asyncio.sleep(1)

    async def _create_container(self, template_vmid: int) -> PooledContainer:
        """Create a new container from template (with retry logic)"""
        hostname = self._generate_hostname(template_vmid)
        vmid = await self._find_next_vmid()

        logger.info(
            f"Creating container {hostname} (vmid={vmid}) from template {template_vmid}"
        )

        container = PooledContainer(
            vmid=vmid,
            hostname=hostname,
            template_vmid=template_vmid,
            state=ContainerState.CREATING,
            created_at=datetime.now(timezone.utc),
        )

        # Add to pool immediately (in CREATING state)
        async with self._pool_lock:
            if template_vmid not in self.pools:
                self.pools[template_vmid] = []
            self.pools[template_vmid].append(container)

        last_error = None
        for attempt in range(1, self.config.clone_max_retries + 1):
            try:
                # Linked clone from template
                upid = await self.pve.linked_clone(template_vmid, vmid, hostname)
                await self.pve.wait_for_task(upid)

                # Container created successfully, mark as ready (stopped)
                container.state = ContainerState.READY
                logger.info(
                    f"Container {hostname} (vmid={vmid}) created successfully"
                )
                return container

            except Exception as e:
                last_error = e
                error_str = str(e).lower()

                # Check if it's a lock error that's worth retrying
                if "locked" in error_str or "busy" in error_str:
                    if attempt < self.config.clone_max_retries:
                        jitter = secrets.SystemRandom().uniform(
                            0, self.config.clone_retry_jitter_seconds
                        )
                        delay = self.config.clone_retry_delay_seconds + jitter
                        logger.warning(
                            f"Clone attempt {attempt} failed (lock), retrying in {delay:.1f}s: {e}"
                        )
                        await asyncio.sleep(delay)
                        continue

                # Non-retryable error or max retries reached
                logger.error(
                    f"Clone failed after {attempt} attempts for template {template_vmid}: {e}"
                )
                break

        # Mark container as failed
        container.state = ContainerState.FAILED
        container.error = str(last_error)

        # Clean up the failed VMID
        try:
            await self.pve.delete_container(vmid)
        except Exception:
            pass  # Best effort cleanup

        self._used_vmids.discard(vmid)

        raise last_error  # type: ignore

    async def _replenish_worker(self):
        """Background worker that maintains pool levels"""
        logger.info("Replenish worker started")

        while True:
            try:
                await asyncio.sleep(self.config.replenish_interval_seconds)

                async with self._pool_lock:
                    templates = list(self.pools.keys())

                for template_vmid in templates:
                    await self._replenish_template(template_vmid)

            except asyncio.CancelledError:
                logger.info("Replenish worker cancelled")
                break
            except Exception as e:
                logger.error(f"Replenish worker error: {e}")
                await asyncio.sleep(5)

    async def _replenish_template(self, template_vmid: int):
        """Replenish pool for a specific template"""
        async with self._pool_lock:
            pool = self.pools.get(template_vmid, [])
            ready_count = sum(1 for c in pool if c.state == ContainerState.READY)
            creating_count = sum(1 for c in pool if c.state == ContainerState.CREATING)

        target = self.config.pool_target_size
        current = ready_count + creating_count

        if current < target:
            needed = min(
                target - current,
                self.config.replenish_batch_size,
            )

            logger.info(
                f"Replenishing template {template_vmid}: need {needed} more (ready={ready_count}, creating={creating_count}, target={target})"
            )

            for _ in range(needed):
                # Queue the clone request
                future: asyncio.Future[PooledContainer] = asyncio.Future()
                await self._clone_queue.put((template_vmid, future))

    async def ensure_pool_for_template(self, template_vmid: int):
        """Ensure a pool exists for a template and trigger initial fill"""
        async with self._pool_lock:
            if template_vmid not in self.pools:
                self.pools[template_vmid] = []
                logger.info(f"Created new pool for template {template_vmid}")

        # Trigger replenishment
        await self._replenish_template(template_vmid)

    async def allocate(
        self,
        template_vmid: int,
        instance_id: str | None = None,
    ) -> tuple[PooledContainer, bool]:
        """
        Allocate a container from the pool.

        Returns: (container, from_pool) - from_pool is True if instant allocation
        """
        # Ensure pool exists for this template
        await self.ensure_pool_for_template(template_vmid)

        # Try to allocate from pool
        async with self._pool_lock:
            pool = self.pools.get(template_vmid, [])
            ready_containers = [c for c in pool if c.state == ContainerState.READY]

            if ready_containers:
                # Allocate the oldest ready container (FIFO)
                container = ready_containers[0]
                container.state = ContainerState.ALLOCATED
                container.allocated_at = datetime.now(timezone.utc)
                container.allocated_to = instance_id

                logger.info(
                    f"Allocated container {container.hostname} (vmid={container.vmid}) from pool"
                )

                # Trigger replenishment in background
                asyncio.create_task(self._replenish_template(template_vmid))

                return container, True

        # No containers available, create on-demand (queued)
        logger.warning(
            f"Pool empty for template {template_vmid}, creating on-demand"
        )

        future: asyncio.Future[PooledContainer] = asyncio.Future()
        await self._clone_queue.put((template_vmid, future))

        container = await future
        container.state = ContainerState.ALLOCATED
        container.allocated_at = datetime.now(timezone.utc)
        container.allocated_to = instance_id

        return container, False

    async def release(self, vmid: int):
        """Release a container back to the pool (stop and reset)"""
        async with self._pool_lock:
            for pool in self.pools.values():
                for container in pool:
                    if container.vmid == vmid:
                        logger.info(f"Releasing container {container.hostname}")

                        try:
                            # Stop the container
                            upid = await self.pve.stop_container(vmid)
                            await self.pve.wait_for_task(upid)

                            # Mark as ready again
                            container.state = ContainerState.READY
                            container.allocated_at = None
                            container.allocated_to = None

                            logger.info(
                                f"Container {container.hostname} released back to pool"
                            )
                        except Exception as e:
                            logger.error(
                                f"Failed to release container {container.hostname}: {e}"
                            )
                            container.state = ContainerState.FAILED
                            container.error = str(e)

                        return

        logger.warning(f"Container vmid={vmid} not found in pool")

    async def remove(self, vmid: int):
        """Remove a container from the pool entirely"""
        async with self._pool_lock:
            for template_vmid, pool in self.pools.items():
                for i, container in enumerate(pool):
                    if container.vmid == vmid:
                        logger.info(
                            f"Removing container {container.hostname} from pool"
                        )

                        try:
                            # Delete the container
                            upid = await self.pve.delete_container(vmid)
                            await self.pve.wait_for_task(upid)
                        except Exception as e:
                            logger.error(
                                f"Failed to delete container {container.hostname}: {e}"
                            )

                        # Remove from pool
                        pool.pop(i)
                        self._used_vmids.discard(vmid)
                        return

        logger.warning(f"Container vmid={vmid} not found in pool")

    def get_status(self) -> PoolStatus:
        """Get current pool status"""
        templates: dict[int, TemplatePoolStatus] = {}
        total_ready = 0
        total_allocated = 0
        total_creating = 0

        for template_vmid, pool in self.pools.items():
            ready = [c for c in pool if c.state == ContainerState.READY]
            allocated = [c for c in pool if c.state == ContainerState.ALLOCATED]
            creating = [c for c in pool if c.state == ContainerState.CREATING]

            templates[template_vmid] = TemplatePoolStatus(
                template_vmid=template_vmid,
                ready_count=len(ready),
                allocated_count=len(allocated),
                creating_count=len(creating),
                target_size=self.config.pool_target_size,
                containers=[
                    {
                        "vmid": c.vmid,
                        "hostname": c.hostname,
                        "state": c.state.value,
                        "created_at": c.created_at.isoformat(),
                        "allocated_to": c.allocated_to,
                    }
                    for c in pool
                ],
            )

            total_ready += len(ready)
            total_allocated += len(allocated)
            total_creating += len(creating)

        return PoolStatus(
            templates=templates,
            total_ready=total_ready,
            total_allocated=total_allocated,
            total_creating=total_creating,
            clone_queue_length=self._clone_queue.qsize(),
        )


# =============================================================================
# FastAPI Application
# =============================================================================

# Global instances
config: PoolConfig | None = None
pool_manager: PoolManager | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global config, pool_manager

    config = PoolConfig()

    if not config.pve_api_url or not config.pve_api_token:
        logger.error("PVE_API_URL and PVE_API_TOKEN must be set")
        raise RuntimeError("Missing PVE configuration")

    pve = PveClient(config)
    pool_manager = PoolManager(config, pve)

    await pool_manager.start()

    yield

    await pool_manager.stop()


app = FastAPI(
    title="PVE Sandbox Pool Service",
    description="Pre-creates and manages a pool of LXC containers for fast allocation",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/status", response_model=PoolStatus)
async def get_status():
    """Get pool status"""
    if not pool_manager:
        raise HTTPException(status_code=503, detail="Pool manager not initialized")
    return pool_manager.get_status()


@app.post("/allocate", response_model=AllocateResponse)
async def allocate_container(
    request: AllocateRequest,
    background_tasks: BackgroundTasks,
    start: bool = Query(default=True, description="Start the container after allocation"),
):
    """
    Allocate a container from the pool.

    If a container is available in the pool, it's returned immediately.
    Otherwise, a new container is created on-demand (may take longer).
    """
    if not pool_manager:
        raise HTTPException(status_code=503, detail="Pool manager not initialized")

    instance_id = request.instance_id or f"pvelxc-{secrets.token_hex(4)}"

    try:
        container, from_pool = await pool_manager.allocate(
            template_vmid=request.template_vmid,
            instance_id=instance_id,
        )

        # Rename hostname to match instance_id
        if container.hostname != instance_id:
            try:
                await pool_manager.pve.set_container_hostname(container.vmid, instance_id)
                container.hostname = instance_id
            except Exception as e:
                logger.warning(f"Failed to rename container to {instance_id}: {e}")

        # Start the container if requested
        if start:
            upid = await pool_manager.pve.start_container(container.vmid)
            await pool_manager.pve.wait_for_task(upid)

        return AllocateResponse(
            vmid=container.vmid,
            hostname=container.hostname,
            instance_id=instance_id,
            template_vmid=request.template_vmid,
            allocated_from_pool=from_pool,
        )

    except Exception as e:
        logger.error(f"Allocation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/release/{vmid}")
async def release_container(vmid: int):
    """Release a container back to the pool"""
    if not pool_manager:
        raise HTTPException(status_code=503, detail="Pool manager not initialized")

    await pool_manager.release(vmid)
    return {"status": "released", "vmid": vmid}


@app.delete("/containers/{vmid}")
async def remove_container(vmid: int):
    """Remove a container from the pool entirely"""
    if not pool_manager:
        raise HTTPException(status_code=503, detail="Pool manager not initialized")

    await pool_manager.remove(vmid)
    return {"status": "removed", "vmid": vmid}


@app.post("/warm/{template_vmid}")
async def warm_pool(
    template_vmid: int,
    count: int = Query(default=None, description="Number of containers to create"),
):
    """Pre-warm the pool for a specific template"""
    if not pool_manager:
        raise HTTPException(status_code=503, detail="Pool manager not initialized")

    await pool_manager.ensure_pool_for_template(template_vmid)

    target = count or pool_manager.config.pool_target_size
    status = pool_manager.get_status()
    template_status = status.templates.get(template_vmid)

    current = 0
    if template_status:
        current = template_status.ready_count + template_status.creating_count

    needed = max(0, target - current)

    # Queue additional clones if needed
    for _ in range(needed):
        future: asyncio.Future[PooledContainer] = asyncio.Future()
        await pool_manager._clone_queue.put((template_vmid, future))

    return {
        "status": "warming",
        "template_vmid": template_vmid,
        "queued": needed,
        "current": current,
        "target": target,
    }


# =============================================================================
# Main
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "pool_service:app",
        host="0.0.0.0",
        port=8007,
        log_level="info",
    )
