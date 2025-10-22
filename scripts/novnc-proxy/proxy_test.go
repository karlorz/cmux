package main

import (
	"bufio"
	"encoding/base64"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type backendResult struct {
	payload string
	err     error
}

func TestProxyStaticAndWebsocket(t *testing.T) {
	t.Parallel()

	tempDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(tempDir, "vnc.html"), []byte("<html>vnc</html>"), 0o644); err != nil {
		t.Fatalf("write vnc.html: %v", err)
	}

	backendListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen backend: %v", err)
	}
	defer backendListener.Close()

	backendCh := make(chan backendResult, 1)
	go func() {
		conn, err := backendListener.Accept()
		if err != nil {
			backendCh <- backendResult{"", err}
			return
		}
		defer conn.Close()

		buf := make([]byte, 5)
		if _, err := io.ReadFull(conn, buf); err != nil {
			backendCh <- backendResult{"", err}
			return
		}
		backendCh <- backendResult{string(buf), nil}
		// slight delay to ensure client can process pong before binary frame
		time.Sleep(20 * time.Millisecond)
		if _, err := conn.Write([]byte("WORLD")); err != nil {
			t.Logf("backend write error: %v", err)
		}
	}()

	cfg := proxyConfig{
		listenAddr:  "127.0.0.1:0",
		backendAddr: backendListener.Addr().String(),
		webRoot:     tempDir,
		idleTimeout: 5 * time.Second,
	}

	proxy, err := newProxy(cfg)
	if err != nil {
		t.Fatalf("newProxy: %v", err)
	}

	server := httptest.NewServer(proxy)
	t.Cleanup(server.Close)

	// Static redirect from root
	client := &http.Client{CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	resp, err := client.Get(server.URL + "/")
	if err != nil {
		t.Fatalf("GET /: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusTemporaryRedirect {
		t.Fatalf("expected 307 redirect, got %d", resp.StatusCode)
	}
	if loc := resp.Header.Get("Location"); loc != "/vnc.html" {
		t.Fatalf("expected redirect to /vnc.html, got %q", loc)
	}

	// Static file serving
	resp, err = http.Get(server.URL + "/vnc.html")
	if err != nil {
		t.Fatalf("GET /vnc.html: %v", err)
	}
	body, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		t.Fatalf("read vnc.html: %v", err)
	}
	if string(body) != "<html>vnc</html>" {
		t.Fatalf("unexpected body: %q", string(body))
	}

	// Health endpoint
	resp, err = http.Get(server.URL + "/healthz")
	if err != nil {
		t.Fatalf("GET /healthz: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("healthz status: %d", resp.StatusCode)
	}

	// Perform raw websocket handshake
	serverURL := server.URL
	if !strings.HasPrefix(serverURL, "http://") {
		t.Fatalf("unexpected server URL: %s", serverURL)
	}
	host := strings.TrimPrefix(serverURL, "http://")

	clientConn, err := net.Dial("tcp", host)
	if err != nil {
		t.Fatalf("dial proxy: %v", err)
	}
	defer clientConn.Close()

	secKey := base64.StdEncoding.EncodeToString([]byte("0123456789AB"))
	handshake := strings.Join([]string{
		"GET /websockify HTTP/1.1",
		"Host: " + host,
		"Upgrade: websocket",
		"Connection: Upgrade",
		"Sec-WebSocket-Key: " + secKey,
		"Sec-WebSocket-Version: 13",
		"Sec-WebSocket-Protocol: binary",
		"",
		"",
	}, "\r\n")
	if _, err := clientConn.Write([]byte(handshake)); err != nil {
		t.Fatalf("write handshake: %v", err)
	}

	reader := bufio.NewReader(clientConn)
	statusLine, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("read handshake status: %v", err)
	}
	if !strings.Contains(statusLine, "101") {
		t.Fatalf("expected 101 response, got %q", statusLine)
	}

	headers := make(map[string]string)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("read handshake header: %v", err)
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			break
		}
		if idx := strings.IndexByte(line, ':'); idx >= 0 {
			key := strings.TrimSpace(line[:idx])
			value := strings.TrimSpace(line[idx+1:])
			headers[strings.ToLower(key)] = value
		}
	}

	expectedAccept := computeAcceptKey(secKey)
	if headers["sec-websocket-accept"] != expectedAccept {
		t.Fatalf("unexpected Sec-WebSocket-Accept, got %q want %q", headers["sec-websocket-accept"], expectedAccept)
	}

	// Send ping and expect pong
	if err := writeClientFrame(clientConn, 0x80|opcodePing, []byte("hi")); err != nil {
		t.Fatalf("write ping: %v", err)
	}
	pongOpcode, pongPayload, err := readServerFrame(reader)
	if err != nil {
		t.Fatalf("read pong: %v", err)
	}
	if pongOpcode != opcodePong || string(pongPayload) != "hi" {
		t.Fatalf("unexpected pong: opcode=%d payload=%q", pongOpcode, string(pongPayload))
	}

	// Send binary data to backend
	if err := writeClientFrame(clientConn, 0x80|opcodeBinary, []byte("HELLO")); err != nil {
		t.Fatalf("write binary frame: %v", err)
	}

	result := <-backendCh
	if result.err != nil {
		t.Fatalf("backend read error: %v", result.err)
	}
	if result.payload != "HELLO" {
		t.Fatalf("backend payload mismatch: %q", result.payload)
	}

	// Read backend response from websocket
	opcode, payload, err := readServerFrame(reader)
	if err != nil {
		t.Fatalf("read server frame: %v", err)
	}
	if opcode != opcodeBinary {
		t.Fatalf("expected binary opcode, got %d", opcode)
	}
	if string(payload) != "WORLD" {
		t.Fatalf("unexpected payload %q", string(payload))
	}
}

func writeClientFrame(conn net.Conn, firstByte byte, payload []byte) error {
	maskKey := [4]byte{0x10, 0x22, 0x33, 0x44}
	header := []byte{firstByte, 0x80 | byte(len(payload))}
	if len(payload) > 125 {
		return io.ErrShortWrite
	}
	if _, err := conn.Write(header); err != nil {
		return err
	}
	if _, err := conn.Write(maskKey[:]); err != nil {
		return err
	}
	masked := make([]byte, len(payload))
	for i, b := range payload {
		masked[i] = b ^ maskKey[i%4]
	}
	if len(masked) > 0 {
		if _, err := conn.Write(masked); err != nil {
			return err
		}
	}
	return nil
}

func readServerFrame(reader *bufio.Reader) (byte, []byte, error) {
	header := make([]byte, 2)
	if _, err := io.ReadFull(reader, header); err != nil {
		return 0, nil, err
	}
	opcode := header[0] & 0x0F
	length := int(header[1] & 0x7F)
	switch header[1] & 0x7F {
	case 126:
		ext := make([]byte, 2)
		if _, err := io.ReadFull(reader, ext); err != nil {
			return 0, nil, err
		}
		length = int(ext[0])<<8 | int(ext[1])
	case 127:
		ext := make([]byte, 8)
		if _, err := io.ReadFull(reader, ext); err != nil {
			return 0, nil, err
		}
		length = 0
		for _, b := range ext {
			length = (length << 8) | int(b)
		}
	}
	payload := make([]byte, length)
	if _, err := io.ReadFull(reader, payload); err != nil {
		return 0, nil, err
	}
	return opcode, payload, nil
}
