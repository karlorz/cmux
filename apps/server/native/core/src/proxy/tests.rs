#[cfg(test)]
mod tests {
    use super::super::server::ProxyServer;
    use super::super::auth::{generate_credentials, validate_basic_auth};
    use super::super::routing::{is_loopback_hostname, Route};
    use http::HeaderMap;

    #[test]
    fn test_generate_credentials() {
        let (username1, password1) = generate_credentials(123);
        let (username2, password2) = generate_credentials(123);

        // Should be different each time (random)
        assert_ne!(username1, username2);
        assert_ne!(password1, password2);

        // Username should contain web contents ID
        assert!(username1.starts_with("wc-123-"));

        // Password should be 24 chars (12 bytes * 2 hex)
        assert_eq!(password1.len(), 24);
    }

    #[test]
    fn test_validate_basic_auth() {
        let mut headers = HeaderMap::new();
        
        // Encode "testuser:testpass" as base64
        let encoded = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            "testuser:testpass"
        );
        headers.insert(
            "proxy-authorization",
            format!("Basic {}", encoded).parse().unwrap()
        );

        assert!(validate_basic_auth(&headers, "testuser", "testpass"));
        assert!(!validate_basic_auth(&headers, "wrong", "testpass"));
        assert!(!validate_basic_auth(&headers, "testuser", "wrong"));
    }

    #[test]
    fn test_is_loopback() {
        assert!(is_loopback_hostname("localhost"));
        assert!(is_loopback_hostname("127.0.0.1"));
        assert!(is_loopback_hostname("127.18.1.5"));
        assert!(is_loopback_hostname("::1"));
        assert!(is_loopback_hostname("[::1]"));

        assert!(!is_loopback_hostname("example.com"));
        assert!(!is_loopback_hostname("192.168.1.1"));
        assert!(!is_loopback_hostname("cmux.app"));
    }

    #[tokio::test]
    async fn test_proxy_server_start() {
        // Test that we can start a server
        let result = ProxyServer::start("127.0.0.1:0".to_string(), false).await;
        assert!(result.is_ok(), "Failed to start proxy server");

        let server = result.unwrap();
        let port = server.port();
        assert!(port > 0, "Port should be assigned");

        // Cleanup
        server.stop();
    }

    #[tokio::test]
    async fn test_proxy_server_create_context() {
        let server = ProxyServer::start("127.0.0.1:0".to_string(), false)
            .await
            .unwrap();

        let route = Route {
            morph_id: "test-id".to_string(),
            scope: "base".to_string(),
            domain_suffix: "cmux.app".to_string(),
        };

        let context = server.create_context(123, Some(route));

        assert_eq!(context.web_contents_id, 123);
        assert!(!context.username.is_empty());
        assert!(!context.password.is_empty());
        assert!(!context.id.is_empty());

        // Release context
        server.release_context(&context.id);

        server.stop();
    }
}
