"""Tests for type definitions."""

import pytest
from pydantic import ValidationError

from cmux_agent_sdk.types import (
    AgentBackend,
    CheckpointOptions,
    CostBreakdown,
    MigrateOptions,
    ModelPricing,
    MODEL_PRICING,
    ParallelResult,
    ParallelTaskResult,
    PermissionMode,
    SandboxProvider,
    SettingSource,
    SpawnManyOptions,
    SpawnManyTaskConfig,
    SpawnOptions,
    SystemPromptCustom,
    SystemPromptPreset,
    TaskResult,
    TokenUsage,
    UsageStats,
    calculate_cost,
    get_model_pricing,
    parse_agent_id,
)


class TestParseAgentId:
    """Tests for parse_agent_id function."""

    def test_valid_claude_agent(self):
        backend, model = parse_agent_id("claude/opus-4.5")
        assert backend == AgentBackend.CLAUDE
        assert model == "opus-4.5"

    def test_valid_codex_agent(self):
        backend, model = parse_agent_id("codex/gpt-5.4-xhigh")
        assert backend == AgentBackend.CODEX
        assert model == "gpt-5.4-xhigh"

    def test_valid_gemini_agent(self):
        backend, model = parse_agent_id("gemini/2.5-pro")
        assert backend == AgentBackend.GEMINI
        assert model == "2.5-pro"

    def test_invalid_format_no_slash(self):
        with pytest.raises(ValueError, match="Invalid agent ID"):
            parse_agent_id("invalid")

    def test_invalid_backend(self):
        with pytest.raises(ValueError, match="Invalid agent ID"):
            parse_agent_id("unknown/model")

    def test_invalid_empty_model(self):
        with pytest.raises(ValueError, match="Invalid agent ID"):
            parse_agent_id("claude/")


class TestSandboxProvider:
    """Tests for SandboxProvider enum."""

    def test_all_providers(self):
        assert SandboxProvider.PVE_LXC.value == "pve-lxc"
        assert SandboxProvider.MORPH.value == "morph"
        assert SandboxProvider.E2B.value == "e2b"
        assert SandboxProvider.MODAL.value == "modal"
        assert SandboxProvider.LOCAL.value == "local"


class TestSpawnOptions:
    """Tests for SpawnOptions model."""

    def test_minimal_options(self):
        options = SpawnOptions(agent="claude/opus-4.5", prompt="Test prompt")
        assert options.agent == "claude/opus-4.5"
        assert options.prompt == "Test prompt"
        assert options.provider == SandboxProvider.PVE_LXC
        assert options.branch == "main"
        assert options.work_dir == "/root/workspace"
        assert options.timeout_ms == 600000
        assert options.sync is True
        assert options.devsh_path == "devsh"

    def test_full_options(self):
        options = SpawnOptions(
            agent="codex/gpt-5.4",
            prompt="Test prompt",
            provider=SandboxProvider.MORPH,
            repo="owner/repo",
            branch="feature/test",
            snapshot_id="snap-123",
            work_dir="/custom/path",
            timeout_ms=300000,
            env={"KEY": "value"},
            sync=False,
            devsh_path="/usr/local/bin/devsh",
            api_base_url="https://api.example.com",
            auth_token="token123",
        )
        assert options.provider == SandboxProvider.MORPH
        assert options.repo == "owner/repo"
        assert options.branch == "feature/test"
        assert options.snapshot_id == "snap-123"
        assert options.work_dir == "/custom/path"
        assert options.timeout_ms == 300000
        assert options.env == {"KEY": "value"}
        assert options.sync is False
        assert options.devsh_path == "/usr/local/bin/devsh"
        assert options.api_base_url == "https://api.example.com"
        assert options.auth_token == "token123"

    def test_invalid_agent_id(self):
        with pytest.raises(ValidationError):
            SpawnOptions(agent="invalid", prompt="Test")

    def test_invalid_agent_backend(self):
        with pytest.raises(ValidationError):
            SpawnOptions(agent="unknown/model", prompt="Test")


class TestPermissionMode:
    """Tests for PermissionMode enum."""

    def test_all_modes(self):
        assert PermissionMode.DEFAULT == "default"
        assert PermissionMode.ACCEPT_EDITS == "acceptEdits"
        assert PermissionMode.BYPASS_PERMISSIONS == "bypassPermissions"
        assert PermissionMode.PLAN == "plan"
        assert PermissionMode.DELEGATE == "delegate"
        assert PermissionMode.DONT_ASK == "dontAsk"

    def test_spawn_with_permission_mode(self):
        options = SpawnOptions(
            agent="claude/opus-4.5",
            prompt="Test",
            permission_mode=PermissionMode.ACCEPT_EDITS,
        )
        assert options.permission_mode == PermissionMode.ACCEPT_EDITS

    def test_spawn_permission_mode_string(self):
        options = SpawnOptions(
            agent="claude/opus-4.5",
            prompt="Test",
            permission_mode="bypassPermissions",
        )
        assert options.permission_mode == PermissionMode.BYPASS_PERMISSIONS

    def test_spawn_invalid_permission_mode(self):
        with pytest.raises(ValidationError):
            SpawnOptions(agent="claude/opus-4.5", prompt="Test", permission_mode="invalid")


class TestSettingSource:
    """Tests for SettingSource enum."""

    def test_all_sources(self):
        assert SettingSource.USER == "user"
        assert SettingSource.PROJECT == "project"
        assert SettingSource.LOCAL == "local"

    def test_spawn_with_setting_sources(self):
        options = SpawnOptions(
            agent="claude/opus-4.5",
            prompt="Test",
            setting_sources=[SettingSource.USER, SettingSource.PROJECT],
        )
        assert options.setting_sources == [SettingSource.USER, SettingSource.PROJECT]


class TestSystemPromptConfig:
    """Tests for SystemPromptConfig discriminated union."""

    def test_preset_system_prompt(self):
        sp = SystemPromptPreset(preset="claude_code")
        assert sp.type == "preset"
        assert sp.preset == "claude_code"

    def test_custom_system_prompt(self):
        sp = SystemPromptCustom(content="You are a code reviewer.")
        assert sp.type == "custom"
        assert sp.content == "You are a code reviewer."

    def test_spawn_with_preset_prompt(self):
        options = SpawnOptions(
            agent="claude/opus-4.5",
            prompt="Test",
            system_prompt={"type": "preset", "preset": "minimal"},
        )
        assert isinstance(options.system_prompt, SystemPromptPreset)
        assert options.system_prompt.preset == "minimal"

    def test_spawn_with_custom_prompt(self):
        options = SpawnOptions(
            agent="claude/opus-4.5",
            prompt="Test",
            system_prompt={"type": "custom", "content": "You are an expert."},
        )
        assert isinstance(options.system_prompt, SystemPromptCustom)
        assert options.system_prompt.content == "You are an expert."


class TestClaudeAgentSdkOptions:
    """Tests for Claude Agent SDK options in SpawnOptions."""

    def test_allowed_tools(self):
        options = SpawnOptions(
            agent="claude/opus-4.5",
            prompt="Test",
            allowed_tools=["Read", "Write", "Bash"],
        )
        assert options.allowed_tools == ["Read", "Write", "Bash"]

    def test_disallowed_tools(self):
        options = SpawnOptions(
            agent="claude/opus-4.5",
            prompt="Test",
            disallowed_tools=["Bash"],
        )
        assert options.disallowed_tools == ["Bash"]

    def test_all_claude_sdk_options(self):
        options = SpawnOptions(
            agent="claude/opus-4.5",
            prompt="Test",
            permission_mode=PermissionMode.ACCEPT_EDITS,
            setting_sources=[SettingSource.USER, SettingSource.PROJECT],
            system_prompt={"type": "preset", "preset": "claude_code"},
            allowed_tools=["Read", "Write"],
            disallowed_tools=["Bash"],
        )
        assert options.permission_mode == PermissionMode.ACCEPT_EDITS
        assert options.setting_sources == [SettingSource.USER, SettingSource.PROJECT]
        assert isinstance(options.system_prompt, SystemPromptPreset)
        assert options.allowed_tools == ["Read", "Write"]
        assert options.disallowed_tools == ["Bash"]

    def test_claude_sdk_options_default_none(self):
        options = SpawnOptions(agent="codex/gpt-5.4", prompt="Test")
        assert options.permission_mode is None
        assert options.setting_sources is None
        assert options.system_prompt is None
        assert options.allowed_tools is None
        assert options.disallowed_tools is None


class TestCheckpointOptions:
    """Tests for CheckpointOptions model."""

    def test_minimal_options(self):
        options = CheckpointOptions(task_id="task_123")
        assert options.task_id == "task_123"
        assert options.devsh_path == "devsh"
        assert options.label is None

    def test_with_label(self):
        options = CheckpointOptions(task_id="task_123", label="before-refactor")
        assert options.label == "before-refactor"


class TestMigrateOptions:
    """Tests for MigrateOptions model."""

    def test_minimal_options(self):
        options = MigrateOptions(
            source="session_abc123",
            target_provider=SandboxProvider.MORPH,
        )
        assert options.source == "session_abc123"
        assert options.target_provider == SandboxProvider.MORPH
        assert options.devsh_path == "devsh"

    def test_full_options(self):
        options = MigrateOptions(
            source="checkpoint_xyz",
            target_provider=SandboxProvider.E2B,
            repo="owner/repo",
            branch="feature/test",
            message="Continue the work",
        )
        assert options.repo == "owner/repo"
        assert options.branch == "feature/test"
        assert options.message == "Continue the work"

    def test_invalid_provider(self):
        with pytest.raises(ValidationError):
            MigrateOptions(source="session_123", target_provider="invalid")  # type: ignore[arg-type]


class TestSpawnManyOptions:
    """Tests for SpawnManyOptions model."""

    def test_minimal_options(self):
        options = SpawnManyOptions(
            tasks=[
                SpawnManyTaskConfig(agent="claude/opus-4.5", prompt="Test 1"),
                SpawnManyTaskConfig(agent="codex/gpt-5.4", prompt="Test 2"),
            ]
        )
        assert len(options.tasks) == 2
        assert options.concurrency is None
        assert options.fail_fast is False
        assert options.devsh_path == "devsh"

    def test_full_options(self):
        options = SpawnManyOptions(
            tasks=[
                SpawnManyTaskConfig(
                    name="task-1",
                    agent="claude/opus-4.5",
                    prompt="Refactor auth",
                    provider=SandboxProvider.MORPH,
                    repo="owner/repo",
                    branch="feature/test",
                    timeout_ms=300000,
                    env={"KEY": "value"},
                ),
            ],
            concurrency=3,
            fail_fast=True,
            devsh_path="/custom/devsh",
            api_base_url="https://api.example.com",
            auth_token="token123",
        )
        assert options.tasks[0].name == "task-1"
        assert options.concurrency == 3
        assert options.fail_fast is True

    def test_invalid_task_agent(self):
        with pytest.raises(ValidationError):
            SpawnManyOptions(
                tasks=[
                    SpawnManyTaskConfig(agent="invalid", prompt="Test"),
                ]
            )


class TestParallelResult:
    """Tests for ParallelResult model."""

    def test_parallel_result(self):
        task_result = TaskResult(
            task_id="task_123",
            exit_code=0,
            stdout="output",
            stderr="",
            result="success",
            duration_ms=1000,
        )
        result = ParallelResult(
            results=[
                ParallelTaskResult(
                    name="task-1",
                    task_id="task_123",
                    status="completed",
                    result=task_result,
                ),
                ParallelTaskResult(
                    name="task-2",
                    task_id="task_456",
                    status="failed",
                    error="Something went wrong",
                ),
            ],
            succeeded=1,
            failed=1,
            total_duration_ms=2000,
        )
        assert result.succeeded == 1
        assert result.failed == 1
        assert result.results[0].status == "completed"
        assert result.results[1].error == "Something went wrong"


class TestCostTracking:
    """Tests for cost tracking types and functions."""

    def test_token_usage(self):
        usage = TokenUsage(
            input_tokens=1000,
            output_tokens=500,
            total_tokens=1500,
        )
        assert usage.input_tokens == 1000
        assert usage.output_tokens == 500
        assert usage.total_tokens == 1500
        assert usage.cache_read_tokens is None

    def test_token_usage_with_cache(self):
        usage = TokenUsage(
            input_tokens=1000,
            output_tokens=500,
            cache_read_tokens=200,
            cache_write_tokens=100,
            total_tokens=1500,
        )
        assert usage.cache_read_tokens == 200
        assert usage.cache_write_tokens == 100

    def test_cost_breakdown(self):
        cost = CostBreakdown(
            input_cost=0.015,
            output_cost=0.0375,
            total_cost=0.0525,
        )
        assert cost.input_cost == 0.015
        assert cost.output_cost == 0.0375
        assert cost.total_cost == 0.0525
        assert cost.currency == "USD"

    def test_calculate_cost(self):
        tokens = TokenUsage(
            input_tokens=1_000_000,
            output_tokens=500_000,
            total_tokens=1_500_000,
        )
        pricing = ModelPricing(
            input_per_million=15.0,
            output_per_million=75.0,
        )
        cost = calculate_cost(tokens, pricing)
        assert cost.input_cost == 15.0  # 1M tokens * $15/M
        assert cost.output_cost == 37.5  # 0.5M tokens * $75/M
        assert cost.total_cost == 52.5
        assert cost.cache_cost is None

    def test_calculate_cost_with_cache(self):
        tokens = TokenUsage(
            input_tokens=1_000_000,
            output_tokens=500_000,
            cache_read_tokens=200_000,
            cache_write_tokens=100_000,
            total_tokens=1_500_000,
        )
        pricing = ModelPricing(
            input_per_million=15.0,
            output_per_million=75.0,
            cache_read_per_million=1.5,
            cache_write_per_million=18.75,
        )
        cost = calculate_cost(tokens, pricing)
        assert cost.input_cost == 15.0
        assert cost.output_cost == 37.5
        # 0.2M * $1.5 + 0.1M * $18.75 = 0.3 + 1.875 = 2.175
        assert cost.cache_cost == pytest.approx(2.175)
        assert cost.total_cost == pytest.approx(54.675)

    def test_get_model_pricing_exact_match(self):
        pricing = get_model_pricing("claude-opus-4-6")
        assert pricing is not None
        assert pricing.input_per_million == 15
        assert pricing.output_per_million == 75

    def test_get_model_pricing_partial_match(self):
        pricing = get_model_pricing("opus-4-6")
        assert pricing is not None
        assert pricing.input_per_million == 15

    def test_get_model_pricing_not_found(self):
        pricing = get_model_pricing("unknown-model")
        assert pricing is None

    def test_model_pricing_dict(self):
        assert "claude-opus-4-6" in MODEL_PRICING
        assert "gpt-5.4" in MODEL_PRICING
        assert "2.5-pro" in MODEL_PRICING

    def test_usage_stats(self):
        tokens = TokenUsage(
            input_tokens=1000,
            output_tokens=500,
            total_tokens=1500,
        )
        usage = UsageStats(
            tokens=tokens,
            api_requests=3,
            tool_calls=5,
            duration_ms=10000,
            model="claude-opus-4-6",
            backend=AgentBackend.CLAUDE,
        )
        assert usage.tokens.total_tokens == 1500
        assert usage.api_requests == 3
        assert usage.tool_calls == 5
        assert usage.model == "claude-opus-4-6"
        assert usage.backend == AgentBackend.CLAUDE
