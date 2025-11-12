use anyhow::{anyhow, Result};
use http::{HeaderMap, HeaderValue};
use std::net::SocketAddr;
use tracing::{debug, trace};
use url::Url;

pub const CMUX_PORT_HEADER: &str = "x-cmux-port-internal";
pub const CMUX_WORKSPACE_HEADER: &str = "x-cmux-workspace-internal";

#[derive(Debug, Clone)]
pub struct RouteTarget {
    pub addr: SocketAddr,
    pub host: String,
    pub use_tls: bool,
    pub preserve_host: bool,
}

#[derive(Debug)]
pub struct Router {
    config: super::config::ProxyConfig,
}

impl Router {
    pub fn new(config: super::config::ProxyConfig) -> Self {
        Self { config }
    }

    /// Parse routing information from request headers and host
    pub fn route_from_headers(&self, headers: &HeaderMap, uri: &http::Uri) -> Result<RouteTarget> {
        trace!("Routing request: {:?}", uri);

        // Check for explicit port header (highest priority)
        if let Some(port_header) = headers.get(CMUX_PORT_HEADER) {
            let port = port_header
                .to_str()?
                .parse::<u16>()
                .map_err(|e| anyhow!("Invalid port in header: {}", e))?;

            // Check for workspace header for isolation
            let host = if self.config.workspace_isolation {
                if let Some(workspace_header) = headers.get(CMUX_WORKSPACE_HEADER) {
                    let workspace = workspace_header.to_str()?;
                    self.config.get_workspace_ip(&workspace)
                } else {
                    "127.0.0.1".to_string()
                }
            } else {
                "127.0.0.1".to_string()
            };

            debug!("Routing via header to {}:{}", host, port);
            return Ok(RouteTarget {
                addr: (host.parse::<std::net::IpAddr>()?, port).into(),
                host: host.clone(),
                use_tls: false,
                preserve_host: false,
            });
        }

        // Parse from Host header (container.port.localhost:proxyPort pattern)
        if let Some(host_header) = headers.get("host") {
            let host_str = host_header.to_str()?;
            if let Some(route) = self.parse_container_route(host_str)? {
                debug!("Routing via host pattern to {:?}", route);
                return Ok(route);
            }
        }

        // Parse from URI if absolute
        if let Some(host) = uri.host() {
            if let Some(route) = self.parse_container_route(host)? {
                debug!("Routing via URI to {:?}", route);
                return Ok(route);
            }
        }

        Err(anyhow!("No valid routing information found in request"))
    }

    /// Parse container.port.localhost pattern
    fn parse_container_route(&self, host: &str) -> Result<Option<RouteTarget>> {
        // Remove port suffix if present (e.g., container.port.localhost:9776 -> container.port.localhost)
        let host_without_port = host.split(':').next().unwrap_or(host);

        // Check for container.port.localhost pattern
        let parts: Vec<&str> = host_without_port.split('.').collect();
        if parts.len() >= 3 && parts[parts.len() - 1] == "localhost" {
            // Extract container name and port
            let port_str = parts[parts.len() - 2];
            let container_parts = &parts[..parts.len() - 2];
            let container_name = container_parts.join(".");

            // Try to parse port
            if let Ok(port) = port_str.parse::<u16>() {
                // Check cache first
                let cache_key = format!("{}.{}", container_name, port);
                if let Some(cached_port) = self.config.get_cached_port(&cache_key) {
                    return Ok(Some(RouteTarget {
                        addr: ([127, 0, 0, 1], cached_port).into(),
                        host: "127.0.0.1".to_string(),
                        use_tls: false,
                        preserve_host: true,
                    }));
                }

                // For now, return the port directly (Docker port lookup would go here)
                // In production, this would query Docker API for actual mapped port
                let target_port = self.resolve_docker_port(&container_name, port)?;

                // Cache the result
                self.config.cache_port_mapping(cache_key, target_port);

                return Ok(Some(RouteTarget {
                    addr: ([127, 0, 0, 1], target_port).into(),
                    host: "127.0.0.1".to_string(),
                    use_tls: false,
                    preserve_host: true,
                }));
            }
        }

        // Check for cmux domain patterns (cmux.local, cmux.sh, etc.)
        if host_without_port.ends_with(".cmux.local")
            || host_without_port.ends_with(".cmux.sh")
            || host_without_port.ends_with(".cmux.dev") {
            // Extract subdomain for routing
            if let Some(subdomain) = host_without_port.split('.').next() {
                if let Ok(port) = subdomain.parse::<u16>() {
                    return Ok(Some(RouteTarget {
                        addr: ([127, 0, 0, 1], port).into(),
                        host: "127.0.0.1".to_string(),
                        use_tls: false,
                        preserve_host: true,
                    }));
                }
            }
        }

        Ok(None)
    }

    /// Resolve Docker container port (placeholder - would integrate with Docker API)
    fn resolve_docker_port(&self, _container_name: &str, internal_port: u16) -> Result<u16> {
        // This is a placeholder - in production, this would:
        // 1. Query Docker API for container info
        // 2. Find the mapped external port for the internal port
        // 3. Return the actual external port

        // For now, check if it's a known service port
        if let Some(service_name) = self.config.get_known_port_name(internal_port) {
            debug!("Resolved known service: {} -> port {}", service_name, internal_port);
        }

        // Return the port as-is for now (would be replaced with actual Docker lookup)
        Ok(internal_port)
    }

    /// Create upstream URL from target
    pub fn create_upstream_url(&self, target: &RouteTarget, original_path: &str) -> Result<Url> {
        let scheme = if target.use_tls { "https" } else { "http" };
        let url_str = format!("{}://{}:{}{}", scheme, target.host, target.addr.port(), original_path);
        Ok(Url::parse(&url_str)?)
    }
}