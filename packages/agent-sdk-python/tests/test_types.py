"""Tests for type definitions."""

import pytest
from pydantic import ValidationError

from cmux_agent_sdk.types import (
    AgentBackend,
    SandboxProvider,
    SpawnOptions,
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
