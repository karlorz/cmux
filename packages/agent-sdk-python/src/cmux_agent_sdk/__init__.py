"""
cmux-agent-sdk - Unified Agent SDK for cmux

Spawn Claude, Codex, Gemini, Amp, and Opencode agents in remote sandboxes.

Example:
    >>> from cmux_agent_sdk import create_client
    >>>
    >>> client = create_client()
    >>>
    >>> # Spawn an agent
    >>> task = await client.spawn(
    ...     agent="claude/opus-4.5",
    ...     prompt="Refactor the auth module",
    ...     provider="pve-lxc",
    ...     repo="owner/repo",
    ... )
    >>>
    >>> # Stream events
    >>> async for event in client.stream(
    ...     agent="codex/gpt-5.4",
    ...     prompt="Fix the bug",
    ... ):
    ...     match event.type:
    ...         case "text": print(event.content)
    ...         case "done": print(event.result)
"""

from cmux_agent_sdk.types import (
    # Enums
    AgentBackend,
    SandboxProvider,
    PermissionMode,
    SettingSource,
    # Config types
    SandboxConfig,
    SpawnOptions,
    SystemPromptPreset,
    SystemPromptCustom,
    SystemPromptConfig,
    ResumeOptions,
    CheckpointOptions,
    MigrateOptions,
    SpawnManyOptions,
    SpawnManyTaskConfig,
    # Result types
    TaskHandle,
    TaskResult,
    CheckpointRef,
    ParallelResult,
    ParallelTaskResult,
    # Usage/cost types
    TokenUsage,
    CostBreakdown,
    UsageStats,
    ModelPricing,
    MODEL_PRICING,
    # Event types
    SpawnEvent,
    TextEvent,
    ToolUseEvent,
    ToolResultEvent,
    ProgressEvent,
    CheckpointEvent,
    ErrorEvent,
    DoneEvent,
    UnifiedEvent,
    # Helpers
    parse_agent_id,
    calculate_cost,
    get_model_pricing,
)
from cmux_agent_sdk.client import (
    CmuxClient,
    create_client,
)
from cmux_agent_sdk.executor import (
    execute_agent,
    execute_resume,
    execute_checkpoint,
    execute_migrate,
    execute_parallel,
    check_devsh_available,
    get_supported_providers,
    get_supported_backends,
)

__version__ = "0.1.0"

__all__ = [
    # Enums
    "AgentBackend",
    "SandboxProvider",
    "PermissionMode",
    "SettingSource",
    # Config types
    "SandboxConfig",
    "SpawnOptions",
    "SystemPromptPreset",
    "SystemPromptCustom",
    "SystemPromptConfig",
    "ResumeOptions",
    "CheckpointOptions",
    "MigrateOptions",
    "SpawnManyOptions",
    "SpawnManyTaskConfig",
    # Result types
    "TaskHandle",
    "TaskResult",
    "CheckpointRef",
    "ParallelResult",
    "ParallelTaskResult",
    # Usage/cost types
    "TokenUsage",
    "CostBreakdown",
    "UsageStats",
    "ModelPricing",
    "MODEL_PRICING",
    # Event types
    "SpawnEvent",
    "TextEvent",
    "ToolUseEvent",
    "ToolResultEvent",
    "ProgressEvent",
    "CheckpointEvent",
    "ErrorEvent",
    "DoneEvent",
    "UnifiedEvent",
    # Helpers
    "parse_agent_id",
    "calculate_cost",
    "get_model_pricing",
    # Client
    "CmuxClient",
    "create_client",
    # Executor
    "execute_agent",
    "execute_resume",
    "execute_checkpoint",
    "execute_migrate",
    "execute_parallel",
    "check_devsh_available",
    "get_supported_providers",
    "get_supported_backends",
]


# Convenience functions using default client
_default_client: CmuxClient | None = None


def _get_default_client() -> CmuxClient:
    """Get or create the default client."""
    global _default_client
    if _default_client is None:
        _default_client = CmuxClient()
    return _default_client


async def spawn(agent: str, prompt: str, **kwargs: object) -> TaskHandle:
    """Spawn an agent (uses default client)."""
    return await _get_default_client().spawn(agent, prompt, **kwargs)


async def stream(agent: str, prompt: str, **kwargs: object):
    """Stream events from agent execution (uses default client)."""
    async for event in _get_default_client().stream(agent, prompt, **kwargs):
        yield event


async def resume(session_id: str, message: str, **kwargs: object) -> TaskResult:
    """Resume a previous session (uses default client)."""
    return await _get_default_client().resume(session_id, message, **kwargs)


async def checkpoint(task_id: str, **kwargs: object) -> CheckpointRef | None:
    """Create a checkpoint (uses default client)."""
    return await _get_default_client().checkpoint(task_id, **kwargs)


async def migrate(
    source: str, target_provider: SandboxProvider | str, **kwargs: object
) -> TaskResult:
    """Migrate a session to a different provider (uses default client)."""
    return await _get_default_client().migrate(source, target_provider, **kwargs)


async def spawn_many(tasks: list[SpawnManyTaskConfig], **kwargs: object) -> ParallelResult:
    """Spawn multiple agents in parallel (uses default client)."""
    return await _get_default_client().spawn_many(tasks, **kwargs)
