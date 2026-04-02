"""Execution utilities for cmux unified agent SDK."""

import asyncio
import json
import os
import time
from typing import NamedTuple

from cmux_agent_sdk.types import (
    CheckpointOptions,
    CheckpointRef,
    MigrateOptions,
    ResumeOptions,
    SandboxProvider,
    SpawnOptions,
    TaskResult,
)


class DevshCheckResult(NamedTuple):
    """Result from checking devsh availability."""

    available: bool
    version: str | None = None
    error: str | None = None


async def execute_agent(options: SpawnOptions) -> TaskResult:
    """Execute an agent via devsh orchestrate spawn.

    Args:
        options: Spawn options

    Returns:
        TaskResult with execution details
    """
    start_time = time.time()

    # Build devsh orchestrate spawn command
    args = [options.devsh_path, "orchestrate", "spawn", "--json"]

    if options.sync:
        args.append("--sync")

    # Add provider
    args.extend(["--provider", options.provider.value])

    # Add repo if specified
    if options.repo:
        args.extend(["--repo", options.repo])

    # Add branch
    args.extend(["--branch", options.branch])

    # Add snapshot if specified
    if options.snapshot_id:
        args.extend(["--snapshot", options.snapshot_id])

    # Add timeout
    args.extend(["--timeout", str(options.timeout_ms // 1000)])

    # Add agent
    args.extend(["--agent", options.agent])

    # Add the prompt
    args.extend(["--", options.prompt])

    # Build environment
    env = os.environ.copy()
    if options.env:
        env.update(options.env)
    if options.api_base_url:
        env["CMUX_API_BASE_URL"] = options.api_base_url
    if options.auth_token:
        env["CMUX_AUTH_TOKEN"] = options.auth_token

    try:
        process = await asyncio.create_subprocess_exec(
            *args,
            env=env,
            cwd=options.work_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        # Wait with timeout (add buffer for spawn overhead)
        timeout_seconds = (options.timeout_ms + 30000) / 1000
        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=timeout_seconds,
        )

        duration_ms = int((time.time() - start_time) * 1000)
        stdout_str = stdout.decode("utf-8", errors="replace")
        stderr_str = stderr.decode("utf-8", errors="replace")

        # Parse JSON output from devsh
        try:
            output = json.loads(stdout_str)
            return TaskResult(
                task_id=output.get("taskId", "unknown"),
                exit_code=output.get("exitCode", process.returncode or 0),
                stdout=output.get("stdout", stdout_str),
                stderr=output.get("stderr", stderr_str),
                result=output.get("result", output.get("stdout", "")),
                duration_ms=duration_ms,
                session_id=output.get("sessionId"),
                checkpoint_ref=output.get("checkpointRef"),
            )
        except json.JSONDecodeError:
            # Fallback if output isn't JSON
            return TaskResult(
                task_id="unknown",
                exit_code=process.returncode or 0,
                stdout=stdout_str,
                stderr=stderr_str,
                result=stdout_str,
                duration_ms=duration_ms,
            )

    except asyncio.TimeoutError:
        duration_ms = int((time.time() - start_time) * 1000)
        return TaskResult(
            task_id="timeout",
            exit_code=124,
            stdout="",
            stderr=f"Timeout after {options.timeout_ms}ms",
            result="",
            duration_ms=duration_ms,
        )
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        return TaskResult(
            task_id="error",
            exit_code=1,
            stdout="",
            stderr=str(e),
            result="",
            duration_ms=duration_ms,
        )


async def execute_resume(options: ResumeOptions) -> TaskResult:
    """Execute a resume operation via devsh.

    Args:
        options: Resume options

    Returns:
        TaskResult with execution details
    """
    start_time = time.time()

    args = [options.devsh_path, "orchestrate", "inject", "--json"]
    args.extend(["--session-id", options.session_id])

    if options.provider:
        args.extend(["--provider", options.provider.value])

    args.extend(["--", options.message])

    try:
        process = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()
        duration_ms = int((time.time() - start_time) * 1000)
        stdout_str = stdout.decode("utf-8", errors="replace")
        stderr_str = stderr.decode("utf-8", errors="replace")

        try:
            output = json.loads(stdout_str)
            return TaskResult(
                task_id=output.get("taskId", "resumed"),
                exit_code=output.get("exitCode", process.returncode or 0),
                stdout=output.get("stdout", stdout_str),
                stderr=output.get("stderr", stderr_str),
                result=output.get("result", output.get("stdout", "")),
                duration_ms=duration_ms,
                session_id=output.get("sessionId", options.session_id),
            )
        except json.JSONDecodeError:
            return TaskResult(
                task_id="resumed",
                exit_code=process.returncode or 0,
                stdout=stdout_str,
                stderr=stderr_str,
                result=stdout_str,
                duration_ms=duration_ms,
                session_id=options.session_id,
            )

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        return TaskResult(
            task_id="error",
            exit_code=1,
            stdout="",
            stderr=str(e),
            result="",
            duration_ms=duration_ms,
        )


async def check_devsh_available(devsh_path: str = "devsh") -> DevshCheckResult:
    """Check if devsh is available and working.

    Args:
        devsh_path: Path to devsh CLI

    Returns:
        DevshCheckResult with availability status
    """
    try:
        process = await asyncio.create_subprocess_exec(
            devsh_path,
            "--version",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(process.communicate(), timeout=5.0)
        version = stdout.decode("utf-8").strip()
        return DevshCheckResult(available=True, version=version)
    except Exception as e:
        return DevshCheckResult(available=False, error=str(e))


def get_supported_providers() -> list[SandboxProvider]:
    """Get list of supported sandbox providers."""
    return list(SandboxProvider)


def get_supported_backends() -> list[str]:
    """Get list of supported agent backends."""
    return ["claude", "codex", "gemini", "amp", "opencode"]


async def execute_checkpoint(options: CheckpointOptions) -> CheckpointRef | None:
    """Create a checkpoint for a running or completed task.

    Args:
        options: Checkpoint options

    Returns:
        CheckpointRef if successful, None otherwise
    """
    args = [options.devsh_path, "orchestrate", "checkpoint", "--json"]
    args.extend(["--task-id", options.task_id])

    if options.label:
        args.extend(["--label", options.label])

    try:
        process = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await asyncio.wait_for(process.communicate(), timeout=30.0)
        stdout_str = stdout.decode("utf-8", errors="replace")

        try:
            from datetime import timezone

            output = json.loads(stdout_str)
            created_at_str = output.get("createdAt")
            created_at = (
                datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
                if created_at_str
                else datetime.now(timezone.utc)
            )
            return CheckpointRef(
                id=output.get("checkpointId", output.get("id", "unknown")),
                task_id=options.task_id,
                agent=output.get("agent", "unknown/unknown"),
                source_provider=SandboxProvider(output.get("provider", "local")),
                session_id=output.get("sessionId", ""),
                created_at=created_at,
                resumable=output.get("resumable", True),
                data=output.get("data"),
            )
        except (json.JSONDecodeError, ValueError):
            return None
    except Exception:
        return None


async def execute_migrate(options: MigrateOptions) -> TaskResult:
    """Migrate a session to a different provider.

    Args:
        options: Migration options

    Returns:
        TaskResult with execution details
    """
    start_time = time.time()

    args = [options.devsh_path, "orchestrate", "migrate", "--json"]
    args.extend(["--source", options.source])
    args.extend(["--target-provider", options.target_provider.value])

    if options.repo:
        args.extend(["--repo", options.repo])

    if options.branch:
        args.extend(["--branch", options.branch])

    if options.message:
        args.extend(["--", options.message])

    env = os.environ.copy()
    if options.api_base_url:
        env["CMUX_API_BASE_URL"] = options.api_base_url
    if options.auth_token:
        env["CMUX_AUTH_TOKEN"] = options.auth_token

    try:
        process = await asyncio.create_subprocess_exec(
            *args,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=300.0,
        )

        duration_ms = int((time.time() - start_time) * 1000)
        stdout_str = stdout.decode("utf-8", errors="replace")
        stderr_str = stderr.decode("utf-8", errors="replace")

        try:
            output = json.loads(stdout_str)
            return TaskResult(
                task_id=output.get("taskId", "migrated"),
                exit_code=output.get("exitCode", process.returncode or 0),
                stdout=output.get("stdout", stdout_str),
                stderr=output.get("stderr", stderr_str),
                result=output.get("result", output.get("stdout", "")),
                duration_ms=duration_ms,
                session_id=output.get("sessionId"),
                checkpoint_ref=output.get("checkpointRef"),
            )
        except json.JSONDecodeError:
            return TaskResult(
                task_id="migrated",
                exit_code=process.returncode or 0,
                stdout=stdout_str,
                stderr=stderr_str,
                result=stdout_str,
                duration_ms=duration_ms,
            )

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        return TaskResult(
            task_id="error",
            exit_code=1,
            stdout="",
            stderr=str(e),
            result="",
            duration_ms=duration_ms,
        )
