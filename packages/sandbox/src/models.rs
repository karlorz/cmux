use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Clone, Debug, Deserialize, Serialize, ToSchema)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, ToSchema)]
pub struct CreateSandboxRequest {
    pub name: Option<String>,
    /// Host path mounted into /workspace inside the sandbox
    #[schema(example = "/var/lib/cmux/sandboxes/workspaces/<id>")]
    pub workspace: Option<String>,
    #[serde(default)]
    pub read_only_paths: Vec<String>,
    #[serde(default)]
    pub tmpfs: Vec<String>,
    #[serde(default)]
    pub env: Vec<EnvVar>,
}

#[derive(Clone, Debug, Deserialize, Serialize, ToSchema, PartialEq, Eq)]
pub enum SandboxStatus {
    Running,
    Exited,
    Failed,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, Serialize, ToSchema)]
pub struct SandboxNetwork {
    pub host_interface: String,
    pub sandbox_interface: String,
    pub host_ip: String,
    pub sandbox_ip: String,
    pub cidr: u8,
}

#[derive(Clone, Debug, Deserialize, Serialize, ToSchema)]
pub struct SandboxSummary {
    pub id: Uuid,
    pub index: usize,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub workspace: String,
    pub status: SandboxStatus,
    pub network: SandboxNetwork,
}

#[derive(Clone, Debug, Deserialize, Serialize, ToSchema)]
pub struct ExecRequest {
    /// Command arguments executed via nsenter inside the sandbox
    #[schema(example = "[\"/bin/sh\",\"-c\",\"pnpm dev\"]")]
    pub command: Vec<String>,
    #[schema(example = "/workspace")]
    pub workdir: Option<String>,
    #[serde(default)]
    pub env: Vec<EnvVar>,
}

#[derive(Clone, Debug, Deserialize, Serialize, ToSchema)]
pub struct ExecResponse {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, ToSchema)]
pub struct HealthResponse {
    pub status: String,
}
