use super::auth::{generate_credentials, validate_basic_auth};
use super::routing::{rewrite_url_if_needed, Route};
use bytes::Bytes;
use http::{Method, Request, Response, StatusCode};
use http_body_util::{BodyExt, Empty, Full};
use hyper::body::Incoming;
use hyper::server::conn::{http1, http2};
use hyper::service::service_fn;
use hyper_util::client::legacy::Client;
use hyper_util::rt::{TokioExecutor, TokioIo};
use parking_lot::RwLock;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Notify;
use tracing::{debug, error, info, warn};

type BoxBody = http_body_util::combinators::BoxBody<Bytes, Box<dyn std::error::Error + Send + Sync>>;

#[derive(Clone, Debug)]
pub struct ProxyContext {
    pub id: String,
    pub username: String,
    pub password: String,
    pub web_contents_id: u32,
    #[allow(dead_code)]
    pub route: Option<Route>,
}

struct InternalContext {
    username: String,
    password: String,
    web_contents_id: u32,
    route: Option<Route>,
}

pub struct ProxyServer {
    port: u16,
    contexts: Arc<RwLock<HashMap<String, InternalContext>>>,
    contexts_by_username: Arc<RwLock<HashMap<String, String>>>,
    shutdown: Arc<Notify>,
    http_client: Client<hyper_util::client::legacy::connect::HttpConnector, BoxBody>,
}

impl ProxyServer {
    pub async fn start(listen_addr: String, enable_http2: bool) -> Result<Self, String> {
        let addr: SocketAddr = listen_addr
            .parse()
            .map_err(|e| format!("Invalid listen addr: {}", e))?;

        let listener = TcpListener::bind(addr)
            .await
            .map_err(|e| format!("Failed to bind: {}", e))?;

        let port = listener
            .local_addr()
            .map_err(|e| format!("Failed to get local addr: {}", e))?
            .port();

        info!("Proxy server listening on {}", addr);

        // Create HTTP client for forwarding requests
        let http_client = Client::builder(TokioExecutor::new()).build_http();

        let contexts = Arc::new(RwLock::new(HashMap::new()));
        let contexts_by_username = Arc::new(RwLock::new(HashMap::new()));
        let shutdown = Arc::new(Notify::new());

        let server_contexts = contexts.clone();
        let server_contexts_by_username = contexts_by_username.clone();
        let server_shutdown = shutdown.clone();
        let server_http_client = http_client.clone();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    result = listener.accept() => {
                        match result {
                            Ok((stream, addr)) => {
                                debug!("Accepted connection from {}", addr);

                                let contexts = server_contexts.clone();
                                let contexts_by_username = server_contexts_by_username.clone();
                                let http_client = server_http_client.clone();

                                tokio::spawn(async move {
                                    if let Err(e) = handle_connection(
                                        stream,
                                        addr,
                                        contexts,
                                        contexts_by_username,
                                        enable_http2,
                                        http_client,
                                    )
                                    .await
                                    {
                                        error!("Connection error: {}", e);
                                    }
                                });
                            }
                            Err(e) => {
                                error!("Failed to accept connection: {}", e);
                            }
                        }
                    }
                    _ = server_shutdown.notified() => {
                        info!("Proxy server shutting down");
                        break;
                    }
                }
            }
        });

        Ok(Self {
            port,
            contexts,
            contexts_by_username,
            shutdown,
            http_client,
        })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn create_context(
        &self,
        web_contents_id: u32,
        route: Option<Route>,
    ) -> ProxyContext {
        let (username, password) = generate_credentials(web_contents_id);
        let context_id = format!("ctx-{}-{}", web_contents_id, rand::random::<u64>());

        let internal_ctx = InternalContext {
            username: username.clone(),
            password: password.clone(),
            web_contents_id,
            route: route.clone(),
        };

        self.contexts
            .write()
            .insert(context_id.clone(), internal_ctx);
        self.contexts_by_username
            .write()
            .insert(username.clone(), context_id.clone());

        info!(
            "Created context {} for WebContents {}",
            context_id, web_contents_id
        );

        ProxyContext {
            id: context_id,
            username,
            password,
            web_contents_id,
            route,
        }
    }

    pub fn release_context(&self, context_id: &str) {
        if let Some(ctx) = self.contexts.write().remove(context_id) {
            self.contexts_by_username.write().remove(&ctx.username);
            info!("Released context {}", context_id);
        }
    }

    pub fn stop(&self) {
        self.shutdown.notify_waiters();
    }
}

async fn handle_connection(
    stream: TcpStream,
    addr: SocketAddr,
    contexts: Arc<RwLock<HashMap<String, InternalContext>>>,
    contexts_by_username: Arc<RwLock<HashMap<String, String>>>,
    enable_http2: bool,
    http_client: Client<hyper_util::client::legacy::connect::HttpConnector, BoxBody>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let io = TokioIo::new(stream);

    let service = service_fn(move |req| {
        handle_request(
            req,
            addr,
            contexts.clone(),
            contexts_by_username.clone(),
            http_client.clone(),
        )
    });

    if enable_http2 {
        http2::Builder::new(TokioExecutor::new())
            .serve_connection(io, service)
            .await?;
    } else {
        http1::Builder::new()
            .serve_connection(io, service)
            .with_upgrades()
            .await?;
    }

    Ok(())
}

async fn handle_request(
    req: Request<Incoming>,
    addr: SocketAddr,
    contexts: Arc<RwLock<HashMap<String, InternalContext>>>,
    contexts_by_username: Arc<RwLock<HashMap<String, String>>>,
    http_client: Client<hyper_util::client::legacy::connect::HttpConnector, BoxBody>,
) -> Result<Response<BoxBody>, Box<dyn std::error::Error + Send + Sync>> {
    debug!(
        "Request: {} {} from {}",
        req.method(),
        req.uri(),
        addr
    );

    // Authenticate
    let context = match authenticate_request(&req, &contexts, &contexts_by_username) {
        Some(ctx) => ctx,
        None => {
            return Ok(proxy_auth_required_response());
        }
    };

    // Handle based on method and upgrade
    match req.method() {
        &Method::CONNECT => handle_connect(req, context).await,
        _ if is_upgrade_request(&req) => handle_upgrade(req, context).await,
        _ => handle_http(req, context, http_client).await,
    }
}

fn authenticate_request(
    req: &Request<Incoming>,
    contexts: &Arc<RwLock<HashMap<String, InternalContext>>>,
    contexts_by_username: &Arc<RwLock<HashMap<String, String>>>,
) -> Option<InternalContext> {
    let auth_header = req.headers().get("proxy-authorization")?;
    let auth_str = auth_header.to_str().ok()?;

    let encoded = auth_str.strip_prefix("Basic ")?;
    let decoded = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        encoded,
    )
    .ok()?;
    let decoded_str = String::from_utf8(decoded).ok()?;
    let username = decoded_str.split(':').next()?;

    let context_id = contexts_by_username.read().get(username)?.clone();
    let context = contexts.read().get(&context_id)?.clone();

    if validate_basic_auth(req.headers(), &context.username, &context.password) {
        Some(context)
    } else {
        None
    }
}

impl Clone for InternalContext {
    fn clone(&self) -> Self {
        Self {
            username: self.username.clone(),
            password: self.password.clone(),
            web_contents_id: self.web_contents_id,
            route: self.route.clone(),
        }
    }
}

fn is_upgrade_request(req: &Request<Incoming>) -> bool {
    req.headers()
        .get("connection")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_lowercase().contains("upgrade"))
        .unwrap_or(false)
        && req.headers().contains_key("upgrade")
}

fn proxy_auth_required_response() -> Response<BoxBody> {
    Response::builder()
        .status(StatusCode::PROXY_AUTHENTICATION_REQUIRED)
        .header(
            "proxy-authenticate",
            "Basic realm=\"Cmux Preview Proxy\"",
        )
        .body(boxed_body(Full::new(Bytes::from(
            "Proxy Authentication Required",
        ))))
        .unwrap()
}

async fn handle_http(
    req: Request<Incoming>,
    context: InternalContext,
    http_client: Client<hyper_util::client::legacy::connect::HttpConnector, BoxBody>,
) -> Result<Response<BoxBody>, Box<dyn std::error::Error + Send + Sync>> {
    let uri = req.uri().clone();
    let rewritten_uri = rewrite_url_if_needed(&uri, context.route.as_ref())?;

    info!(
        "HTTP {} {} -> {} (WebContents {})",
        req.method(),
        uri,
        rewritten_uri,
        context.web_contents_id
    );

    // Convert request
    let (parts, incoming) = req.into_parts();
    let mut new_parts = parts.clone();
    new_parts.uri = rewritten_uri;

    // Remove proxy headers
    new_parts.headers.remove("proxy-authorization");

    let body = boxed_body(incoming);
    let upstream_req = Request::from_parts(new_parts, body);

    // Forward to upstream
    match http_client.request(upstream_req).await {
        Ok(upstream_resp) => {
            // Convert response
            let (parts, incoming) = upstream_resp.into_parts();
            let body = boxed_body(incoming);
            Ok(Response::from_parts(parts, body))
        }
        Err(e) => {
            warn!("HTTP upstream error: {}", e);
            Ok(Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(boxed_body(Full::new(Bytes::from(format!(
                    "Bad Gateway: {}",
                    e
                )))))
                .unwrap())
        }
    }
}

async fn handle_connect(
    mut req: Request<Incoming>,
    context: InternalContext,
) -> Result<Response<BoxBody>, Box<dyn std::error::Error + Send + Sync>> {
    let target = req.uri().to_string();
    info!(
        "CONNECT {} (WebContents {})",
        target, context.web_contents_id
    );

    // Parse host:port
    let parts: Vec<&str> = target.split(':').collect();
    if parts.len() != 2 {
        return Ok(Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(empty_body())
            .unwrap());
    }

    let host = parts[0];
    let port: u16 = parts[1].parse().map_err(|_| "Invalid port")?;

    // Connect to target
    let mut upstream = TcpStream::connect((host, port)).await?;

    // Return 200 Connection Established
    tokio::spawn(async move {
        match hyper::upgrade::on(&mut req).await {
            Ok(client_upgraded) => {
                if let Err(e) = tokio::io::copy_bidirectional(&mut TokioIo::new(client_upgraded), &mut upstream).await {
                    warn!("CONNECT tunnel error: {}", e);
                }
            }
            Err(e) => {
                error!("CONNECT upgrade error: {}", e);
            }
        }
    });

    Ok(Response::builder()
        .status(StatusCode::OK)
        .body(empty_body())
        .unwrap())
}

async fn handle_upgrade(
    mut req: Request<Incoming>,
    context: InternalContext,
) -> Result<Response<BoxBody>, Box<dyn std::error::Error + Send + Sync>> {
    let uri = req.uri().clone();
    let rewritten_uri = rewrite_url_if_needed(&uri, context.route.as_ref())?;

    info!(
        "WebSocket upgrade {} -> {} (WebContents {})",
        uri, rewritten_uri, context.web_contents_id
    );

    let target_host = rewritten_uri
        .host()
        .ok_or("No host in rewritten URI")?;
    let target_port = rewritten_uri.port_u16().unwrap_or_else(|| {
        if rewritten_uri.scheme_str() == Some("wss") || rewritten_uri.scheme_str() == Some("https") {
            443
        } else {
            80
        }
    });

    // Connect to upstream
    let mut upstream = TcpStream::connect((target_host, target_port)).await?;

    // Build WebSocket upgrade request
    let mut upstream_req = Vec::new();
    let path = rewritten_uri
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");

    upstream_req.extend_from_slice(format!("GET {} HTTP/1.1\r\n", path).as_bytes());
    upstream_req.extend_from_slice(format!("Host: {}\r\n", target_host).as_bytes());

    // Copy upgrade headers
    for (name, value) in req.headers() {
        let name_str = name.as_str().to_lowercase();
        if name_str == "proxy-authorization" || name_str == "host" {
            continue;
        }
        upstream_req.extend_from_slice(name.as_str().as_bytes());
        upstream_req.extend_from_slice(b": ");
        upstream_req.extend_from_slice(value.as_bytes());
        upstream_req.extend_from_slice(b"\r\n");
    }

    upstream_req.extend_from_slice(b"\r\n");

    // Return 101 and spawn tunnel
    tokio::spawn(async move {
        match hyper::upgrade::on(&mut req).await {
            Ok(client_upgraded) => {
                // Send upgrade request to upstream
                if let Err(e) = upstream.write_all(&upstream_req).await {
                    error!("Failed to send upgrade request: {}", e);
                    return;
                }

                // TODO: Read and verify 101 response from upstream
                // For now, assume success and start tunneling

                if let Err(e) = tokio::io::copy_bidirectional(&mut TokioIo::new(client_upgraded), &mut upstream).await {
                    warn!("WebSocket tunnel error: {}", e);
                }
            }
            Err(e) => {
                error!("WebSocket upgrade error: {}", e);
            }
        }
    });

    Ok(Response::builder()
        .status(StatusCode::SWITCHING_PROTOCOLS)
        .header("upgrade", "websocket")
        .header("connection", "upgrade")
        .body(empty_body())
        .unwrap())
}

fn boxed_body<B>(body: B) -> BoxBody
where
    B: http_body::Body<Data = Bytes> + Send + Sync + 'static,
    B::Error: Into<Box<dyn std::error::Error + Send + Sync>>,
{
    body.map_err(|e| e.into()).boxed()
}

fn empty_body() -> BoxBody {
    boxed_body(Empty::new())
}
