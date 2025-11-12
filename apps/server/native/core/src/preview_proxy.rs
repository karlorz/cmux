#![allow(dead_code)]

use std::{
    convert::Infallible,
    io::ErrorKind,
    net::{Ipv4Addr, SocketAddr},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use base64::engine::general_purpose::STANDARD as BASE64_ENGINE;
use base64::Engine;
use dashmap::DashMap;
use http::{
    header::{HeaderValue, CONNECTION, HOST, PROXY_AUTHORIZATION, UPGRADE},
    HeaderMap, Method, Request, Response, StatusCode, Uri, Version,
};
use hyper::{
    body::Body,
    client::{Client, HttpConnector},
    server::conn::AddrStream,
    service::{make_service_fn, service_fn},
};
use hyper_rustls::HttpsConnectorBuilder;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use once_cell::sync::Lazy;
use tokio::task::JoinHandle;
use tokio::{
    io::{copy_bidirectional, AsyncWriteExt},
    net::TcpStream,
    sync::{oneshot, Mutex},
};

type HttpsClient = Client<hyper_rustls::HttpsConnector<HttpConnector>, Body>;
type ProxyResult<T> = std::result::Result<T, Response<Body>>;

const DEFAULT_START_PORT: u16 = 39_385;
const DEFAULT_MAX_ATTEMPTS: u16 = 50;
const AUTH_REALM: &str = r#"Basic realm=\"Cmux Preview Proxy\""#;

static LOGGING_ENABLED: AtomicBool = AtomicBool::new(false);
static MANAGER: Lazy<PreviewProxyManager> = Lazy::new(PreviewProxyManager::new);

#[derive(Clone, Debug)]
struct ProxyRoute {
    morph_id: String,
    scope: String,
    domain_suffix: String,
}

#[derive(Clone, Debug)]
struct ProxyContext {
    username: String,
    password: String,
    route: Option<ProxyRoute>,
}

#[derive(Clone, Debug)]
struct ProxyTarget {
    scheme: TargetScheme,
    host: String,
    port: u16,
    path_and_query: String,
    requested_port: u16,
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
enum TargetScheme {
    Http,
    Https,
}

impl TargetScheme {
    fn default_port(self) -> u16 {
        match self {
            TargetScheme::Http => 80,
            TargetScheme::Https => 443,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            TargetScheme::Http => "http",
            TargetScheme::Https => "https",
        }
    }
}

struct PreviewProxyManager {
    contexts: Arc<DashMap<String, Arc<ProxyContext>>>,
    server: Mutex<Option<PreviewProxyServer>>,
    start_lock: Mutex<()>,
}

struct PreviewProxyServer {
    port: u16,
    shutdown_tx: Option<oneshot::Sender<()>>,
    task: JoinHandle<()>,
}

struct ProxyServerState {
    contexts: Arc<DashMap<String, Arc<ProxyContext>>>,
    client: HttpsClient,
}

#[napi(object)]
pub struct PreviewProxyStartOptions {
    pub start_port: Option<u16>,
    pub max_attempts: Option<u16>,
}

#[napi(object)]
pub struct PreviewProxyRouteInput {
    pub morph_id: String,
    pub scope: String,
    pub domain_suffix: String,
}

#[napi(object)]
pub struct PreviewProxyContextOptions {
    pub username: String,
    pub password: String,
    pub route: Option<PreviewProxyRouteInput>,
}

impl PreviewProxyManager {
    fn new() -> Self {
        Self {
            contexts: Arc::new(DashMap::new()),
            server: Mutex::new(None),
            start_lock: Mutex::new(()),
        }
    }

    async fn ensure_server(&self, start: u16, attempts: u16) -> Result<u16> {
        if let Some(port) = self.current_port().await {
            return Ok(port);
        }
        let _guard = self.start_lock.lock().await;
        if let Some(port) = self.current_port().await {
            return Ok(port);
        }
        let server = self.start_server(start, attempts).await?;
        let port = server.port;
        *self.server.lock().await = Some(server);
        Ok(port)
    }

    async fn current_port(&self) -> Option<u16> {
        let guard = self.server.lock().await;
        guard.as_ref().map(|s| s.port)
    }

    async fn start_server(&self, start: u16, attempts: u16) -> Result<PreviewProxyServer> {
        let https = HttpsConnectorBuilder::new()
            .with_webpki_roots()
            .https_or_http()
            .enable_http2()
            .build();

        let client = Client::builder()
            .http2_adaptive_window(true)
            .build::<_, Body>(https);

        let state = Arc::new(ProxyServerState {
            contexts: Arc::clone(&self.contexts),
            client,
        });

        for offset in 0..attempts {
            let port = start.saturating_add(offset);
            let addr = (Ipv4Addr::LOCALHOST, port).into();
            match Self::bind(addr, state.clone()).await {
                Ok(server) => {
                    log_msg(&format!("listening on {port}"));
                    return Ok(server);
                }
                Err(err) if err.kind() == ErrorKind::AddrInUse => continue,
                Err(err) => {
                    return Err(Error::from_reason(format!(
                        "failed to bind preview proxy on {port}: {err}"
                    )))
                }
            }
        }

        Err(Error::from_reason(
            "unable to find available port for preview proxy",
        ))
    }

    async fn bind(
        addr: SocketAddr,
        state: Arc<ProxyServerState>,
    ) -> std::io::Result<PreviewProxyServer> {
        let builder = hyper::Server::try_bind(&addr).map_err(|err| {
            std::io::Error::new(
                ErrorKind::Other,
                format!("failed to bind preview proxy: {err}"),
            )
        })?;
        let local_addr = builder.local_addr();
        let make_svc = make_service_fn(move |conn: &AddrStream| {
            let remote_addr = conn.remote_addr();
            let svc_state = state.clone();
            async move {
                Ok::<_, Infallible>(service_fn(move |req| {
                    proxy_request(svc_state.clone(), remote_addr, req)
                }))
            }
        });

        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let server = builder
            .http1_keepalive(true)
            .serve(make_svc)
            .with_graceful_shutdown(async move {
                let _ = shutdown_rx.await;
            });

        let task = tokio::spawn(async move {
            if let Err(err) = server.await {
                log_msg(&format!("preview proxy server error: {err}"));
            }
        });

        Ok(PreviewProxyServer {
            port: local_addr.port(),
            shutdown_tx: Some(shutdown_tx),
            task,
        })
    }
}

impl Drop for PreviewProxyServer {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
    }
}

async fn proxy_request(
    state: Arc<ProxyServerState>,
    remote_addr: SocketAddr,
    req: Request<Body>,
) -> std::result::Result<Response<Body>, Infallible> {
    let method = req.method().clone();
    let result = if method == Method::CONNECT {
        handle_connect(state.clone(), remote_addr, req).await
    } else if is_upgrade_request(&req) {
        handle_upgrade(state.clone(), remote_addr, req).await
    } else {
        handle_http(state.clone(), remote_addr, req).await
    };

    match result {
        Ok(resp) => Ok(resp),
        Err(resp) => Ok(resp),
    }
}

fn log_msg(message: &str) {
    if LOGGING_ENABLED.load(Ordering::Relaxed) {
        eprintln!("[cmux-preview-proxy] {message}");
    }
}

async fn handle_http(
    state: Arc<ProxyServerState>,
    remote_addr: SocketAddr,
    mut req: Request<Body>,
) -> ProxyResult<Response<Body>> {
    let context = authenticate(&state.contexts, req.headers())?;
    let target = parse_proxy_request_target(&req)?;
    let requested_host = target.host.clone();
    let requested_port = target.requested_port;
    let rewritten = rewrite_target(target, context.route.as_ref());
    let uri = build_upstream_uri(&rewritten)?;
    let authority = format_authority(
        &rewritten.host,
        rewritten.port,
        rewritten.scheme.default_port(),
    );
    prepare_proxy_headers(req.headers_mut(), &authority)?;
    *req.uri_mut() = uri;

    log_msg(&format!(
        "http request user={} client={} host={} port={} rewritten_host={} rewritten_port={}",
        context.username,
        remote_addr,
        requested_host,
        requested_port,
        rewritten.host,
        rewritten.port
    ));

    state
        .client
        .request(req)
        .await
        .map_err(|err| bad_gateway_from_error("http", err))
}

async fn handle_upgrade(
    state: Arc<ProxyServerState>,
    remote_addr: SocketAddr,
    mut req: Request<Body>,
) -> ProxyResult<Response<Body>> {
    let context = authenticate(&state.contexts, req.headers())?;
    let target = parse_proxy_request_target(&req)?;
    let requested_host = target.host.clone();
    let requested_port = target.requested_port;
    let rewritten = rewrite_target(target, context.route.as_ref());
    let uri = build_upstream_uri(&rewritten)?;

    let authority = format_authority(
        &rewritten.host,
        rewritten.port,
        rewritten.scheme.default_port(),
    );

    let mut proxied_req = Request::builder()
        .method(req.method())
        .uri(uri)
        .version(req.version())
        .body(std::mem::replace(req.body_mut(), Body::empty()))
        .map_err(|_| internal_error("failed to build upgrade request"))?;

    copy_upgrade_headers(req.headers(), proxied_req.headers_mut(), &authority)?;

    log_msg(&format!(
        "upgrade request user={} client={} host={} requested_port={} rewritten_host={}",
        context.username, remote_addr, requested_host, requested_port, rewritten.host
    ));

    let upstream_resp = state
        .client
        .request(proxied_req)
        .await
        .map_err(|err| bad_gateway_from_error("upgrade", err))?;

    if upstream_resp.status() != StatusCode::SWITCHING_PROTOCOLS {
        return Ok(upstream_resp);
    }

    let mut client_resp_builder = Response::builder().status(StatusCode::SWITCHING_PROTOCOLS);
    {
        let headers = client_resp_builder
            .headers_mut()
            .ok_or_else(|| internal_error("missing headers for upgrade response"))?;
        for (name, value) in upstream_resp.headers().iter() {
            headers.insert(name, value.clone());
        }
        if !headers.contains_key(CONNECTION) {
            headers.insert(CONNECTION, HeaderValue::from_static("upgrade"));
        }
    }
    let client_resp = client_resp_builder
        .body(Body::empty())
        .map_err(|_| internal_error("failed to build upgrade response"))?;

    tokio::spawn(async move {
        let mut client_req = req;
        match tokio::try_join!(
            hyper::upgrade::on(&mut client_req),
            hyper::upgrade::on(upstream_resp)
        ) {
            Ok((mut client_stream, mut upstream_stream)) => {
                if let Err(err) = copy_bidirectional(&mut client_stream, &mut upstream_stream).await
                {
                    log_msg(&format!("upgrade tunnel error: {err}"));
                }
                let _ = client_stream.shutdown().await;
                let _ = upstream_stream.shutdown().await;
            }
            Err(err) => {
                log_msg(&format!("upgrade handshake failed: {err:?}"));
            }
        }
    });

    Ok(client_resp)
}

async fn handle_connect(
    state: Arc<ProxyServerState>,
    remote_addr: SocketAddr,
    mut req: Request<Body>,
) -> ProxyResult<Response<Body>> {
    let context = authenticate(&state.contexts, req.headers())?;
    let (host, port) = parse_connect_target(&req)?;
    let target = ProxyTarget {
        scheme: TargetScheme::Https,
        host,
        port,
        path_and_query: "/".to_string(),
        requested_port: port,
    };
    let requested_host = target.host.clone();
    let rewritten = rewrite_target(target, context.route.as_ref());
    let destination = format!("{}:{}", rewritten.host, rewritten.port);

    log_msg(&format!(
        "connect request user={} client={} host={} port={} rewritten_host={}",
        context.username, remote_addr, requested_host, rewritten.requested_port, rewritten.host
    ));

    let mut resp_builder = Response::builder().status(StatusCode::OK);
    if req.version() == Version::HTTP_11 {
        resp_builder = resp_builder.header(CONNECTION, HeaderValue::from_static("keep-alive"));
    }
    let resp = resp_builder
        .body(Body::empty())
        .map_err(|_| internal_error("failed to build CONNECT response"))?;

    tokio::spawn(async move {
        match hyper::upgrade::on(&mut req).await {
            Ok(mut upgraded) => match TcpStream::connect(&destination).await {
                Ok(mut upstream) => {
                    if let Err(err) = copy_bidirectional(&mut upgraded, &mut upstream).await {
                        log_msg(&format!("connect tunnel error: {err}"));
                    }
                    let _ = upgraded.shutdown().await;
                    let _ = upstream.shutdown().await;
                }
                Err(err) => {
                    log_msg(&format!("failed to connect to upstream for CONNECT: {err}"));
                    let _ = upgraded
                        .write_all(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
                        .await;
                    let _ = upgraded.shutdown().await;
                }
            },
            Err(err) => log_msg(&format!("CONNECT upgrade failed: {err:?}")),
        }
    });

    Ok(resp)
}

fn prepare_proxy_headers(headers: &mut HeaderMap, authority: &str) -> ProxyResult<()> {
    let host_value = HeaderValue::from_str(authority)
        .map_err(|_| bad_request("invalid host header for upstream"))?;
    headers.insert(HOST, host_value);
    headers.remove(PROXY_AUTHORIZATION);
    headers.remove("proxy-connection");
    Ok(())
}

fn copy_upgrade_headers(src: &HeaderMap, dest: &mut HeaderMap, authority: &str) -> ProxyResult<()> {
    for (name, value) in src.iter() {
        if name == PROXY_AUTHORIZATION {
            continue;
        }
        dest.insert(name, value.clone());
    }
    dest.insert(
        HOST,
        HeaderValue::from_str(authority)
            .map_err(|_| bad_request("invalid host header for upstream"))?,
    );
    dest.remove("proxy-connection");
    Ok(())
}

fn bad_gateway_from_error(context: &str, err: hyper::Error) -> Response<Body> {
    log_msg(&format!("{context} upstream error: {err}"));
    bad_gateway("Bad Gateway")
}

fn bad_gateway(msg: &str) -> Response<Body> {
    Response::builder()
        .status(StatusCode::BAD_GATEWAY)
        .body(Body::from(msg.to_string()))
        .unwrap()
}

fn is_upgrade_request(req: &Request<Body>) -> bool {
    if req.method() == Method::CONNECT {
        return true;
    }
    let has_conn_upgrade = req
        .headers()
        .get(CONNECTION)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_ascii_lowercase().contains("upgrade"))
        .unwrap_or(false);
    let has_upgrade_hdr = req.headers().contains_key(UPGRADE);
    has_conn_upgrade && has_upgrade_hdr
}

fn authenticate(
    contexts: &DashMap<String, Arc<ProxyContext>>,
    headers: &HeaderMap,
) -> ProxyResult<Arc<ProxyContext>> {
    let raw = headers
        .get(PROXY_AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(proxy_auth_required)?;
    let mut parts = raw.splitn(2, ' ');
    let scheme = parts.next().unwrap_or_default();
    let encoded = parts.next().unwrap_or_default();
    if !scheme.eq_ignore_ascii_case("Basic") {
        return Err(proxy_auth_required());
    }
    let decoded = BASE64_ENGINE
        .decode(encoded.trim())
        .map_err(|_| proxy_auth_required())?;
    let decoded_str = String::from_utf8(decoded).map_err(|_| proxy_auth_required())?;
    let mut split = decoded_str.splitn(2, ':');
    let username = split.next().unwrap_or_default();
    let password = split.next().unwrap_or_default();
    let entry = contexts
        .get(username)
        .ok_or_else(proxy_auth_required)?
        .value()
        .clone();
    if entry.password != password {
        return Err(proxy_auth_required());
    }
    Ok(entry)
}

fn proxy_auth_required() -> Response<Body> {
    Response::builder()
        .status(StatusCode::PROXY_AUTHENTICATION_REQUIRED)
        .header("Proxy-Authenticate", HeaderValue::from_static(AUTH_REALM))
        .body(Body::from("Proxy Authentication Required"))
        .unwrap()
}

fn build_upstream_uri(target: &ProxyTarget) -> ProxyResult<Uri> {
    let mut path = target.path_and_query.clone();
    if path.is_empty() {
        path = "/".to_string();
    }
    if !path.starts_with('/') {
        path = format!("/{path}");
    }
    let authority = format_authority(&target.host, target.port, target.scheme.default_port());
    let uri_str = format!("{}://{}{}", target.scheme.as_str(), authority, path);
    uri_str
        .parse::<Uri>()
        .map_err(|_| bad_request("invalid upstream URI"))
}

fn format_authority(host: &str, port: u16, default_port: u16) -> String {
    if port == default_port {
        host.to_string()
    } else {
        format!("{host}:{port}")
    }
}

fn parse_proxy_request_target(req: &Request<Body>) -> ProxyResult<ProxyTarget> {
    if let Some(scheme_str) = req.uri().scheme_str() {
        let scheme = normalize_scheme(scheme_str)?;
        let authority = req
            .uri()
            .authority()
            .ok_or_else(|| bad_request("missing authority on proxy request"))?;
        let (host, port) = extract_host_port(authority, scheme)?;
        let path = req
            .uri()
            .path_and_query()
            .map(|pq| pq.as_str())
            .unwrap_or("/");
        return Ok(ProxyTarget {
            scheme,
            host,
            port,
            path_and_query: path.to_string(),
            requested_port: port,
        });
    }

    let host_header = req
        .headers()
        .get(HOST)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| bad_request("Missing Host header"))?;
    let scheme = TargetScheme::Http;
    let (host, port) = parse_host_header(host_header, scheme)?;
    let path = req
        .uri()
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");
    Ok(ProxyTarget {
        scheme,
        host,
        port,
        path_and_query: path.to_string(),
        requested_port: port,
    })
}

fn normalize_scheme(input: &str) -> ProxyResult<TargetScheme> {
    match input.to_ascii_lowercase().as_str() {
        "http" | "ws" => Ok(TargetScheme::Http),
        "https" | "wss" => Ok(TargetScheme::Https),
        _ => Err(bad_request("unsupported scheme")),
    }
}

fn extract_host_port(
    authority: &http::uri::Authority,
    scheme: TargetScheme,
) -> ProxyResult<(String, u16)> {
    let host = authority.host().to_string();
    let port = authority.port_u16().unwrap_or(scheme.default_port());
    Ok((host, port))
}

fn parse_host_header(value: &str, scheme: TargetScheme) -> ProxyResult<(String, u16)> {
    let uri_str = format!("{}://{}", scheme.as_str(), value.trim());
    let uri: Uri = uri_str
        .parse()
        .map_err(|_| bad_request("invalid host header"))?;
    let authority = uri
        .authority()
        .ok_or_else(|| bad_request("invalid host header"))?;
    extract_host_port(authority, scheme)
}

fn parse_connect_target(req: &Request<Body>) -> ProxyResult<(String, u16)> {
    if let Some(authority) = req.uri().authority() {
        return extract_host_port(authority, TargetScheme::Https);
    }
    let raw = req.uri().path();
    if raw.is_empty() {
        return Err(bad_request("missing CONNECT target"));
    }
    parse_host_header(raw, TargetScheme::Https)
}

fn rewrite_target(mut target: ProxyTarget, route: Option<&ProxyRoute>) -> ProxyTarget {
    if let Some(route) = route {
        if is_loopback_hostname(&target.host) {
            let requested_port = target.requested_port;
            target.scheme = TargetScheme::Https;
            target.port = TargetScheme::Https.default_port();
            target.host = build_cmux_host(route, requested_port);
        }
    }
    target
}

fn build_cmux_host(route: &ProxyRoute, port: u16) -> String {
    let safe_port = if port == 0 { 80 } else { port };
    format!(
        "cmux-{}-{}-{}.{}",
        route.morph_id, route.scope, safe_port, route.domain_suffix
    )
}

fn bad_request(msg: impl Into<String>) -> Response<Body> {
    Response::builder()
        .status(StatusCode::BAD_REQUEST)
        .body(Body::from(msg.into()))
        .unwrap()
}

fn internal_error(msg: &str) -> Response<Body> {
    Response::builder()
        .status(StatusCode::INTERNAL_SERVER_ERROR)
        .body(Body::from(msg.to_string()))
        .unwrap()
}

fn is_loopback_hostname(host: &str) -> bool {
    let trimmed = host.trim_matches(&['[', ']'][..]).to_ascii_lowercase();
    matches!(
        trimmed.as_str(),
        "localhost" | "127.0.0.1" | "0.0.0.0" | "::1" | "::ffff:127.0.0.1"
    ) || trimmed.ends_with(".localhost")
        || is_loopback_ipv4(&trimmed)
}

fn is_loopback_ipv4(host: &str) -> bool {
    let parts: Vec<&str> = host.split('.').collect();
    if parts.len() != 4 {
        return false;
    }
    match parts[0].parse::<u8>() {
        Ok(127) => true,
        _ => false,
    }
}

#[napi(js_name = "previewProxyEnsureServer")]
pub async fn preview_proxy_ensure_server(options: Option<PreviewProxyStartOptions>) -> Result<u16> {
    let start = options
        .as_ref()
        .and_then(|o| o.start_port)
        .unwrap_or(DEFAULT_START_PORT);
    let attempts = options
        .as_ref()
        .and_then(|o| o.max_attempts)
        .unwrap_or(DEFAULT_MAX_ATTEMPTS);
    MANAGER.ensure_server(start, attempts).await
}

#[napi(js_name = "previewProxyRegisterContext")]
pub fn preview_proxy_register_context(options: PreviewProxyContextOptions) -> Result<()> {
    let route = options.route.map(|r| ProxyRoute {
        morph_id: r.morph_id,
        scope: r.scope,
        domain_suffix: r.domain_suffix,
    });
    let context = Arc::new(ProxyContext {
        username: options.username.clone(),
        password: options.password,
        route,
    });
    let existing = MANAGER.contexts.insert(options.username, context);
    if existing.is_some() {
        log_msg("replaced existing preview proxy context for username");
    }
    Ok(())
}

#[napi(js_name = "previewProxyRemoveContext")]
pub fn preview_proxy_remove_context(username: String) {
    MANAGER.contexts.remove(&username);
}

#[napi(js_name = "previewProxySetLogging")]
pub fn preview_proxy_set_logging(enabled: bool) {
    LOGGING_ENABLED.store(enabled, Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_loopback_hosts() {
        assert!(is_loopback_hostname("localhost"));
        assert!(is_loopback_hostname("127.0.0.1"));
        assert!(is_loopback_hostname("[::1]"));
        assert!(is_loopback_hostname("example.localhost"));
        assert!(!is_loopback_hostname("example.com"));
    }

    #[test]
    fn rewrites_loopback_targets() {
        let route = ProxyRoute {
            morph_id: "abc123".into(),
            scope: "base".into(),
            domain_suffix: "cmux.dev".into(),
        };
        let target = ProxyTarget {
            scheme: TargetScheme::Http,
            host: "localhost".into(),
            port: 3000,
            path_and_query: "/".into(),
            requested_port: 3000,
        };
        let rewritten = rewrite_target(target, Some(&route));
        assert_eq!(rewritten.host, "cmux-abc123-base-3000.cmux.dev");
        assert_eq!(rewritten.port, 443);
        assert_eq!(rewritten.scheme, TargetScheme::Https);
    }
}
