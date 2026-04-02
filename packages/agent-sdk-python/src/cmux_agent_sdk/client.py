"""Client class for cmux unified agent SDK."""

import random
import string
import time
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from cmux_agent_sdk.executor import (
    check_devsh_available,
    execute_agent,
    execute_checkpoint,
    execute_migrate,
    execute_parallel,
    execute_resume,
)
from cmux_agent_sdk.types import (
    CheckpointEvent,
    CheckpointOptions,
    CheckpointRef,
    DoneEvent,
    MigrateOptions,
    ParallelResult,
    ResumeOptions,
    SandboxProvider,
    SpawnEvent,
    SpawnManyOptions,
    SpawnManyTaskConfig,
    SpawnOptions,
    TaskHandle,
    TaskResult,
    TextEvent,
    UnifiedEvent,
)


def _generate_task_id() -> str:
    """Generate a unique task ID."""
    timestamp = int(time.time() * 1000)
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"task_{timestamp}_{suffix}"


class CmuxClient:
    """cmux Unified Agent SDK Client.

    Provides a unified interface for spawning and managing agents
    across multiple backends (Claude, Codex, Gemini, Amp, Opencode)
    and providers (PVE-LXC, Morph, E2B, Modal, Local).
    """

    def __init__(
        self,
        *,
        devsh_path: str = "devsh",
        api_base_url: str | None = None,
        auth_token: str | None = None,
    ) -> None:
        """Initialize cmux client.

        Args:
            devsh_path: Path to devsh CLI
            api_base_url: cmux API base URL
            auth_token: cmux authentication token
        """
        self.devsh_path = devsh_path
        self.api_base_url = api_base_url
        self.auth_token = auth_token
        self._active_tasks: dict[str, TaskHandle] = {}

    async def spawn(
        self,
        agent: str,
        prompt: str,
        **kwargs: object,
    ) -> TaskHandle:
        """Spawn an agent in a sandbox.

        Args:
            agent: Agent to use (e.g., "claude/opus-4.5", "codex/gpt-5.4")
            prompt: The prompt/task for the agent
            **kwargs: Additional spawn options

        Returns:
            TaskHandle with task information

        Example:
            >>> task = await client.spawn(
            ...     agent="claude/opus-4.5",
            ...     prompt="Refactor the auth module",
            ...     provider="pve-lxc",
            ...     repo="owner/repo",
            ... )
        """
        task_id = _generate_task_id()

        options = SpawnOptions(
            agent=agent,
            prompt=prompt,
            devsh_path=kwargs.get("devsh_path", self.devsh_path),  # type: ignore[arg-type]
            api_base_url=kwargs.get("api_base_url", self.api_base_url),  # type: ignore[arg-type]
            auth_token=kwargs.get("auth_token", self.auth_token),  # type: ignore[arg-type]
            **{k: v for k, v in kwargs.items() if k not in ("devsh_path", "api_base_url", "auth_token")},  # type: ignore[arg-type]
        )

        handle = TaskHandle(
            id=task_id,
            agent=agent,
            provider=options.provider,
            status="pending",
            created_at=datetime.now(timezone.utc),
        )

        self._active_tasks[task_id] = handle

        # Execute and wait for result
        handle.status = "running"

        try:
            result = await execute_agent(options)
            handle.status = "completed" if result.exit_code == 0 else "failed"
            handle.session_id = result.session_id
            return handle
        except Exception:
            handle.status = "failed"
            raise

    async def stream(
        self,
        agent: str,
        prompt: str,
        **kwargs: object,
    ) -> AsyncGenerator[UnifiedEvent, None]:
        """Stream events from an agent execution.

        Args:
            agent: Agent to use (e.g., "claude/opus-4.5", "codex/gpt-5.4")
            prompt: The prompt/task for the agent
            **kwargs: Additional spawn options

        Yields:
            UnifiedEvent objects representing the execution flow

        Example:
            >>> async for event in client.stream(
            ...     agent="codex/gpt-5.4",
            ...     prompt="Fix the bug",
            ...     provider="morph",
            ... ):
            ...     match event.type:
            ...         case "text": print(event.content)
            ...         case "done": print(event.result)
        """
        task_id = _generate_task_id()

        options = SpawnOptions(
            agent=agent,
            prompt=prompt,
            devsh_path=kwargs.get("devsh_path", self.devsh_path),  # type: ignore[arg-type]
            api_base_url=kwargs.get("api_base_url", self.api_base_url),  # type: ignore[arg-type]
            auth_token=kwargs.get("auth_token", self.auth_token),  # type: ignore[arg-type]
            **{k: v for k, v in kwargs.items() if k not in ("devsh_path", "api_base_url", "auth_token")},  # type: ignore[arg-type]
        )

        # Emit spawn event
        yield SpawnEvent(
            task_id=task_id,
            agent=agent,
            provider=options.provider,
        )

        # Execute agent
        result = await execute_agent(options)

        # Emit result text if available
        if result.result:
            yield TextEvent(content=result.result)

        # Emit checkpoint if session ID available
        if result.session_id:
            yield CheckpointEvent(
                ref=result.session_id,
                resumable=True,
            )

        # Emit done event
        yield DoneEvent(
            task_id=task_id,
            result=result,
        )

    async def resume(
        self,
        session_id: str,
        message: str,
        **kwargs: object,
    ) -> TaskResult:
        """Resume a previous session with a new message.

        Args:
            session_id: Session ID from previous execution
            message: New message/prompt to continue with
            **kwargs: Additional resume options

        Returns:
            TaskResult with execution details

        Example:
            >>> result = await client.resume(
            ...     session_id=task.session_id,
            ...     message="Now add tests for it",
            ... )
        """
        options = ResumeOptions(
            session_id=session_id,
            message=message,
            devsh_path=kwargs.get("devsh_path", self.devsh_path),  # type: ignore[arg-type]
            **{k: v for k, v in kwargs.items() if k != "devsh_path"},  # type: ignore[arg-type]
        )

        return await execute_resume(options)

    def get_task(self, task_id: str) -> TaskHandle | None:
        """Get a task handle by ID."""
        return self._active_tasks.get(task_id)

    def list_tasks(self) -> list[TaskHandle]:
        """List all active tasks."""
        return list(self._active_tasks.values())

    async def check_availability(self) -> dict[str, object]:
        """Check if devsh CLI is available.

        Returns:
            Dict with available, version, and error keys
        """
        result = await check_devsh_available(self.devsh_path)
        return {
            "available": result.available,
            "version": result.version,
            "error": result.error,
        }

    async def checkpoint(
        self,
        task_id: str,
        **kwargs: object,
    ) -> CheckpointRef | None:
        """Create a checkpoint for a task.

        Checkpoints capture session state and can be used to:
        - Resume the session later
        - Migrate the session to a different provider

        Args:
            task_id: Task ID to checkpoint
            **kwargs: Additional options (label, devsh_path)

        Returns:
            CheckpointRef if successful, None otherwise

        Example:
            >>> checkpoint = await client.checkpoint(task.id)
            >>> if checkpoint:
            ...     print(f"Checkpoint created: {checkpoint.id}")
        """
        options = CheckpointOptions(
            task_id=task_id,
            devsh_path=kwargs.get("devsh_path", self.devsh_path),  # type: ignore[arg-type]
            **{k: v for k, v in kwargs.items() if k != "devsh_path"},  # type: ignore[arg-type]
        )

        return await execute_checkpoint(options)

    async def migrate(
        self,
        source: str,
        target_provider: SandboxProvider | str,
        **kwargs: object,
    ) -> TaskResult:
        """Migrate a session to a different provider.

        This allows moving a running or checkpointed session from one
        sandbox provider to another (e.g., from pve-lxc to morph).

        Args:
            source: Session ID or checkpoint reference to migrate from
            target_provider: Target provider to migrate to
            **kwargs: Additional options (repo, branch, message)

        Returns:
            TaskResult with execution details

        Example:
            >>> result = await client.migrate(
            ...     source=task.session_id,
            ...     target_provider="morph",
            ...     message="Continue the work",
            ... )
        """
        if isinstance(target_provider, str):
            target_provider = SandboxProvider(target_provider)

        options = MigrateOptions(
            source=source,
            target_provider=target_provider,
            devsh_path=kwargs.get("devsh_path", self.devsh_path),  # type: ignore[arg-type]
            api_base_url=kwargs.get("api_base_url", self.api_base_url),  # type: ignore[arg-type]
            auth_token=kwargs.get("auth_token", self.auth_token),  # type: ignore[arg-type]
            **{k: v for k, v in kwargs.items() if k not in ("devsh_path", "api_base_url", "auth_token")},  # type: ignore[arg-type]
        )

        return await execute_migrate(options)

    def get_providers(self) -> list[SandboxProvider]:
        """List available providers."""
        return list(SandboxProvider)

    async def spawn_many(
        self,
        tasks: list[SpawnManyTaskConfig],
        **kwargs: object,
    ) -> ParallelResult:
        """Spawn multiple agents in parallel with concurrency control.

        Args:
            tasks: List of task configurations
            **kwargs: Additional options (concurrency, fail_fast, devsh_path, etc.)

        Returns:
            ParallelResult with all task results

        Example:
            >>> from cmux_agent_sdk import SpawnManyTaskConfig
            >>> results = await client.spawn_many(
            ...     tasks=[
            ...         SpawnManyTaskConfig(agent="claude/opus-4.5", prompt="Refactor auth"),
            ...         SpawnManyTaskConfig(agent="codex/gpt-5.4", prompt="Add tests"),
            ...         SpawnManyTaskConfig(agent="gemini/2.5-pro", prompt="Update docs"),
            ...     ],
            ...     concurrency=2,  # Max 2 agents at once
            ...     fail_fast=False,  # Continue even if one fails
            ... )
            >>> print(f"Succeeded: {results.succeeded}, Failed: {results.failed}")
        """
        options = SpawnManyOptions(
            tasks=tasks,
            devsh_path=kwargs.get("devsh_path", self.devsh_path),  # type: ignore[arg-type]
            api_base_url=kwargs.get("api_base_url", self.api_base_url),  # type: ignore[arg-type]
            auth_token=kwargs.get("auth_token", self.auth_token),  # type: ignore[arg-type]
            **{k: v for k, v in kwargs.items() if k not in ("devsh_path", "api_base_url", "auth_token")},  # type: ignore[arg-type]
        )

        return await execute_parallel(options)


def create_client(
    *,
    devsh_path: str = "devsh",
    api_base_url: str | None = None,
    auth_token: str | None = None,
) -> CmuxClient:
    """Create a new cmux client instance.

    Args:
        devsh_path: Path to devsh CLI
        api_base_url: cmux API base URL
        auth_token: cmux authentication token

    Returns:
        CmuxClient instance
    """
    return CmuxClient(
        devsh_path=devsh_path,
        api_base_url=api_base_url,
        auth_token=auth_token,
    )
