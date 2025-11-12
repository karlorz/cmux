use anyhow::{anyhow, Result};
use futures_util::{SinkExt, StreamExt};
use http::{HeaderMap, Request, Response, StatusCode};
use hyper::body::Incoming;
use hyper_util::rt::TokioIo;
use tokio::net::TcpStream;
use tokio_tungstenite::{
    accept_async, connect_async, tungstenite::Message, MaybeTlsStream, WebSocketStream,
};
use tracing::{debug, error, info, trace, warn};
use std::time::Duration;

pub struct WebSocketHandler {
    config: super::config::ProxyConfig,
}

impl WebSocketHandler {
    pub fn new(config: super::config::ProxyConfig) -> Self {
        Self { config }
    }

    /// Check if request is a WebSocket upgrade
    pub fn is_websocket_upgrade(headers: &HeaderMap) -> bool {
        headers
            .get("upgrade")
            .and_then(|v| v.to_str().ok())
            .map(|v| v.to_lowercase() == "websocket")
            .unwrap_or(false)
            && headers
                .get("connection")
                .and_then(|v| v.to_str().ok())
                .map(|v| v.to_lowercase().contains("upgrade"))
                .unwrap_or(false)
    }

    /// Handle WebSocket upgrade for HTTP/1.1
    pub async fn handle_websocket_upgrade(
        &self,
        req: Request<Incoming>,
        target: &super::router::RouteTarget,
    ) -> Result<Response<http_body_util::Full<bytes::Bytes>>> {
        info!("Handling WebSocket upgrade to {:?}", target);

        // Extract WebSocket key
        let ws_key = req
            .headers()
            .get("sec-websocket-key")
            .ok_or_else(|| anyhow!("Missing Sec-WebSocket-Key header"))?
            .to_str()?
            .to_string();

        // Connect to upstream
        let upstream_addr = target.addr;
        let upstream_stream = TcpStream::connect(upstream_addr).await?;

        // Build upstream request
        let upstream_uri = format!(
            "ws://{}:{}{}",
            target.host,
            target.addr.port(),
            req.uri().path_and_query().map(|pq| pq.as_str()).unwrap_or("/")
        );

        // Forward the upgrade request to upstream
        let (upstream_ws, _) = connect_async(upstream_uri).await?;

        // Accept the client WebSocket connection
        // Note: In production, we'd need to handle the actual HTTP upgrade response
        // For now, we'll create a simple upgrade response
        let response = Response::builder()
            .status(StatusCode::SWITCHING_PROTOCOLS)
            .header("upgrade", "websocket")
            .header("connection", "upgrade")
            .header("sec-websocket-accept", self.calculate_accept_key(&ws_key))
            .body(http_body_util::Full::new(bytes::Bytes::new()))?;

        // Spawn a task to proxy WebSocket messages
        let config = self.config.clone();
        tokio::spawn(async move {
            if let Err(e) = Self::proxy_websocket_messages(upstream_ws, config).await {
                error!("WebSocket proxy error: {}", e);
            }
        });

        Ok(response)
    }

    /// Handle WebSocket over HTTP/2 (RFC 8441)
    pub async fn handle_h2_websocket(
        &self,
        req: Request<Incoming>,
        target: &super::router::RouteTarget,
    ) -> Result<Response<http_body_util::Full<bytes::Bytes>>> {
        // HTTP/2 WebSocket uses CONNECT method with :protocol = websocket
        if req.method() != http::Method::CONNECT {
            return Err(anyhow!("HTTP/2 WebSocket requires CONNECT method"));
        }

        let protocol = req
            .headers()
            .get(":protocol")
            .and_then(|v| v.to_str().ok());

        if protocol != Some("websocket") {
            return Err(anyhow!("Missing or invalid :protocol header for HTTP/2 WebSocket"));
        }

        info!("Handling HTTP/2 WebSocket to {:?}", target);

        // Connect to upstream
        let upstream_addr = target.addr;
        let upstream_stream = TcpStream::connect(upstream_addr).await?;

        // For HTTP/2 WebSocket, we need to establish a tunnel
        // The response indicates successful tunnel establishment
        let response = Response::builder()
            .status(StatusCode::OK)
            .body(http_body_util::Full::new(bytes::Bytes::new()))?;

        // Set up bidirectional proxy
        let config = self.config.clone();
        tokio::spawn(async move {
            if let Err(e) = Self::proxy_h2_websocket_tunnel(upstream_stream, config).await {
                error!("HTTP/2 WebSocket tunnel error: {}", e);
            }
        });

        Ok(response)
    }

    /// Proxy WebSocket messages between client and upstream
    async fn proxy_websocket_messages(
        mut upstream: WebSocketStream<MaybeTlsStream<TcpStream>>,
        config: super::config::ProxyConfig,
    ) -> Result<()> {
        let keepalive_interval = Duration::from_millis(config.keepalive_ms as u64);
        let mut keepalive = tokio::time::interval(keepalive_interval);

        loop {
            tokio::select! {
                // Handle keepalive
                _ = keepalive.tick() => {
                    trace!("Sending WebSocket keepalive ping");
                    upstream.send(Message::Ping(vec![])).await?;
                }

                // Handle upstream messages
                msg = upstream.next() => {
                    match msg {
                        Some(Ok(msg)) => {
                            trace!("Received WebSocket message: {:?}", msg);
                            // In production, we'd forward this to the client
                            // For now, just handle protocol messages
                            match msg {
                                Message::Close(_) => {
                                    info!("WebSocket connection closed by upstream");
                                    break;
                                }
                                Message::Ping(data) => {
                                    upstream.send(Message::Pong(data)).await?;
                                }
                                _ => {
                                    // Forward to client (placeholder)
                                }
                            }
                        }
                        Some(Err(e)) => {
                            error!("WebSocket error: {}", e);
                            break;
                        }
                        None => {
                            info!("WebSocket stream ended");
                            break;
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Proxy HTTP/2 WebSocket tunnel
    async fn proxy_h2_websocket_tunnel(
        upstream: TcpStream,
        config: super::config::ProxyConfig,
    ) -> Result<()> {
        // For HTTP/2 WebSocket, we establish a bidirectional byte stream tunnel
        // This is simpler than HTTP/1.1 WebSocket as it doesn't require frame parsing

        let idle_timeout = Duration::from_millis(config.idle_timeout_ms as u64);
        let mut buffer = vec![0u8; 65536];

        loop {
            tokio::select! {
                // Set idle timeout
                _ = tokio::time::sleep(idle_timeout) => {
                    warn!("HTTP/2 WebSocket tunnel idle timeout");
                    break;
                }

                // Read from upstream and forward
                result = upstream.readable() => {
                    result?;
                    match upstream.try_read(&mut buffer) {
                        Ok(0) => {
                            info!("HTTP/2 tunnel closed by upstream");
                            break;
                        }
                        Ok(n) => {
                            trace!("Forwarding {} bytes from upstream", n);
                            // In production, write to client stream
                        }
                        Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            continue;
                        }
                        Err(e) => {
                            error!("Failed to read from upstream: {}", e);
                            break;
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Calculate WebSocket accept key from client key
    fn calculate_accept_key(&self, key: &str) -> String {
        use sha1::{Sha1, Digest};
        use base64::{engine::general_purpose::STANDARD, Engine};

        const WS_GUID: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

        let mut hasher = Sha1::new();
        hasher.update(key.as_bytes());
        hasher.update(WS_GUID.as_bytes());
        let result = hasher.finalize();

        STANDARD.encode(&result)
    }

    /// Check for Socket.IO path (to pass through to Socket.IO handler)
    pub fn is_socketio_request(path: &str) -> bool {
        path.starts_with("/socket.io/")
    }
}