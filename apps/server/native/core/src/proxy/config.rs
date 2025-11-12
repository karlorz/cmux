use super::types::{ProxyOptions, KNOWN_PORTS};
use std::net::SocketAddr;
use std::sync::Arc;
use parking_lot::RwLock;
use dashmap::DashMap;

#[derive(Debug, Clone)]
pub struct ProxyConfig {
    pub listen_addr: SocketAddr,
    pub enable_http2: bool,
    pub enable_websockets: bool,
    pub max_connections: u32,
    pub idle_timeout_ms: u32,
    pub keepalive_ms: u32,
    pub header_routing_enabled: bool,
    pub workspace_isolation: bool,
    pub port_cache: Arc<DashMap<String, (u16, std::time::Instant)>>,
    pub workspace_ips: Arc<RwLock<dashmap::DashMap<String, String>>>,
}

impl ProxyConfig {
    pub fn from_options(opts: ProxyOptions) -> Self {
        Self {
            listen_addr: ([127, 0, 0, 1], opts.listen_port).into(),
            enable_http2: opts.enable_http2.unwrap_or(true),
            enable_websockets: opts.enable_websockets.unwrap_or(true),
            max_connections: opts.max_connections.unwrap_or(1000),
            idle_timeout_ms: opts.idle_timeout_ms.unwrap_or(120_000),
            keepalive_ms: opts.keepalive_ms.unwrap_or(30_000),
            header_routing_enabled: opts.header_routing_enabled.unwrap_or(true),
            workspace_isolation: opts.workspace_isolation.unwrap_or(true),
            port_cache: Arc::new(DashMap::new()),
            workspace_ips: Arc::new(RwLock::new(DashMap::new())),
        }
    }

    pub fn get_workspace_ip(&self, workspace: &str) -> String {
        let ips = self.workspace_ips.read();
        if let Some(ip) = ips.get(workspace) {
            return ip.clone();
        }
        drop(ips);

        // Generate IP from workspace name (workspace-N -> 127.18.N>>8.N&255)
        let workspace_num = workspace
            .strip_prefix("workspace-")
            .and_then(|s| s.parse::<u16>().ok())
            .unwrap_or(0);

        let ip = format!("127.18.{}.{}", workspace_num >> 8, workspace_num & 0xFF);

        let ips = self.workspace_ips.write();
        ips.insert(workspace.to_string(), ip.clone());
        ip
    }

    pub fn get_known_port_name(&self, port: u16) -> Option<&'static str> {
        KNOWN_PORTS
            .iter()
            .find(|(p, _)| *p == port)
            .map(|(_, name)| *name)
    }

    pub fn cache_port_mapping(&self, key: String, port: u16) {
        self.port_cache.insert(key, (port, std::time::Instant::now()));
    }

    pub fn get_cached_port(&self, key: &str) -> Option<u16> {
        self.port_cache.get(key).and_then(|entry| {
            let (port, cached_at) = *entry;
            if cached_at.elapsed().as_secs() < super::types::CACHE_DURATION_SECS {
                Some(port)
            } else {
                None
            }
        })
    }
}