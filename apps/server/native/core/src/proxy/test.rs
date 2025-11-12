#[cfg(test)]
mod tests {
    use super::super::*;
    use tokio::time::{sleep, Duration};

    #[tokio::test]
    async fn test_proxy_config_creation() {
        let opts = types::ProxyOptions {
            listen_port: 9090,
            enable_http2: Some(true),
            enable_websockets: Some(true),
            max_connections: Some(100),
            idle_timeout_ms: Some(60000),
            keepalive_ms: Some(15000),
            header_routing_enabled: Some(true),
            workspace_isolation: Some(false),
        };

        let config = ProxyConfig::from_options(opts);
        assert_eq!(config.listen_addr.port(), 9090);
        assert!(config.enable_http2);
        assert!(config.enable_websockets);
        assert_eq!(config.max_connections, 100);
    }

    #[tokio::test]
    async fn test_workspace_ip_generation() {
        let opts = types::ProxyOptions {
            listen_port: 9091,
            enable_http2: None,
            enable_websockets: None,
            max_connections: None,
            idle_timeout_ms: None,
            keepalive_ms: None,
            header_routing_enabled: None,
            workspace_isolation: Some(true),
        };

        let config = ProxyConfig::from_options(opts);

        // Test workspace IP generation
        let ip1 = config.get_workspace_ip("workspace-1");
        assert_eq!(ip1, "127.18.0.1");

        let ip256 = config.get_workspace_ip("workspace-256");
        assert_eq!(ip256, "127.18.1.0");

        // Test caching
        let ip1_again = config.get_workspace_ip("workspace-1");
        assert_eq!(ip1_again, "127.18.0.1");
    }

    #[tokio::test]
    async fn test_port_caching() {
        let opts = types::ProxyOptions {
            listen_port: 9092,
            enable_http2: None,
            enable_websockets: None,
            max_connections: None,
            idle_timeout_ms: None,
            keepalive_ms: None,
            header_routing_enabled: None,
            workspace_isolation: None,
        };

        let config = ProxyConfig::from_options(opts);

        // Cache a port
        config.cache_port_mapping("container1.8080".to_string(), 32768);

        // Retrieve immediately (should be cached)
        let cached = config.get_cached_port("container1.8080");
        assert_eq!(cached, Some(32768));

        // Wait for cache to expire
        sleep(Duration::from_secs(3)).await;
        let expired = config.get_cached_port("container1.8080");
        assert_eq!(expired, None);
    }

    #[test]
    fn test_known_ports() {
        let opts = types::ProxyOptions {
            listen_port: 9093,
            enable_http2: None,
            enable_websockets: None,
            max_connections: None,
            idle_timeout_ms: None,
            keepalive_ms: None,
            header_routing_enabled: None,
            workspace_isolation: None,
        };

        let config = ProxyConfig::from_options(opts);

        assert_eq!(config.get_known_port_name(39378), Some("vscode"));
        assert_eq!(config.get_known_port_name(39377), Some("worker"));
        assert_eq!(config.get_known_port_name(39376), Some("extension"));
        assert_eq!(config.get_known_port_name(39379), Some("proxy"));
        assert_eq!(config.get_known_port_name(39380), Some("vnc"));
        assert_eq!(config.get_known_port_name(39381), Some("cdp"));
        assert_eq!(config.get_known_port_name(12345), None);
    }

    #[test]
    fn test_route_parsing() {
        let opts = types::ProxyOptions {
            listen_port: 9094,
            enable_http2: None,
            enable_websockets: None,
            max_connections: None,
            idle_timeout_ms: None,
            keepalive_ms: None,
            header_routing_enabled: Some(true),
            workspace_isolation: None,
        };

        let config = ProxyConfig::from_options(opts);
        let router = router::Router::new(config);

        // Test header-based routing
        let mut headers = http::HeaderMap::new();
        headers.insert("x-cmux-port-internal", "8080".parse().unwrap());

        let uri: http::Uri = "/test/path".parse().unwrap();
        let route = router.route_from_headers(&headers, &uri);

        assert!(route.is_ok());
        let target = route.unwrap();
        assert_eq!(target.addr.port(), 8080);
        assert_eq!(target.host, "127.0.0.1");
        assert!(!target.use_tls);
    }

    #[test]
    fn test_websocket_detection() {
        // Test valid WebSocket upgrade
        let mut headers = http::HeaderMap::new();
        headers.insert("upgrade", "websocket".parse().unwrap());
        headers.insert("connection", "Upgrade".parse().unwrap());

        assert!(websocket::WebSocketHandler::is_websocket_upgrade(&headers));

        // Test invalid WebSocket upgrade (missing connection header)
        let mut headers2 = http::HeaderMap::new();
        headers2.insert("upgrade", "websocket".parse().unwrap());

        assert!(!websocket::WebSocketHandler::is_websocket_upgrade(&headers2));

        // Test Socket.IO detection
        assert!(websocket::WebSocketHandler::is_socketio_request("/socket.io/test"));
        assert!(!websocket::WebSocketHandler::is_socketio_request("/api/test"));
    }
}