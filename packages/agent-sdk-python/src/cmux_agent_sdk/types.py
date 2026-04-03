"""Type definitions for cmux unified agent SDK."""

import re
from datetime import datetime
from enum import Enum
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, field_validator


class AgentBackend(str, Enum):
    """Supported agent backends."""

    CLAUDE = "claude"
    CODEX = "codex"
    GEMINI = "gemini"
    AMP = "amp"
    OPENCODE = "opencode"


class SandboxProvider(str, Enum):
    """Sandbox provider options for cmux remote execution."""

    PVE_LXC = "pve-lxc"
    MORPH = "morph"
    E2B = "e2b"
    MODAL = "modal"
    LOCAL = "local"


class PermissionMode(str, Enum):
    """Claude Code permission modes for tool use."""

    DEFAULT = "default"
    ACCEPT_EDITS = "acceptEdits"
    BYPASS_PERMISSIONS = "bypassPermissions"
    PLAN = "plan"
    DELEGATE = "delegate"
    DONT_ASK = "dontAsk"


class SettingSource(str, Enum):
    """Claude Code setting sources to load."""

    USER = "user"
    PROJECT = "project"
    LOCAL = "local"


class SystemPromptPreset(BaseModel):
    """Use a named system prompt preset."""

    type: Literal["preset"] = "preset"
    preset: str = Field(description="Preset name (e.g. 'claude_code', 'minimal', 'custom')")


class SystemPromptCustom(BaseModel):
    """Use a custom system prompt string."""

    type: Literal["custom"] = "custom"
    content: str = Field(description="Full system prompt content")


SystemPromptConfig = Annotated[
    Union[SystemPromptPreset, SystemPromptCustom],
    Field(discriminator="type"),
]


# Agent ID pattern: backend/model
AGENT_ID_PATTERN = re.compile(r"^(claude|codex|gemini|amp|opencode)/[\w.-]+$")


def parse_agent_id(agent_id: str) -> tuple[AgentBackend, str]:
    """Parse agent ID into backend and model.

    Args:
        agent_id: Agent ID in format "backend/model"

    Returns:
        Tuple of (backend, model)

    Raises:
        ValueError: If agent ID format is invalid
    """
    if not AGENT_ID_PATTERN.match(agent_id):
        raise ValueError(
            f"Invalid agent ID: {agent_id}. Must be in format: backend/model "
            "(e.g., claude/opus-4.5)"
        )
    backend_str, model = agent_id.split("/", 1)
    return AgentBackend(backend_str), model


class SandboxConfig(BaseModel):
    """Sandbox configuration for routing agent execution."""

    provider: SandboxProvider = Field(
        default=SandboxProvider.PVE_LXC,
        description="Sandbox provider to use",
    )
    repo: str | None = Field(
        default=None,
        description="GitHub repository in owner/repo format",
    )
    branch: str = Field(
        default="main",
        description="Branch to checkout",
    )
    snapshot_id: str | None = Field(
        default=None,
        description="Snapshot/template ID (provider-specific)",
    )
    work_dir: str = Field(
        default="/root/workspace",
        description="Working directory inside sandbox",
    )
    timeout_ms: int = Field(
        default=600000,
        description="Timeout in milliseconds (default: 10 minutes)",
    )
    env: dict[str, str] | None = Field(
        default=None,
        description="Environment variables to inject",
    )


class SpawnOptions(BaseModel):
    """Options for spawning an agent."""

    agent: str = Field(
        description='Agent to use (e.g., "claude/opus-4.5", "codex/gpt-5.4")',
    )
    prompt: str = Field(
        description="The prompt/task for the agent",
    )
    provider: SandboxProvider = Field(
        default=SandboxProvider.PVE_LXC,
        description="Sandbox provider",
    )
    repo: str | None = Field(
        default=None,
        description="GitHub repository in owner/repo format",
    )
    branch: str = Field(
        default="main",
        description="Branch to checkout",
    )
    snapshot_id: str | None = Field(
        default=None,
        description="Snapshot/template ID (provider-specific)",
    )
    work_dir: str = Field(
        default="/root/workspace",
        description="Working directory inside sandbox",
    )
    timeout_ms: int = Field(
        default=600000,
        description="Timeout in milliseconds",
    )
    env: dict[str, str] | None = Field(
        default=None,
        description="Environment variables to inject",
    )
    sync: bool = Field(
        default=True,
        description="Run in synchronous mode (wait for completion)",
    )
    devsh_path: str = Field(
        default="devsh",
        description="devsh CLI path",
    )
    api_base_url: str | None = Field(
        default=None,
        description="cmux API base URL",
    )
    auth_token: str | None = Field(
        default=None,
        description="cmux authentication token",
    )
    # Claude Agent SDK specific options (only used for claude/* agents)
    permission_mode: PermissionMode | None = Field(
        default=None,
        description="Claude permission mode for tool use",
    )
    setting_sources: list[SettingSource] | None = Field(
        default=None,
        description="Claude setting sources to load",
    )
    system_prompt: SystemPromptConfig | None = Field(
        default=None,
        description="Claude system prompt (preset or custom content)",
    )
    allowed_tools: list[str] | None = Field(
        default=None,
        description="List of allowed tools for Claude agents",
    )
    disallowed_tools: list[str] | None = Field(
        default=None,
        description="List of disallowed tools for Claude agents",
    )

    @field_validator("agent")
    @classmethod
    def validate_agent_id(cls, v: str) -> str:
        """Validate agent ID format."""
        if not AGENT_ID_PATTERN.match(v):
            raise ValueError(
                f"Invalid agent ID: {v}. Must be in format: backend/model "
                "(e.g., claude/opus-4.5)"
            )
        return v


class TaskHandle(BaseModel):
    """Task handle returned from spawn()."""

    id: str = Field(description="Unique task ID")
    agent: str = Field(description="Agent that was spawned")
    provider: SandboxProvider = Field(description="Provider where agent is running")
    instance_id: str | None = Field(default=None, description="Sandbox instance ID")
    session_id: str | None = Field(default=None, description="Session ID for resumption")
    status: Literal["pending", "running", "completed", "failed", "cancelled"] = Field(
        description="Status of the task"
    )
    created_at: datetime = Field(description="Creation timestamp")


class TaskResult(BaseModel):
    """Result from a completed task."""

    task_id: str = Field(description="Task ID")
    exit_code: int = Field(description="Exit code from execution")
    stdout: str = Field(description="Standard output")
    stderr: str = Field(description="Standard error")
    result: str = Field(description="Final result/response from agent")
    duration_ms: int = Field(description="Execution duration in milliseconds")
    session_id: str | None = Field(default=None, description="Session ID for resumption")
    checkpoint_ref: str | None = Field(default=None, description="Checkpoint reference")
    usage: "UsageStats | None" = Field(default=None, description="Usage statistics")


class ResumeOptions(BaseModel):
    """Options for resuming a task."""

    session_id: str = Field(description="Session ID from previous execution")
    message: str = Field(description="New message/prompt to continue with")
    provider: SandboxProvider | None = Field(
        default=None,
        description="Optional: migrate to different provider",
    )
    devsh_path: str = Field(default="devsh", description="devsh CLI path")


class CheckpointRef(BaseModel):
    """Checkpoint reference for saving/restoring state."""

    id: str = Field(description="Unique checkpoint ID")
    task_id: str = Field(description="Task ID this checkpoint belongs to")
    agent: str = Field(description="Agent that created this checkpoint")
    source_provider: SandboxProvider = Field(description="Provider where checkpoint was created")
    session_id: str = Field(description="Session ID for resumption")
    created_at: datetime = Field(description="Timestamp when checkpoint was created")
    resumable: bool = Field(description="Whether this checkpoint can be resumed")
    data: dict[str, object] | None = Field(
        default=None,
        description="Provider-specific checkpoint data",
    )


class CheckpointOptions(BaseModel):
    """Options for creating a checkpoint."""

    task_id: str = Field(description="Task ID to checkpoint")
    label: str | None = Field(default=None, description="Optional label for the checkpoint")
    devsh_path: str = Field(default="devsh", description="devsh CLI path")


class MigrateOptions(BaseModel):
    """Options for migrating a session to a different provider."""

    source: str = Field(description="Checkpoint reference or session ID to migrate from")
    target_provider: SandboxProvider = Field(description="Target provider to migrate to")
    repo: str | None = Field(default=None, description="Optional: new repo (if different)")
    branch: str | None = Field(default=None, description="Optional: new branch")
    message: str | None = Field(default=None, description="Optional: continuation message")
    devsh_path: str = Field(default="devsh", description="devsh CLI path")
    api_base_url: str | None = Field(default=None, description="cmux API base URL")
    auth_token: str | None = Field(default=None, description="cmux authentication token")


# Unified event types
class SpawnEvent(BaseModel):
    """Event emitted when agent spawns."""

    type: Literal["spawn"] = "spawn"
    task_id: str
    agent: str
    provider: SandboxProvider


class TextEvent(BaseModel):
    """Event with text content."""

    type: Literal["text"] = "text"
    content: str


class ToolUseEvent(BaseModel):
    """Event when tool is used."""

    type: Literal["tool_use"] = "tool_use"
    tool: str
    input: object


class ToolResultEvent(BaseModel):
    """Event with tool result."""

    type: Literal["tool_result"] = "tool_result"
    tool: str
    output: object


class ProgressEvent(BaseModel):
    """Progress update event."""

    type: Literal["progress"] = "progress"
    message: str
    percent: float | None = None


class CheckpointEvent(BaseModel):
    """Checkpoint created event."""

    type: Literal["checkpoint"] = "checkpoint"
    ref: str
    resumable: bool


class ErrorEvent(BaseModel):
    """Error event."""

    type: Literal["error"] = "error"
    code: str
    message: str


class DoneEvent(BaseModel):
    """Completion event."""

    type: Literal["done"] = "done"
    task_id: str
    result: TaskResult


UnifiedEvent = (
    SpawnEvent
    | TextEvent
    | ToolUseEvent
    | ToolResultEvent
    | ProgressEvent
    | CheckpointEvent
    | ErrorEvent
    | DoneEvent
)


class SpawnManyTaskConfig(BaseModel):
    """Configuration for a single task in parallel execution."""

    name: str | None = Field(default=None, description="Optional task name for identification")
    agent: str = Field(description="Agent to use")
    prompt: str = Field(description="The prompt/task for the agent")
    provider: SandboxProvider = Field(default=SandboxProvider.PVE_LXC, description="Sandbox provider")
    repo: str | None = Field(default=None, description="GitHub repository")
    branch: str = Field(default="main", description="Branch to checkout")
    timeout_ms: int = Field(default=600000, description="Timeout in milliseconds")
    env: dict[str, str] | None = Field(default=None, description="Environment variables")

    @field_validator("agent")
    @classmethod
    def validate_agent_id(cls, v: str) -> str:
        """Validate agent ID format."""
        if not AGENT_ID_PATTERN.match(v):
            raise ValueError(
                f"Invalid agent ID: {v}. Must be in format: backend/model "
                "(e.g., claude/opus-4.5)"
            )
        return v


class SpawnManyOptions(BaseModel):
    """Options for spawning multiple agents in parallel."""

    tasks: list[SpawnManyTaskConfig] = Field(description="Array of spawn configurations")
    concurrency: int | None = Field(default=None, description="Maximum concurrent tasks")
    fail_fast: bool = Field(default=False, description="Fail fast: stop all if one fails")
    devsh_path: str = Field(default="devsh", description="devsh CLI path")
    api_base_url: str | None = Field(default=None, description="cmux API base URL")
    auth_token: str | None = Field(default=None, description="cmux authentication token")


class ParallelTaskResult(BaseModel):
    """Result for a single task in parallel execution."""

    name: str | None = Field(default=None, description="Task name if provided")
    task_id: str = Field(description="Task ID")
    status: Literal["completed", "failed", "cancelled"] = Field(description="Task status")
    result: TaskResult | None = Field(default=None, description="Task result if completed")
    error: str | None = Field(default=None, description="Error message if failed")


class ParallelResult(BaseModel):
    """Result from parallel execution."""

    results: list[ParallelTaskResult] = Field(description="All task results")
    succeeded: int = Field(description="Number of successful tasks")
    failed: int = Field(description="Number of failed tasks")
    total_duration_ms: int = Field(description="Total duration in milliseconds")


class TokenUsage(BaseModel):
    """Token usage statistics from an agent execution."""

    input_tokens: int = Field(description="Input/prompt tokens")
    output_tokens: int = Field(description="Output/completion tokens")
    cache_read_tokens: int | None = Field(default=None, description="Cache read tokens")
    cache_write_tokens: int | None = Field(default=None, description="Cache write tokens")
    total_tokens: int = Field(description="Total tokens (input + output)")


class CostBreakdown(BaseModel):
    """Cost breakdown for an agent execution."""

    input_cost: float = Field(description="Input token cost in USD")
    output_cost: float = Field(description="Output token cost in USD")
    cache_cost: float | None = Field(default=None, description="Cache cost in USD")
    total_cost: float = Field(description="Total cost in USD")
    currency: Literal["USD"] = Field(default="USD", description="Cost currency")


class UsageStats(BaseModel):
    """Usage statistics for an agent execution."""

    tokens: TokenUsage = Field(description="Token usage breakdown")
    cost: CostBreakdown | None = Field(default=None, description="Cost breakdown")
    api_requests: int = Field(description="Number of API requests made")
    tool_calls: int = Field(description="Number of tool calls")
    duration_ms: int = Field(description="Execution duration in milliseconds")
    model: str = Field(description="Model used for execution")
    backend: AgentBackend = Field(description="Agent backend")


class ModelPricing(BaseModel):
    """Pricing per million tokens for a model."""

    input_per_million: float = Field(description="Input token price per million")
    output_per_million: float = Field(description="Output token price per million")
    cache_read_per_million: float | None = Field(default=None, description="Cache read price per million")
    cache_write_per_million: float | None = Field(default=None, description="Cache write price per million")


# Known model pricing (as of 2026-04)
MODEL_PRICING: dict[str, ModelPricing] = {
    # Claude models
    "claude-opus-4-6": ModelPricing(input_per_million=15, output_per_million=75, cache_read_per_million=1.5, cache_write_per_million=18.75),
    "claude-opus-4-5-20251101": ModelPricing(input_per_million=15, output_per_million=75, cache_read_per_million=1.5, cache_write_per_million=18.75),
    "claude-sonnet-4-6": ModelPricing(input_per_million=3, output_per_million=15, cache_read_per_million=0.3, cache_write_per_million=3.75),
    "claude-sonnet-4-5-20250929": ModelPricing(input_per_million=3, output_per_million=15, cache_read_per_million=0.3, cache_write_per_million=3.75),
    "claude-haiku-4-5-20251001": ModelPricing(input_per_million=0.8, output_per_million=4, cache_read_per_million=0.08, cache_write_per_million=1),
    # Codex/OpenAI models (approximate)
    "gpt-5.4": ModelPricing(input_per_million=10, output_per_million=30),
    "gpt-5.4-xhigh": ModelPricing(input_per_million=10, output_per_million=30),
    "gpt-5.1-codex": ModelPricing(input_per_million=2.5, output_per_million=10),
    "gpt-5.1-codex-mini": ModelPricing(input_per_million=0.15, output_per_million=0.6),
    # Gemini models (approximate)
    "2.5-pro": ModelPricing(input_per_million=1.25, output_per_million=5),
    "2.5-flash": ModelPricing(input_per_million=0.075, output_per_million=0.3),
}


def calculate_cost(tokens: TokenUsage, pricing: ModelPricing) -> CostBreakdown:
    """Calculate cost from token usage and pricing."""
    input_cost = (tokens.input_tokens / 1_000_000) * pricing.input_per_million
    output_cost = (tokens.output_tokens / 1_000_000) * pricing.output_per_million

    cache_cost: float | None = None
    if pricing.cache_read_per_million and tokens.cache_read_tokens:
        cache_cost = (tokens.cache_read_tokens / 1_000_000) * pricing.cache_read_per_million
    if pricing.cache_write_per_million and tokens.cache_write_tokens:
        cache_cost = (cache_cost or 0) + (tokens.cache_write_tokens / 1_000_000) * pricing.cache_write_per_million

    return CostBreakdown(
        input_cost=input_cost,
        output_cost=output_cost,
        cache_cost=cache_cost,
        total_cost=input_cost + output_cost + (cache_cost or 0),
        currency="USD",
    )


def get_model_pricing(model: str) -> ModelPricing | None:
    """Get pricing for a model, returns None if not found."""
    # Try exact match first
    if model in MODEL_PRICING:
        return MODEL_PRICING[model]

    # Try partial match
    normalized_model = model.lower().replace(".", "").replace("-", "")
    for key, pricing in MODEL_PRICING.items():
        normalized_key = key.lower().replace(".", "").replace("-", "")
        if normalized_key in normalized_model or normalized_model in normalized_key:
            return pricing

    return None
