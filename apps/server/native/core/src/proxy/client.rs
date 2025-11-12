use anyhow::{anyhow, Result};
use bytes::Bytes;
use http::{Request, Response, Uri, Version};
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper_rustls::{HttpsConnectorBuilder, ConfigBuilderExt};
use hyper_util::client::legacy::{Client as HyperClient, connect::HttpConnector};
use hyper_util::rt::TokioExecutor;
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, trace};
use rustls::ClientConfig;

type HttpsConnector = hyper_rustls::HttpsConnector<HttpConnector>;

pub struct ProxyClient {
    http_client: HyperClient<HttpConnector, Full<Bytes>>,
    https_client: HyperClient<HttpsConnector, Full<Bytes>>,
    config: super::config::ProxyConfig,
}

impl ProxyClient {
    pub fn new(config: super::config::ProxyConfig) -> Result<Self> {
        // Create HTTP connector with connection pooling
        let mut http_connector = HttpConnector::new();
        http_connector.set_nodelay(true);
        http_connector.set_keepalive(Some(Duration::from_millis(config.keepalive_ms as u64)));

        // Build HTTP client
        let http_client = HyperClient::builder(TokioExecutor::new())
            .pool_idle_timeout(Duration::from_millis(config.idle_timeout_ms as u64))
            .pool_max_idle_per_host(8)
            .http2_only(config.enable_http2)
            .build(http_connector);

        // Create HTTPS connector with rustls
        let tls_config = ClientConfig::builder()
            .with_native_roots()?
            .with_no_client_auth();

        let https_connector = HttpsConnectorBuilder::new()
            .with_tls_config(tls_config)
            .https_or_http()
            .enable_all_versions()
            .build();

        // Build HTTPS client
        let https_client = HyperClient::builder(TokioExecutor::new())
            .pool_idle_timeout(Duration::from_millis(config.idle_timeout_ms as u64))
            .pool_max_idle_per_host(8)
            .http2_only(config.enable_http2)
            .build(https_connector);

        Ok(Self {
            http_client,
            https_client,
            config,
        })
    }

    /// Forward HTTP request to upstream
    pub async fn forward_request(
        &self,
        mut req: Request<Incoming>,
        target: &super::router::RouteTarget,
    ) -> Result<Response<Incoming>> {
        debug!("Forwarding request to {:?}", target);

        // Build upstream URI
        let upstream_url = self.build_upstream_url(req.uri(), target)?;
        *req.uri_mut() = upstream_url.clone();

        // Modify headers for proxying
        self.modify_request_headers(req.headers_mut(), target);

        // For now, return an error to simplify the implementation
        // In production, we'd properly forward the request with streaming
        Err(anyhow!("Request forwarding needs proper implementation with streaming"))
    }

    /// Forward HTTP/2 request
    pub async fn forward_h2_request(
        &self,
        mut req: Request<Incoming>,
        target: &super::router::RouteTarget,
    ) -> Result<Response<Incoming>> {
        trace!("Forwarding HTTP/2 request to {:?}", target);

        // Ensure we're using HTTP/2
        *req.version_mut() = Version::HTTP_2;

        // Forward the request
        self.forward_request(req, target).await
    }

    /// Build upstream URL from original URI and target
    fn build_upstream_url(&self, original_uri: &Uri, target: &super::router::RouteTarget) -> Result<Uri> {
        let scheme = if target.use_tls { "https" } else { "http" };
        let authority = format!("{}:{}", target.host, target.addr.port());

        let path_and_query = original_uri
            .path_and_query()
            .map(|pq| pq.as_str())
            .unwrap_or("/");

        let uri_string = format!("{}://{}{}", scheme, authority, path_and_query);
        Uri::try_from(uri_string).map_err(|e| anyhow!("Failed to build upstream URI: {}", e))
    }

    /// Modify request headers for proxying
    fn modify_request_headers(&self, headers: &mut http::HeaderMap, target: &super::router::RouteTarget) {
        // Remove hop-by-hop headers
        headers.remove("connection");
        headers.remove("keep-alive");
        headers.remove("proxy-authenticate");
        headers.remove("proxy-authorization");
        headers.remove("te");
        headers.remove("trailers");
        headers.remove("transfer-encoding");
        headers.remove("upgrade");

        // Update Host header if needed
        if !target.preserve_host {
            headers.insert(
                "host",
                format!("{}:{}", target.host, target.addr.port())
                    .parse()
                    .unwrap_or_else(|_| http::HeaderValue::from_static("localhost")),
            );
        }

        // Add X-Forwarded headers
        if let Ok(forwarded_for) = headers.get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("127.0.0.1")
            .parse()
        {
            headers.insert("x-forwarded-for", forwarded_for);
        }

        headers.insert(
            "x-forwarded-proto",
            if target.use_tls {
                http::HeaderValue::from_static("https")
            } else {
                http::HeaderValue::from_static("http")
            },
        );

        // Remove internal routing headers
        headers.remove("x-cmux-port-internal");
        headers.remove("x-cmux-workspace-internal");
    }

    /// Check if we should use HTTP/2 for this request
    pub fn should_use_h2(&self, version: Version) -> bool {
        self.config.enable_http2 && version == Version::HTTP_2
    }
}