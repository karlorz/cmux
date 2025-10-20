use std::convert::Infallible;
use std::fs::Metadata as StdMetadata;
use std::future::Future;
use std::io::{Error as IoError, ErrorKind};
use std::net::{SocketAddr, TcpListener};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use hyper::body::Body;
use hyper::header::{
    HeaderValue, CONNECTION, CONTENT_LENGTH, CONTENT_TYPE, SEC_WEBSOCKET_ACCEPT, SEC_WEBSOCKET_KEY,
    SEC_WEBSOCKET_PROTOCOL, UPGRADE,
};
use hyper::server::conn::AddrStream;
use hyper::service::{make_service_fn, service_fn};
use hyper::{Method, Request, Response, Server, StatusCode};
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use tokio_tungstenite::tungstenite::handshake::derive_accept_key;
use tokio_tungstenite::tungstenite::protocol::Role;
use tokio_tungstenite::tungstenite::{Error as WsError, Message};
use tokio_tungstenite::WebSocketStream;
use tracing::{debug, error, info, warn};

#[derive(Clone, Debug)]
pub struct ProxyConfig {
    pub listen: SocketAddr,
    pub target: SocketAddr,
    pub web_root: PathBuf,
}

#[derive(Clone)]
struct SharedConfig {
    target: SocketAddr,
    web_root: PathBuf,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Subprotocol {
    Binary,
    Base64,
}

impl Subprotocol {
    fn as_str(self) -> &'static str {
        match self {
            Subprotocol::Binary => "binary",
            Subprotocol::Base64 => "base64",
        }
    }
}

impl std::fmt::Display for Subprotocol {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

pub fn spawn_proxy<S>(
    config: ProxyConfig,
    shutdown: S,
) -> std::io::Result<(SocketAddr, JoinHandle<()>)>
where
    S: Future<Output = ()> + Send + 'static,
{
    let shared = Arc::new(SharedConfig {
        target: config.target,
        web_root: config.web_root,
    });
    let listen_addr = config.listen;

    let make_svc = make_service_fn(move |conn: &AddrStream| {
        let shared = shared.clone();
        let remote_addr = conn.remote_addr();
        async move {
            Ok::<_, Infallible>(service_fn(move |req| {
                handle_request(req, remote_addr, shared.clone())
            }))
        }
    });

    let std_listener = TcpListener::bind(listen_addr)?;
    std_listener.set_nonblocking(true)?;
    let local_addr = std_listener.local_addr()?;
    let builder =
        Server::from_tcp(std_listener).map_err(|err| IoError::new(ErrorKind::Other, err))?;
    let server = builder.http1_only(true).serve(make_svc);
    let graceful = server.with_graceful_shutdown(async move {
        shutdown.await;
    });

    let handle = tokio::spawn(async move {
        if let Err(err) = graceful.await {
            error!(error = %err, "noVNC proxy server exited with error");
        }
    });

    Ok((local_addr, handle))
}

async fn handle_request(
    req: Request<Body>,
    remote_addr: SocketAddr,
    shared: Arc<SharedConfig>,
) -> Result<Response<Body>, Infallible> {
    let is_ws = is_websocket_request(&req);
    if is_ws {
        match handle_websocket(req, remote_addr, shared).await {
            Ok(resp) => Ok(resp),
            Err(resp) => Ok(resp),
        }
    } else {
        match serve_static(req, shared).await {
            Ok(resp) => Ok(resp),
            Err(resp) => Ok(resp),
        }
    }
}

fn is_websocket_request(req: &Request<Body>) -> bool {
    if req.method() != Method::GET {
        return false;
    }
    let conn_upgrade = req
        .headers()
        .get(CONNECTION)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_ascii_lowercase().contains("upgrade"))
        .unwrap_or(false);
    let upgrade_hdr = req
        .headers()
        .get(UPGRADE)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.eq_ignore_ascii_case("websocket"))
        .unwrap_or(false);
    conn_upgrade && upgrade_hdr && req.headers().contains_key(SEC_WEBSOCKET_KEY)
}

async fn handle_websocket(
    mut req: Request<Body>,
    remote_addr: SocketAddr,
    shared: Arc<SharedConfig>,
) -> Result<Response<Body>, Response<Body>> {
    let key_hdr = req
        .headers()
        .get(SEC_WEBSOCKET_KEY)
        .ok_or_else(|| response_with(StatusCode::BAD_REQUEST, "missing Sec-WebSocket-Key"))?;
    let key = key_hdr
        .to_str()
        .map_err(|_| response_with(StatusCode::BAD_REQUEST, "invalid Sec-WebSocket-Key"))?
        .trim();

    let accept_key = derive_accept_key(key.as_bytes());
    let subprotocol = select_subprotocol(req.headers());

    let mut builder = Response::builder().status(StatusCode::SWITCHING_PROTOCOLS);
    {
        let headers = builder.headers_mut().ok_or_else(|| {
            response_with(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to prepare headers",
            )
        })?;
        headers.insert(CONNECTION, HeaderValue::from_static("Upgrade"));
        headers.insert(UPGRADE, HeaderValue::from_static("websocket"));
        let accept_value = HeaderValue::from_str(&accept_key)
            .map_err(|_| response_with(StatusCode::INTERNAL_SERVER_ERROR, "invalid accept key"))?;
        headers.insert(SEC_WEBSOCKET_ACCEPT, accept_value);
        if let Some(proto) = subprotocol {
            headers.insert(
                SEC_WEBSOCKET_PROTOCOL,
                HeaderValue::from_static(proto.as_str()),
            );
        }
    }

    let response = builder.body(Body::empty()).map_err(|_| {
        response_with(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to build response",
        )
    })?;

    let target = shared.target;
    info!(%remote_addr, %target, ?subprotocol, "accepted websocket connection");
    let upgrade = hyper::upgrade::on(&mut req);

    tokio::spawn(async move {
        match upgrade.await {
            Ok(upgraded) => {
                if let Err(err) = bridge_websocket(upgraded, target, subprotocol, remote_addr).await
                {
                    warn!(%remote_addr, %target, error = %err, "websocket bridge ended with error");
                } else {
                    debug!(%remote_addr, %target, "websocket bridge closed");
                }
            }
            Err(err) => {
                warn!(%remote_addr, %target, error = %err, "failed to upgrade connection");
            }
        }
    });

    Ok(response)
}

async fn serve_static(
    req: Request<Body>,
    shared: Arc<SharedConfig>,
) -> Result<Response<Body>, Response<Body>> {
    if req.method() != Method::GET && req.method() != Method::HEAD {
        return Err(response_with(
            StatusCode::METHOD_NOT_ALLOWED,
            "only GET and HEAD are supported",
        ));
    }
    let head_only = req.method() == Method::HEAD;
    let rel_path = sanitize_path(req.uri().path())
        .ok_or_else(|| response_with(StatusCode::BAD_REQUEST, "invalid path"))?;

    let mut candidates: Vec<PathBuf> = Vec::new();
    if rel_path.as_os_str().is_empty() {
        candidates.push(shared.web_root.join("index.html"));
        candidates.push(shared.web_root.join("vnc.html"));
    } else {
        candidates.push(shared.web_root.join(&rel_path));
    }

    for path in candidates {
        match fs::metadata(&path).await {
            Ok(metadata) => {
                if metadata.is_dir() {
                    let idx = path.join("index.html");
                    if let Ok(idx_meta) = fs::metadata(&idx).await {
                        return build_file_response(idx, idx_meta, head_only).await;
                    }
                    let vnc = path.join("vnc.html");
                    if let Ok(vnc_meta) = fs::metadata(&vnc).await {
                        return build_file_response(vnc, vnc_meta, head_only).await;
                    }
                    continue;
                }
                return build_file_response(path, metadata, head_only).await;
            }
            Err(_) => continue,
        }
    }

    Err(response_with(StatusCode::NOT_FOUND, "not found"))
}

fn select_subprotocol(headers: &hyper::HeaderMap<HeaderValue>) -> Option<Subprotocol> {
    let header = headers.get(SEC_WEBSOCKET_PROTOCOL)?.to_str().ok()?;
    let tokens: Vec<&str> = header.split(',').map(|s| s.trim()).collect();
    if tokens
        .iter()
        .any(|token| token.eq_ignore_ascii_case("binary"))
    {
        return Some(Subprotocol::Binary);
    }
    if tokens
        .iter()
        .any(|token| token.eq_ignore_ascii_case("base64"))
    {
        return Some(Subprotocol::Base64);
    }
    None
}

async fn build_file_response(
    path: PathBuf,
    metadata: StdMetadata,
    head_only: bool,
) -> Result<Response<Body>, Response<Body>> {
    let mime = content_type(&path);
    let mut builder = Response::builder().status(StatusCode::OK);
    {
        let headers = builder.headers_mut().ok_or_else(|| {
            response_with(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to prepare headers",
            )
        })?;
        headers.insert(CONTENT_TYPE, HeaderValue::from_static(mime));
        let len_value = HeaderValue::from_str(&metadata.len().to_string()).map_err(|_| {
            response_with(StatusCode::INTERNAL_SERVER_ERROR, "invalid content-length")
        })?;
        headers.insert(CONTENT_LENGTH, len_value);
    }

    if head_only {
        builder.body(Body::empty()).map_err(|_| {
            response_with(
                StatusCode::INTERNAL_SERVER_ERROR,
                "failed to build response",
            )
        })
    } else {
        match fs::read(&path).await {
            Ok(bytes) => builder.body(Body::from(bytes)).map_err(|_| {
                response_with(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to build response",
                )
            }),
            Err(err) => {
                error!(path = %path.display(), error = %err, "failed to read static file");
                Err(response_with(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "failed to read file",
                ))
            }
        }
    }
}

fn sanitize_path(path: &str) -> Option<PathBuf> {
    let mut buf = PathBuf::new();
    for raw in path.split('/') {
        if raw.is_empty() || raw == "." {
            continue;
        }
        let segment = percent_decode(raw)?;
        if segment == ".." {
            return None;
        }
        buf.push(segment);
    }
    Some(buf)
}

fn percent_decode(input: &str) -> Option<String> {
    if !input.contains('%') {
        return Some(input.to_string());
    }
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            if i + 2 >= bytes.len() {
                return None;
            }
            let hi = decode_hex_digit(bytes[i + 1])?;
            let lo = decode_hex_digit(bytes[i + 2])?;
            out.push((hi << 4) | lo);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn decode_hex_digit(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(10 + (b - b'a')),
        b'A'..=b'F' => Some(10 + (b - b'A')),
        _ => None,
    }
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("html") => "text/html; charset=utf-8",
        Some(ext) if ext.eq_ignore_ascii_case("js") => "text/javascript; charset=utf-8",
        Some(ext) if ext.eq_ignore_ascii_case("css") => "text/css; charset=utf-8",
        Some(ext) if ext.eq_ignore_ascii_case("json") => "application/json; charset=utf-8",
        Some(ext) if ext.eq_ignore_ascii_case("svg") => "image/svg+xml",
        Some(ext) if ext.eq_ignore_ascii_case("png") => "image/png",
        Some(ext) if ext.eq_ignore_ascii_case("jpg") || ext.eq_ignore_ascii_case("jpeg") => {
            "image/jpeg"
        }
        Some(ext) if ext.eq_ignore_ascii_case("wasm") => "application/wasm",
        Some(ext) if ext.eq_ignore_ascii_case("ico") => "image/x-icon",
        Some(ext) if ext.eq_ignore_ascii_case("txt") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn response_with(status: StatusCode, msg: impl Into<String>) -> Response<Body> {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(Body::from(msg.into()))
        .unwrap_or_else(|_| {
            Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from("internal server error"))
                .expect("static response build should not fail")
        })
}

async fn bridge_websocket(
    upgraded: hyper::upgrade::Upgraded,
    target: SocketAddr,
    subprotocol: Option<Subprotocol>,
    remote_addr: SocketAddr,
) -> Result<(), BridgeError> {
    let ws = WebSocketStream::from_raw_socket(upgraded, Role::Server, None).await;
    let tcp = TcpStream::connect(target).await?;
    debug!(%remote_addr, %target, ?subprotocol, "tcp connection established");

    let (mut tcp_read, mut tcp_write) = tcp.into_split();
    let (ws_sink, mut ws_stream) = ws.split();
    let ws_sink = Arc::new(Mutex::new(ws_sink));
    let ws_sink_for_tcp = ws_sink.clone();

    let ws_to_tcp = {
        let ws_sink = ws_sink.clone();
        async move {
            while let Some(message) = ws_stream.next().await {
                let message = message?;
                match message {
                    Message::Binary(data) => {
                        tcp_write.write_all(&data).await?;
                    }
                    Message::Text(text) => {
                        if matches!(subprotocol, Some(Subprotocol::Base64)) {
                            let decoded = BASE64.decode(text.as_bytes())?;
                            tcp_write.write_all(&decoded).await?;
                        } else {
                            warn!("unexpected text frame from websocket client");
                        }
                    }
                    Message::Ping(payload) => {
                        let mut sink = ws_sink.lock().await;
                        sink.send(Message::Pong(payload)).await?;
                    }
                    Message::Pong(_) => {}
                    Message::Close(_) => break,
                    Message::Frame(_) => {}
                }
            }
            let _ = tcp_write.shutdown().await;
            Ok::<(), BridgeError>(())
        }
    };

    let tcp_to_ws = async move {
        let mut buf = vec![0u8; 16 * 1024];
        loop {
            let n = tcp_read.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            let msg = match subprotocol {
                Some(Subprotocol::Base64) => {
                    let encoded = BASE64.encode(&buf[..n]);
                    Message::Text(encoded)
                }
                _ => Message::Binary(buf[..n].to_vec()),
            };
            let mut sink = ws_sink_for_tcp.lock().await;
            sink.send(msg).await?;
        }
        Ok::<(), BridgeError>(())
    };

    let result = tokio::select! {
        res = ws_to_tcp => res,
        res = tcp_to_ws => res,
    };

    if let Err(err) = result {
        return Err(err);
    }

    let mut sink = ws_sink.lock().await;
    let _ = sink.close().await;
    Ok(())
}

#[derive(Debug)]
enum BridgeError {
    Io(std::io::Error),
    Ws(WsError),
    Base64(base64::DecodeError),
}

impl std::fmt::Display for BridgeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BridgeError::Io(err) => write!(f, "io error: {}", err),
            BridgeError::Ws(err) => write!(f, "websocket error: {}", err),
            BridgeError::Base64(err) => write!(f, "base64 decode error: {}", err),
        }
    }
}

impl std::error::Error for BridgeError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            BridgeError::Io(err) => Some(err),
            BridgeError::Ws(err) => Some(err),
            BridgeError::Base64(err) => Some(err),
        }
    }
}

impl From<std::io::Error> for BridgeError {
    fn from(value: std::io::Error) -> Self {
        BridgeError::Io(value)
    }
}

impl From<WsError> for BridgeError {
    fn from(value: WsError) -> Self {
        BridgeError::Ws(value)
    }
}

impl From<base64::DecodeError> for BridgeError {
    fn from(value: base64::DecodeError) -> Self {
        BridgeError::Base64(value)
    }
}
