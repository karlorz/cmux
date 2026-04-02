"""Tests for type definitions."""

import pytest
from pydantic import ValidationError

from cmux_agent_sdk.types import (
    AgentBackend,
    CheckpointOptions,
    MigrateOptions,
    ParallelResult,
    ParallelTaskResult,
    SandboxProvider,
    SpawnManyOptions,
    SpawnManyTaskConfig,
    SpawnOptions,
    TaskResult,
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
