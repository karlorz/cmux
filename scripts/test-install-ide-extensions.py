#!/usr/bin/env python3
"""End-to-end test for cmux-code marketplace extension install via exec.

This script clones a template LXC, starts it, runs a pared-down installer
for all extensions in configs/ide-deps.json (cmux-code only), and checks:
  - the exec stream delivers a completion marker (detects truncation)
  - all expected extensions appear in --list-extensions output

Usage:
  uv run --env-file .env ./scripts/test-install-ide-extensions.py \\
    --template-vmid 9011 --vmid 9900 [--keep]

Required env:
  PVE_API_URL, PVE_API_TOKEN, PVE_PUBLIC_DOMAIN or PVE_CF_DOMAIN
Optional env:
  PVE_SSH_HOST for SSH fallback to pct exec (not implemented here; HTTP exec required)
"""

from __future__ import annotations

import argparse
import json
import os
import ssl
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Iterable, List, Tuple

# ---------------------------------------------------------------------------
# Minimal PVE client (HTTP exec only, matches snapshot-pvelxc behavior)
# ---------------------------------------------------------------------------


class PveLxcClient:
    def __init__(
        self,
        api_url: str,
        api_token: str,
        node: str | None = None,
        verify_ssl: bool = False,
        cf_domain: str | None = None,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.api_token = api_token
        self.node = node
        self.cf_domain = cf_domain

        parts = api_token.split("=", 1)
        if len(parts) != 2:
            raise ValueError("Invalid PVE_API_TOKEN format (expected user@realm!tokenid=secret)")
        self.token_id = parts[0]
        self.token_secret = parts[1]

        self._ssl_context: ssl.SSLContext | None = None
        if not verify_ssl:
            self._ssl_context = ssl.create_default_context()
            self._ssl_context.check_hostname = False
            self._ssl_context.verify_mode = ssl.CERT_NONE

    # ------------ API helpers ------------
    def _request(self, method: str, endpoint: str, data: dict | None = None) -> dict:
        url = f"{self.api_url}{endpoint}"
        headers = {"Authorization": f"PVEAPIToken={self.token_id}={self.token_secret}"}
        body = None
        if data:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
            body = urllib.parse.urlencode(data).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        with urllib.request.urlopen(req, context=self._ssl_context, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def get_node(self) -> str:
        if self.node:
            return self.node
        result = self._request("GET", "/api2/json/nodes")
        nodes = result.get("data", [])
        if not nodes:
            raise RuntimeError("No nodes found")
        self.node = nodes[0]["node"]
        return self.node

    def get_lxc_status(self, vmid: int, node: str | None = None) -> dict:
        node = node or self.get_node()
        result = self._request("GET", f"/api2/json/nodes/{node}/lxc/{vmid}/status/current")
        return result.get("data", {})

    def get_lxc_config(self, vmid: int, node: str | None = None) -> dict:
        node = node or self.get_node()
        result = self._request("GET", f"/api2/json/nodes/{node}/lxc/{vmid}/config")
        return result.get("data", {})

    def clone_lxc(self, source_vmid: int, new_vmid: int, *, hostname: str, full: bool, node: str) -> str:
        data = {"newid": new_vmid, "full": 1 if full else 0, "hostname": hostname}
        result = self._request("POST", f"/api2/json/nodes/{node}/lxc/{source_vmid}/clone", data)
        return result.get("data", "")

    def start_lxc(self, vmid: int, node: str) -> str:
        result = self._request("POST", f"/api2/json/nodes/{node}/lxc/{vmid}/status/start")
        return result.get("data", "")

    def shutdown_lxc(self, vmid: int, node: str) -> str:
        result = self._request("POST", f"/api2/json/nodes/{node}/lxc/{vmid}/status/shutdown")
        return result.get("data", "")

    def delete_lxc(self, vmid: int, node: str) -> None:
        self._request("DELETE", f"/api2/json/nodes/{node}/lxc/{vmid}")

    def get_task_status(self, upid: str, node: str) -> dict:
        encoded = urllib.parse.quote(upid, safe="")
        result = self._request("GET", f"/api2/json/nodes/{node}/tasks/{encoded}/status")
        return result.get("data", {})

    def await_task(self, upid: str, *, timeout: int, node: str, poll_interval: float = 2.0) -> dict:
        elapsed = 0.0
        while elapsed < timeout:
            status = self.get_task_status(upid, node)
            if status.get("status") == "stopped":
                exitstatus = status.get("exitstatus", "")
                if exitstatus == "OK":
                    return status
                raise RuntimeError(f"Task failed: {exitstatus}")
            time.sleep(poll_interval)
            elapsed += poll_interval
        raise TimeoutError(f"Task {upid} timed out after {timeout}s")

    # ------------ HTTP exec ------------
    def _normalize_host_id(self, value: str) -> str:
        return value.strip().lower().replace("_", "-")

    def build_exec_url(self, vmid: int) -> str | None:
        if not self.cf_domain:
            return None
        config = self.get_lxc_config(vmid)
        host = config.get("hostname")
        if not isinstance(host, str) or not host.strip():
            return None
        return f"https://port-39375-{self._normalize_host_id(host)}.{self.cf_domain}/exec"

    def http_exec(self, vmid: int, command: str, *, timeout: float | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
        exec_url = self.build_exec_url(vmid)
        if not exec_url:
            raise RuntimeError("HTTP exec not available (cf_domain missing or hostname absent)")

        timeout_ms = int((timeout or 600) * 1000)
        body = json.dumps({"command": f"HOME=/root {command}", "timeout_ms": timeout_ms}).encode("utf-8")
        req = urllib.request.Request(exec_url, data=body, headers={"Content-Type": "application/json"}, method="POST")

        stdout_lines: List[str] = []
        stderr_lines: List[str] = []
        exit_code: int | None = None

        try:
            with urllib.request.urlopen(req, timeout=timeout or 600) as response:
                for line in response:
                    line_str = line.decode("utf-8").strip()
                    if not line_str:
                        continue
                    try:
                        event = json.loads(line_str)
                    except json.JSONDecodeError:
                        stderr_lines.append(line_str)
                        continue
                    etype = event.get("type")
                    if etype == "stdout":
                        stdout_lines.append(event.get("data", ""))
                    elif etype == "stderr":
                        stderr_lines.append(event.get("data", ""))
                    elif etype == "exit":
                        exit_code = event.get("code", 0)
                    elif etype == "error":
                        stderr_lines.append(event.get("message", "Unknown error"))
                        exit_code = 1
        except urllib.error.HTTPError as e:
            stderr_lines.append(f"HTTP exec error {e.code}: {e.reason}")
            exit_code = 1
        except urllib.error.URLError as e:
            raise RuntimeError(f"HTTP exec connection failed: {e.reason}") from e

        if exit_code is None:
            exit_code = 0  # matches current snapshot-pvelxc behavior (possible truncation)

        result = subprocess.CompletedProcess(args=command, returncode=exit_code, stdout="".join(stdout_lines), stderr="".join(stderr_lines))
        if check and result.returncode != 0:
            raise RuntimeError(f"HTTP exec failed (exit {result.returncode})\\nstdout: {result.stdout}\\nstderr: {result.stderr}")
        return result

    def exec_in_container(self, vmid: int, command: str, *, timeout: float | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
        return self.http_exec(vmid, command, timeout=timeout, check=check)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def wait_for_container_ready(vmid: int, client: PveLxcClient, *, timeout: int = 180) -> None:
    """Wait until container is running and cmux-execd responds."""
    print(f"Waiting for container {vmid} to be ready...")
    elapsed = 0
    while elapsed < timeout:
        status = client.get_lxc_status(vmid)
        if status.get("status") == "running":
            try:
                res = client.http_exec(vmid, "echo ready", timeout=10, check=False)
                if res and res.returncode == 0 and "ready" in (res.stdout or ""):
                    print("cmux-execd ready")
                    return
            except Exception:
                pass
        time.sleep(2)
        elapsed += 2
    raise TimeoutError(f"Container {vmid} not ready after {timeout}s")


def load_extensions(repo_root: Path) -> list[Tuple[str, str, str]]:
    deps_path = repo_root / "configs" / "ide-deps.json"
    deps = json.loads(deps_path.read_text("utf-8"))
    exts = deps.get("extensions")
    if not isinstance(exts, list):
        raise RuntimeError("configs/ide-deps.json extensions must be an array")
    out: list[Tuple[str, str, str]] = []
    for item in exts:
        if not isinstance(item, dict):
            raise RuntimeError(f"Invalid extension entry: {item!r}")
        pub, name, ver = item.get("publisher"), item.get("name"), item.get("version")
        if not all(isinstance(v, str) for v in (pub, name, ver)):
            raise RuntimeError(f"Invalid extension entry: {item!r}")
        out.append((pub, name, ver))
    return out


def build_install_script(ext_lines: Iterable[Tuple[str, str, str]]) -> str:
    lines = "\n".join(f"{p}|{n}|{v}" for p, n, v in ext_lines)
    return f"""
set -euo pipefail
echo "[MARK] install start $(date -Ins)"
server_root="/app/cmux-code"
bin_path="${{server_root}}/bin/code-server-oss"
extensions_dir="/root/.vscode-server-oss/extensions"
user_data_dir="/root/.vscode-server-oss/data"

if [ ! -x "${{bin_path}}" ]; then
  echo "cmux-code binary missing at ${{bin_path}}" >&2
  exit 1
fi

mkdir -p "${{extensions_dir}}" "${{user_data_dir}}/User"
echo '{{"extensions.verifySignature": false}}' > "${{user_data_dir}}/User/settings.json"

download_dir="$(mktemp -d)"
cleanup() {{ rm -rf "${{download_dir}}"; }}
trap cleanup EXIT

download_extension() {{
  local publisher="$1" name="$2" version="$3" dest="$4"
  local url="https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${{publisher}}/vsextensions/${{name}}/${{version}}/vspackage"
  local tmp="${{dest}}.download"
  echo "[MARK] download ${{publisher}}.${{name}}@${{version}}" >&2
  if ! curl -fSL --retry 4 --retry-all-errors --retry-delay 2 --connect-timeout 20 --max-time 600 -o "${{tmp}}" "${{url}}"; then
    echo "download failed for ${{publisher}}.${{name}}@${{version}}" >&2
    return 1
  fi
  if gzip -t "${{tmp}}" >/dev/null 2>&1; then
    gunzip -c "${{tmp}}" > "${{dest}}"
    rm -f "${{tmp}}"
  else
    mv "${{tmp}}" "${{dest}}"
  fi
}}

set +e
while IFS='|' read -r publisher name version; do
  [ -z "${{publisher}}" ] && continue
  download_extension "${{publisher}}" "${{name}}" "${{version}}" "${{download_dir}}/${{publisher}}.${{name}}.vsix" &
done <<'EXTENSIONS'
{lines}
EXTENSIONS
wait
set -e

count=0
for vsix in "${{download_dir}}"/*.vsix; do
  [ -f "${{vsix}}" ] || continue
  count=$((count+1))
  echo "[MARK] install $(basename "${{vsix}}")"
  "${{bin_path}}" \
    --install-extension "${{vsix}}" \
    --force \
    --extensions-dir "${{extensions_dir}}" \
    --user-data-dir "${{user_data_dir}}" >/tmp/cmux-ext-install.log 2>&1 || {{
      echo "install failed for $(basename "${{vsix}}")" >&2
      cat /tmp/cmux-ext-install.log >&2 || true
      exit 1
    }}
done
echo "[MARK] install done count=${{count}}"

echo "[MARK] list-extensions"
"${{bin_path}}" --list-extensions --extensions-dir "${{extensions_dir}}" --user-data-dir "${{user_data_dir}}" | sort
echo "[MARK] completed $(date -Ins)"
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Test cmux-code extension install via exec")
    parser.add_argument("--template-vmid", type=int, default=9011, help="Template VMID to clone from")
    parser.add_argument("--vmid", type=int, default=9900, help="VMID to use for test (cloned if absent)")
    parser.add_argument("--keep", action="store_true", help="Keep the test container after run")
    args = parser.parse_args()

    api_url = os.environ.get("PVE_API_URL")
    api_token = os.environ.get("PVE_API_TOKEN")
    cf_domain = os.environ.get("PVE_PUBLIC_DOMAIN") or os.environ.get("PVE_CF_DOMAIN")
    if not api_url or not api_token or not cf_domain:
        print("PVE_API_URL, PVE_API_TOKEN, and PVE_PUBLIC_DOMAIN/PVE_CF_DOMAIN are required", file=sys.stderr)
        return 1

    repo_root = Path(__file__).resolve().parent.parent
    extensions = load_extensions(repo_root)
    install_script = build_install_script(extensions)

    client = PveLxcClient(api_url, api_token, cf_domain=cf_domain)
    node = client.get_node()

    created = False
    try:
        status = None
        try:
            status = client.get_lxc_status(args.vmid, node)
        except Exception:
            pass
        if not status:
            print(f"Cloning template {args.template_vmid} -> {args.vmid} (linked clone)...")
            upid = client.clone_lxc(args.template_vmid, args.vmid, hostname=f"pvelxc-exttest-{args.vmid}", full=False, node=node)
            client.await_task(upid, timeout=300, node=node)
            created = True

        print(f"Starting container {args.vmid}...")
        upid = client.start_lxc(args.vmid, node)
        client.await_task(upid, timeout=120, node=node)
        wait_for_container_ready(args.vmid, client, timeout=180)

        print("Running install script via exec (expects full streaming)...")
        start = time.time()
        result = client.exec_in_container(args.vmid, install_script, timeout=900, check=False)
        duration = time.time() - start
        print(f"Exec finished in {duration:.2f}s, exit={result.returncode}")

        stdout = result.stdout or ""
        stderr = result.stderr or ""
        print("---- stdout ----")
        print(stdout)
        print("---- stderr ----")
        print(stderr)

        if "[MARK] completed" not in stdout:
            print("ERROR: stream truncated (missing completion marker)", file=sys.stderr)
            return 1
        missing = [f"{p}.{n}" for p, n, _ in extensions if f"{p}.{n}" not in stdout]
        if missing:
            print(f"ERROR: missing extensions in list output: {', '.join(missing)}", file=sys.stderr)
            return 1
        if result.returncode != 0:
            print("ERROR: exec reported non-zero exit", file=sys.stderr)
            return 1
        print("SUCCESS: extensions installed and stream intact")
        return 0
    finally:
        if not args.keep:
            try:
                print(f"Stopping container {args.vmid}...")
                upid = client.shutdown_lxc(args.vmid, node)
                client.await_task(upid, timeout=120, node=node)
            except Exception:
                pass
            try:
                print(f"Destroying container {args.vmid}...")
                client.delete_lxc(args.vmid, node)
            except Exception:
                pass


if __name__ == "__main__":
    sys.exit(main())
