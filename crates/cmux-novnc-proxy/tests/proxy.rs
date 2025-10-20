use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use cmux_novnc_proxy::{spawn_proxy, ProxyConfig};
use futures_util::{SinkExt, StreamExt};
use hyper::body::to_bytes;
use hyper::{Client, StatusCode};
use tempfile::tempdir;
use tokio::fs;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::time::timeout;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, http::HeaderValue, protocol::Message as WsMessage},
};

fn localhost_socket(port: u16) -> SocketAddr {
    SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port)
}

#[tokio::test(flavor = "multi_thread")]
async fn serves_static_index() {
    let temp = tempdir().unwrap();
    let index_path = temp.path().join("index.html");
    fs::write(&index_path, "hello noVNC").await.unwrap();

    let config = ProxyConfig {
        listen: localhost_socket(0),
        target: localhost_socket(5901),
        web_root: temp.path().to_path_buf(),
    };

    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let (listen_addr, handle) = spawn_proxy(config, async move {
        let _ = shutdown_rx.await;
    })
    .unwrap();

    let client = Client::new();
    let uri = format!("http://{}/", listen_addr).parse().unwrap();
    let resp = client.get(uri).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = to_bytes(resp.into_body()).await.unwrap();
    assert_eq!(body, "hello noVNC");

    shutdown_tx.send(()).ok();
    handle.await.unwrap();
}

#[tokio::test(flavor = "multi_thread")]
async fn websocket_binary_bridge() {
    let listener = TcpListener::bind(localhost_socket(0)).await.unwrap();
    let target_addr = listener.local_addr().unwrap();
    let (tcp_done_tx, tcp_done_rx) = oneshot::channel();

    tokio::spawn(async move {
        if let Ok((mut stream, _)) = listener.accept().await {
            stream.write_all(b"srv").await.unwrap();
            let mut buf = vec![0u8; 32];
            let n = stream.read(&mut buf).await.unwrap();
            let received = buf[..n].to_vec();
            stream.write_all(b"ack").await.unwrap();
            let _ = tcp_done_tx.send(received);
        }
    });

    let temp = tempdir().unwrap();
    fs::write(temp.path().join("index.html"), "noop")
        .await
        .unwrap();

    let config = ProxyConfig {
        listen: localhost_socket(0),
        target: target_addr,
        web_root: temp.path().to_path_buf(),
    };

    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let (listen_addr, handle) = spawn_proxy(config, async move {
        let _ = shutdown_rx.await;
    })
    .unwrap();

    let url = format!("ws://{}/websock", listen_addr);
    let (mut ws, _) = connect_async(url).await.unwrap();

    let incoming = timeout(Duration::from_secs(5), ws.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(incoming, WsMessage::Binary(b"srv".to_vec()));

    ws.send(WsMessage::Binary(b"from client".to_vec()))
        .await
        .unwrap();
    let server_received = tcp_done_rx.await.unwrap();
    assert_eq!(server_received, b"from client".to_vec());

    let reply = timeout(Duration::from_secs(5), ws.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert_eq!(reply, WsMessage::Binary(b"ack".to_vec()));

    ws.close(None).await.unwrap();

    shutdown_tx.send(()).ok();
    handle.await.unwrap();
}

#[tokio::test(flavor = "multi_thread")]
async fn selects_binary_when_available() {
    let listener = TcpListener::bind(localhost_socket(0)).await.unwrap();
    let target_addr = listener.local_addr().unwrap();

    tokio::spawn(async move {
        if let Ok((mut stream, _)) = listener.accept().await {
            let _ = stream.shutdown().await;
        }
    });

    let temp = tempdir().unwrap();
    fs::write(temp.path().join("index.html"), "noop")
        .await
        .unwrap();

    let config = ProxyConfig {
        listen: localhost_socket(0),
        target: target_addr,
        web_root: temp.path().to_path_buf(),
    };

    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let (listen_addr, handle) = spawn_proxy(config, async move {
        let _ = shutdown_rx.await;
    })
    .unwrap();

    let mut req = format!("ws://{}/", listen_addr)
        .into_client_request()
        .unwrap();
    req.headers_mut().insert(
        "Sec-WebSocket-Protocol",
        HeaderValue::from_static("base64, binary"),
    );
    let (mut ws, response) = connect_async(req).await.unwrap();
    assert_eq!(response.status(), 101);
    let protocol = response
        .headers()
        .get("sec-websocket-protocol")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    assert_eq!(protocol.as_deref(), Some("binary"));

    ws.close(None).await.unwrap();
    shutdown_tx.send(()).ok();
    handle.await.unwrap();
}

#[tokio::test(flavor = "multi_thread")]
async fn base64_subprotocol_round_trip() {
    let listener = TcpListener::bind(localhost_socket(0)).await.unwrap();
    let target_addr = listener.local_addr().unwrap();
    let (tcp_done_tx, tcp_done_rx) = oneshot::channel();

    tokio::spawn(async move {
        if let Ok((mut stream, _)) = listener.accept().await {
            let mut buf = vec![0u8; 64];
            let n = stream.read(&mut buf).await.unwrap();
            let received = buf[..n].to_vec();
            stream.write_all(b"pong").await.unwrap();
            let _ = tcp_done_tx.send(received);
        }
    });

    let temp = tempdir().unwrap();
    fs::write(temp.path().join("index.html"), "noop")
        .await
        .unwrap();

    let config = ProxyConfig {
        listen: localhost_socket(0),
        target: target_addr,
        web_root: temp.path().to_path_buf(),
    };

    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let (listen_addr, handle) = spawn_proxy(config, async move {
        let _ = shutdown_rx.await;
    })
    .unwrap();

    let mut req = format!("ws://{}/", listen_addr)
        .into_client_request()
        .unwrap();
    req.headers_mut()
        .insert("Sec-WebSocket-Protocol", HeaderValue::from_static("base64"));
    let (mut ws, response) = connect_async(req).await.unwrap();
    assert_eq!(response.status(), 101);
    let protocol = response
        .headers()
        .get("sec-websocket-protocol")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    assert_eq!(protocol.as_deref(), Some("base64"));

    let payload = BASE64.encode(b"ping");
    ws.send(WsMessage::Text(payload)).await.unwrap();
    let from_client = tcp_done_rx.await.unwrap();
    assert_eq!(from_client, b"ping");

    let reply = timeout(Duration::from_secs(5), ws.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let text = match reply {
        WsMessage::Text(text) => text,
        other => panic!("expected text frame, got {:?}", other),
    };
    let decoded = BASE64.decode(text.as_bytes()).unwrap();
    assert_eq!(decoded, b"pong");

    ws.close(None).await.unwrap();
    shutdown_tx.send(()).ok();
    handle.await.unwrap();
}
