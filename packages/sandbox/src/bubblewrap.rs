use crate::errors::{SandboxError, SandboxResult};
use crate::ip_pool::{IpLease, IpPool};
use crate::models::{
    CreateSandboxRequest, ExecRequest, ExecResponse, SandboxNetwork, SandboxStatus, SandboxSummary,
};
use crate::service::SandboxService;
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tokio::fs;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tracing::{info, warn};
use uuid::Uuid;
use which::which;

const NETWORK_BASE: Ipv4Addr = Ipv4Addr::new(10, 201, 0, 0);
const HOST_IF_PREFIX: &str = "vethh";
const NS_IF_PREFIX: &str = "vethn";

#[derive(Deserialize)]
struct BwrapStatus {
    #[serde(rename = "child-pid")]
    child_pid: u32,
}

#[derive(Clone, Debug)]
struct SandboxHandle {
    id: Uuid,
    name: String,
    workspace: PathBuf,
    network: SandboxNetwork,
    created_at: DateTime<Utc>,
    lease: IpLease,
}

#[derive(Clone)]
struct SandboxEntry {
    handle: SandboxHandle,
    child: Arc<Mutex<Child>>,
    inner_pid: u32,
}

pub struct BubblewrapService {
    sandboxes: Mutex<HashMap<Uuid, SandboxEntry>>,
    workspace_root: PathBuf,
    ip_pool: Mutex<IpPool>,
    bubblewrap_path: String,
    ip_path: String,
    nsenter_path: String,
}

fn nsenter_args(pid: u32, workdir: Option<&str>, command: &[String]) -> Vec<String> {
    let mut args = vec![
        "--target".to_string(),
        pid.to_string(),
        "--mount".to_string(),
        "--uts".to_string(),
        "--ipc".to_string(),
        "--net".to_string(),
        "--pid".to_string(),
    ];

    if let Some(dir) = workdir {
        args.push(format!("--wd={}", dir));
    } else {
        args.push("--wd=/workspace".to_string());
    }

    args.push("--".to_string());
    args.extend_from_slice(command);

    args
}

impl BubblewrapService {
    pub async fn new(workspace_root: PathBuf) -> SandboxResult<Self> {
        if !workspace_root.exists() {
            fs::create_dir_all(&workspace_root).await?;
        }

        let bubblewrap_path = find_binary("bwrap")?;
        let ip_path = find_binary("ip")?;
        let nsenter_path = find_binary("nsenter")?;

        Ok(Self {
            sandboxes: Mutex::new(HashMap::new()),
            workspace_root,
            ip_pool: Mutex::new(IpPool::new(NETWORK_BASE)),
            bubblewrap_path,
            ip_path,
            nsenter_path,
        })
    }

    fn default_name(id: &Uuid) -> String {
        let mut buffer = Uuid::encode_buffer();
        let encoded = id.as_simple().encode_lower(&mut buffer);
        let slug = encoded.get(0..8).unwrap_or("sandbox");
        format!("sandbox-{slug}")
    }

    fn resolve_workspace(&self, request: &CreateSandboxRequest, id: &Uuid) -> PathBuf {
        if let Some(raw) = &request.workspace {
            let path = PathBuf::from(raw);
            if path.is_absolute() {
                return path;
            }

            return self.workspace_root.join(path);
        }

        self.workspace_root.join(id.to_string()).join("workspace")
    }

    async fn spawn_bubblewrap(
        &self,
        request: &CreateSandboxRequest,
        workspace: &Path,
        id: &Uuid,
    ) -> SandboxResult<(Child, u32)> {
        let workspace_str = workspace
            .to_str()
            .ok_or_else(|| {
                SandboxError::InvalidRequest("workspace path is not valid UTF-8".into())
            })?
            .to_owned();

        let mut command = Command::new(&self.bubblewrap_path);
        command.kill_on_drop(true);
        command.stdout(Stdio::piped());
        command.args([
            "--die-with-parent",
            "--unshare-net",
            "--unshare-pid",
            "--unshare-uts",
            "--unshare-ipc",
            "--bind",
            "/",
            "/",
            "--dev",
            "/dev",
            "--proc",
            "/proc",
            "--tmpfs",
            "/tmp",
            "--bind",
            &workspace_str,
            "/workspace",
            "--chdir",
            "/workspace",
            "--hostname",
            &Self::default_name(id),
            "--json-status-fd",
            "1",
        ]);

        for path in &request.read_only_paths {
            command.args(["--ro-bind", path, path]);
        }

        for mount in &request.tmpfs {
            command.args(["--tmpfs", mount]);
        }

        for env in &request.env {
            command.env(&env.key, &env.value);
        }

        command.args(["--", "/bin/sh", "-c", "ip link set lo up && sleep infinity"]);

        let mut child = command.spawn()?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| SandboxError::Internal("failed to capture bwrap stdout".into()))?;

        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        reader.read_line(&mut line).await?;

        let status: BwrapStatus = serde_json::from_str(&line).map_err(|e| {
            SandboxError::Internal(format!("failed to parse bwrap status: {e}, line: {line}"))
        })?;

        Ok((child, status.child_pid))
    }

    async fn configure_network(
        &self,
        pid: u32,
        lease: &IpLease,
        id: &Uuid,
    ) -> SandboxResult<SandboxNetwork> {
        let formatted_pid = pid.to_string();
        let (host_if, ns_if) = make_interface_names(id);
        let host_cidr = format!("{}/{}", lease.host, lease.cidr);
        let sandbox_cidr = format!("{}/{}", lease.sandbox, lease.cidr);

        run_command(
            &self.ip_path,
            &[
                "link", "add", &host_if, "type", "veth", "peer", "name", &ns_if,
            ],
        )
        .await?;
        run_command(&self.ip_path, &["addr", "add", &host_cidr, "dev", &host_if]).await?;
        run_command(&self.ip_path, &["link", "set", &host_if, "up"]).await?;
        run_command(
            &self.ip_path,
            &["link", "set", &ns_if, "netns", &formatted_pid],
        )
        .await?;

        run_command(
            &self.nsenter_path,
            &[
                "--target",
                &formatted_pid,
                "--net",
                "--",
                "ip",
                "addr",
                "add",
                &sandbox_cidr,
                "dev",
                &ns_if,
            ],
        )
        .await?;

        run_command(
            &self.nsenter_path,
            &[
                "--target",
                &formatted_pid,
                "--net",
                "--",
                "ip",
                "link",
                "set",
                &ns_if,
                "up",
            ],
        )
        .await?;
        run_command(
            &self.nsenter_path,
            &[
                "--target",
                &formatted_pid,
                "--net",
                "--",
                "ip",
                "link",
                "set",
                "lo",
                "up",
            ],
        )
        .await?;
        run_command(
            &self.nsenter_path,
            &[
                "--target",
                &formatted_pid,
                "--net",
                "--",
                "ip",
                "route",
                "replace",
                "default",
                "via",
                &lease.host.to_string(),
            ],
        )
        .await?;

        Ok(SandboxNetwork {
            host_interface: host_if,
            sandbox_interface: ns_if,
            host_ip: lease.host.to_string(),
            sandbox_ip: lease.sandbox.to_string(),
            cidr: lease.cidr,
        })
    }

    async fn teardown_network(&self, network: &SandboxNetwork) {
        let delete_result =
            run_command(&self.ip_path, &["link", "del", &network.host_interface]).await;
        if let Err(error) = delete_result {
            warn!(
                "failed to delete interface {}: {error}",
                network.host_interface
            );
        }
    }

    async fn workspace_summary(
        entry: &SandboxEntry,
        child: &mut Child,
    ) -> SandboxResult<SandboxSummary> {
        let status = match child.try_wait()? {
            None => SandboxStatus::Running,
            Some(exit_status) => {
                if exit_status.success() {
                    SandboxStatus::Exited
                } else {
                    SandboxStatus::Failed
                }
            }
        };

        Ok(entry.handle.to_summary(status))
    }
}

fn find_binary(name: &str) -> SandboxResult<String> {
    let binary_path = which(name)
        .map_err(|_| SandboxError::MissingBinary(name.to_owned()))?
        .to_string_lossy()
        .to_string();
    Ok(binary_path)
}

fn make_interface_names(id: &Uuid) -> (String, String) {
    let mut buffer = Uuid::encode_buffer();
    let encoded = id.as_simple().encode_lower(&mut buffer);
    let short = encoded.get(0..8).unwrap_or("ns");
    (
        format!("{HOST_IF_PREFIX}-{short}"),
        format!("{NS_IF_PREFIX}-{short}"),
    )
}

#[async_trait]
impl SandboxService for BubblewrapService {
    async fn create(&self, request: CreateSandboxRequest) -> SandboxResult<SandboxSummary> {
        let id = Uuid::new_v4();
        let name = request
            .name
            .clone()
            .unwrap_or_else(|| Self::default_name(&id));
        let workspace = self.resolve_workspace(&request, &id);
        fs::create_dir_all(&workspace).await?;

        let lease = {
            let mut pool = self.ip_pool.lock().await;
            pool.allocate()?
        };

        let (mut child, inner_pid) = match self.spawn_bubblewrap(&request, &workspace, &id).await {
            Ok(res) => res,
            Err(error) => {
                let mut pool = self.ip_pool.lock().await;
                pool.release(&lease);
                return Err(error);
            }
        };

        let network = match self.configure_network(inner_pid, &lease, &id).await {
            Ok(net) => net,
            Err(error) => {
                let _ = child.kill().await;
                {
                    let mut pool = self.ip_pool.lock().await;
                    pool.release(&lease);
                }
                return Err(error);
            }
        };

        let handle = SandboxHandle {
            id,
            name,
            workspace,
            network,
            created_at: Utc::now(),
            lease,
        };

        let entry = SandboxEntry {
            handle,
            child: Arc::new(Mutex::new(child)),
            inner_pid,
        };

        let summary = {
            let mut child = entry.child.lock().await;
            Self::workspace_summary(&entry, &mut child).await?
        };

        let mut sandboxes = self.sandboxes.lock().await;
        sandboxes.insert(id, entry);
        info!("created sandbox {id}");
        Ok(summary)
    }

    async fn list(&self) -> SandboxResult<Vec<SandboxSummary>> {
        let entries: Vec<SandboxEntry> = {
            let guard = self.sandboxes.lock().await;
            guard.values().cloned().collect()
        };

        let mut results = Vec::with_capacity(entries.len());
        for entry in entries {
            let mut child = entry.child.lock().await;
            results.push(Self::workspace_summary(&entry, &mut child).await?);
        }

        Ok(results)
    }

    async fn get(&self, id: Uuid) -> SandboxResult<Option<SandboxSummary>> {
        let entry = {
            let sandboxes = self.sandboxes.lock().await;
            sandboxes.get(&id).cloned()
        };

        if let Some(entry) = entry {
            let mut child = entry.child.lock().await;
            let summary = Self::workspace_summary(&entry, &mut child).await?;
            return Ok(Some(summary));
        }

        Ok(None)
    }

    async fn exec(&self, id: Uuid, exec: ExecRequest) -> SandboxResult<ExecResponse> {
        if exec.command.is_empty() {
            return Err(SandboxError::InvalidRequest(
                "exec.command must not be empty".into(),
            ));
        }

        let entry = {
            let sandboxes = self.sandboxes.lock().await;
            sandboxes.get(&id).cloned()
        }
        .ok_or(SandboxError::NotFound(id))?;

        let mut command = Command::new(&self.nsenter_path);
        for env in &exec.env {
            command.env(&env.key, &env.value);
        }

        command.args(nsenter_args(
            entry.inner_pid,
            exec.workdir.as_deref(),
            &exec.command,
        ));

        command.kill_on_drop(true);
        let output = command.output().await?;
        let exit_code = output.status.code().unwrap_or_default();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        Ok(ExecResponse {
            exit_code,
            stdout,
            stderr,
        })
    }

    async fn delete(&self, id: Uuid) -> SandboxResult<Option<SandboxSummary>> {
        let entry = {
            let mut sandboxes = self.sandboxes.lock().await;
            sandboxes.remove(&id)
        };

        if let Some(entry) = entry {
            {
                let mut pool = self.ip_pool.lock().await;
                pool.release(&entry.handle.lease);
            }

            self.teardown_network(&entry.handle.network).await;

            let mut child = entry.child.lock().await;
            let observed_status = match child.try_wait()? {
                None => {
                    let _ = child.kill().await;
                    let _ = child.wait().await;
                    SandboxStatus::Exited
                }
                Some(exit) => {
                    if exit.success() {
                        SandboxStatus::Exited
                    } else {
                        SandboxStatus::Failed
                    }
                }
            };

            let summary = entry.handle.to_summary(observed_status);

            if entry.handle.workspace.starts_with(&self.workspace_root) {
                if let Err(error) = fs::remove_dir_all(&entry.handle.workspace).await {
                    warn!(
                        "failed to remove workspace {}: {error}",
                        entry.handle.workspace.display()
                    );
                }
            }

            info!("removed sandbox {id}");
            return Ok(Some(summary));
        }

        Ok(None)
    }
}

impl SandboxHandle {
    fn to_summary(&self, status: SandboxStatus) -> SandboxSummary {
        SandboxSummary {
            id: self.id,
            name: self.name.clone(),
            created_at: self.created_at,
            workspace: self.workspace.to_string_lossy().to_string(),
            status,
            network: self.network.clone(),
        }
    }
}

async fn run_command(binary: &str, args: &[&str]) -> SandboxResult<()> {
    let output = Command::new(binary).args(args).output().await?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Err(SandboxError::CommandFailed {
        command: format!("{binary} {}", args.join(" ")),
        message: stderr,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interface_names_are_short() {
        let id = Uuid::new_v4();
        let (host_if, ns_if) = make_interface_names(&id);
        assert!(host_if.len() <= 15);
        assert!(ns_if.len() <= 15);
    }

    #[test]
    fn nsenter_args_defaults() {
        let args = nsenter_args(123, None, &["ls".to_string()]);
        assert!(args.contains(&"--target".to_string()));
        assert!(args.contains(&"123".to_string()));
        assert!(args.contains(&"--wd=/workspace".to_string()));

        // Verify structure: --target 123 ... --wd=/workspace -- ls
        let wd_idx = args.iter().position(|s| s == "--wd=/workspace").unwrap();
        let double_dash_idx = args.iter().position(|s| s == "--").unwrap();
        let ls_idx = args.iter().position(|s| s == "ls").unwrap();

        assert!(wd_idx < double_dash_idx);
        assert!(double_dash_idx < ls_idx);
    }

    #[test]
    fn nsenter_args_custom_workdir() {
        let args = nsenter_args(123, Some("/custom"), &["ls".to_string()]);
        assert!(args.contains(&"--wd=/custom".to_string()));

        let wd_idx = args.iter().position(|s| s == "--wd=/custom").unwrap();
        let double_dash_idx = args.iter().position(|s| s == "--").unwrap();

        assert!(wd_idx < double_dash_idx);
    }
}
