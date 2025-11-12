use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct ProxyRoute {
    pub container_name: String,
    pub target_port: u16,
    pub target_host: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[napi(object)]
pub struct ProxyStats {
    pub total_requests: i64,
    pub active_connections: i64,
    pub websocket_connections: i64,
    pub http2_connections: i64,
    pub bytes_transferred: i64,
}

#[derive(Debug, Clone)]
#[napi(object)]
pub struct ProxyOptions {
    pub listen_port: u16,
    pub enable_http2: Option<bool>,
    pub enable_websockets: Option<bool>,
    pub max_connections: Option<u32>,
    pub idle_timeout_ms: Option<u32>,
    pub keepalive_ms: Option<u32>,
    pub header_routing_enabled: Option<bool>,
    pub workspace_isolation: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct ConnectionInfo {
    pub client_addr: std::net::SocketAddr,
    pub target: String,
    pub protocol: Protocol,
    pub start_time: std::time::Instant,
}

#[derive(Debug, Clone)]
pub enum Protocol {
    Http1,
    Http2,
    WebSocket,
}

#[derive(Debug, Clone)]
pub struct PortMapping {
    pub container_name: String,
    pub internal_port: u16,
    pub external_port: u16,
    pub cached_at: std::time::Instant,
}

pub const KNOWN_PORTS: &[(u16, &str)] = &[
    (39378, "vscode"),
    (39377, "worker"),
    (39376, "extension"),
    (39379, "proxy"),
    (39380, "vnc"),
    (39381, "cdp"),
];

pub const CACHE_DURATION_SECS: u64 = 2;
pub const WEBSOCKET_KEEPALIVE_INTERVAL_SECS: u64 = 30;
pub const DEFAULT_IDLE_TIMEOUT_MS: u32 = 120_000;