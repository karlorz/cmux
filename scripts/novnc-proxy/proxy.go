package main

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type proxyConfig struct {
	listenAddr  string
	backendAddr string
	webRoot     string
	idleTimeout time.Duration
}

type novncProxy struct {
	cfg         proxyConfig
	fileHandler http.Handler
}

func newProxy(cfg proxyConfig) (*novncProxy, error) {
	if cfg.webRoot == "" {
		return nil, errors.New("web root is required")
	}
	info, err := os.Stat(cfg.webRoot)
	if err != nil {
		return nil, fmt.Errorf("stat web root: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("web root is not a directory: %s", cfg.webRoot)
	}
	return &novncProxy{
		cfg:         cfg,
		fileHandler: http.FileServer(http.Dir(cfg.webRoot)),
	}, nil
}

func (p *novncProxy) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.URL.Path == "/healthz":
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("ok"))
	case strings.HasPrefix(r.URL.Path, "/websockify"):
		p.handleWebsocket(w, r)
	default:
		if isWebsocketRequest(r) {
			p.handleWebsocket(w, r)
			return
		}
		if r.URL.Path == "/" {
			http.Redirect(w, r, "/vnc.html", http.StatusTemporaryRedirect)
			return
		}
		p.fileHandler.ServeHTTP(w, r)
	}
}

func isWebsocketRequest(r *http.Request) bool {
	if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
		return false
	}
	connection := strings.ToLower(r.Header.Get("Connection"))
	if connection == "upgrade" {
		return true
	}
	for _, part := range strings.Split(connection, ",") {
		if strings.TrimSpace(part) == "upgrade" {
			return true
		}
	}
	return false
}

func (p *novncProxy) handleWebsocket(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !isWebsocketRequest(r) {
		http.Error(w, "invalid websocket upgrade request", http.StatusBadRequest)
		return
	}

	backend, err := net.DialTimeout("tcp", p.cfg.backendAddr, 5*time.Second)
	if err != nil {
		http.Error(w, "failed to connect backend", http.StatusBadGateway)
		return
	}

	hj, ok := w.(http.Hijacker)
	if !ok {
		backend.Close()
		http.Error(w, "websocket hijacking not supported", http.StatusInternalServerError)
		return
	}

	conn, bufrw, err := hj.Hijack()
	if err != nil {
		backend.Close()
		log.Printf("failed to hijack connection: %v", err)
		return
	}

	if bufrw == nil {
		bufrw = bufio.NewReadWriter(bufio.NewReader(conn), bufio.NewWriter(conn))
	}

	wsConn, err := completeHandshake(r, conn, bufrw.Writer)
	if err != nil {
		backend.Close()
		conn.Close()
		log.Printf("failed to complete websocket handshake: %v", err)
		return
	}

	reader := bufrw.Reader
	if reader == nil {
		reader = bufio.NewReader(conn)
	}

	handleProxy(wsConn, reader, backend, p.cfg.idleTimeout)
}

type wsConnection struct {
	net.Conn
	writeMu sync.Mutex
}

func completeHandshake(r *http.Request, conn net.Conn, writer *bufio.Writer) (*wsConnection, error) {
	key := strings.TrimSpace(r.Header.Get("Sec-WebSocket-Key"))
	if key == "" {
		return nil, errors.New("missing Sec-WebSocket-Key header")
	}
	version := strings.TrimSpace(r.Header.Get("Sec-WebSocket-Version"))
	if version != "13" {
		return nil, fmt.Errorf("unsupported websocket version %q", version)
	}

	accept := computeAcceptKey(key)

	protocols := parseHeaderList(r.Header.Values("Sec-WebSocket-Protocol"))
	selectedProtocol := ""
	for _, proto := range protocols {
		if proto == "binary" {
			selectedProtocol = proto
			break
		}
	}

	if _, err := writer.WriteString("HTTP/1.1 101 Switching Protocols\r\n"); err != nil {
		return nil, fmt.Errorf("write handshake status: %w", err)
	}
	if _, err := writer.WriteString("Upgrade: websocket\r\nConnection: Upgrade\r\n"); err != nil {
		return nil, fmt.Errorf("write handshake headers: %w", err)
	}
	if _, err := writer.WriteString("Sec-WebSocket-Accept: " + accept + "\r\n"); err != nil {
		return nil, fmt.Errorf("write accept header: %w", err)
	}
	if selectedProtocol != "" {
		if _, err := writer.WriteString("Sec-WebSocket-Protocol: " + selectedProtocol + "\r\n"); err != nil {
			return nil, fmt.Errorf("write protocol header: %w", err)
		}
	}
	if _, err := writer.WriteString("\r\n"); err != nil {
		return nil, fmt.Errorf("write handshake terminator: %w", err)
	}
	if err := writer.Flush(); err != nil {
		return nil, fmt.Errorf("flush handshake: %w", err)
	}

	return &wsConnection{Conn: conn}, nil
}

func parseHeaderList(values []string) []string {
	var out []string
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			trimmed := strings.TrimSpace(part)
			if trimmed != "" {
				out = append(out, trimmed)
			}
		}
	}
	return out
}

func computeAcceptKey(key string) string {
	const magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
	h := sha1.Sum([]byte(key + magic))
	return base64.StdEncoding.EncodeToString(h[:])
}

func handleProxy(ws *wsConnection, reader *bufio.Reader, backend net.Conn, idleTimeout time.Duration) {
	defer ws.Close()
	defer backend.Close()

	type result struct {
		dir string
		err error
	}

	results := make(chan result, 2)

	go func() {
		results <- result{dir: "client->backend", err: copyFromWebsocket(ws, reader, backend, idleTimeout)}
	}()

	go func() {
		results <- result{dir: "backend->client", err: copyToWebsocket(ws, backend, idleTimeout)}
	}()

	first := <-results
	if first.err != nil && !errors.Is(first.err, io.EOF) {
		log.Printf("proxy direction %s exited with error: %v", first.dir, first.err)
	}

	// Ensure both goroutines exit before returning.
	second := <-results
	if second.err != nil && !errors.Is(second.err, io.EOF) {
		log.Printf("proxy direction %s exited with error: %v", second.dir, second.err)
	}
}

func copyFromWebsocket(ws *wsConnection, reader *bufio.Reader, backend net.Conn, idleTimeout time.Duration) error {
	var messageBuffer []byte
	var messageOpcode byte
	for {
		if idleTimeout > 0 {
			if err := ws.SetReadDeadline(time.Now().Add(idleTimeout)); err != nil {
				return err
			}
		}
		frame, err := readFrame(reader)
		if err != nil {
			return err
		}
		switch frame.opcode {
		case opcodeClose:
			return io.EOF
		case opcodePing:
			if err := ws.writeFrame(opcodePong, frame.payload); err != nil {
				return err
			}
			continue
		case opcodePong:
			continue
		case opcodeBinary, opcodeText:
			if !frame.fin {
				messageOpcode = frame.opcode
				messageBuffer = append(messageBuffer[:0], frame.payload...)
				continue
			}
			if _, err := backend.Write(frame.payload); err != nil {
				return err
			}
		case opcodeContinuation:
			if len(messageBuffer) == 0 && messageOpcode == 0 {
				return errors.New("unexpected continuation without message")
			}
			messageBuffer = append(messageBuffer, frame.payload...)
			if frame.fin {
				if _, err := backend.Write(messageBuffer); err != nil {
					return err
				}
				messageBuffer = messageBuffer[:0]
				messageOpcode = 0
			}
		default:
			return fmt.Errorf("unsupported websocket opcode %d", frame.opcode)
		}
	}
}

func copyToWebsocket(ws *wsConnection, backend net.Conn, idleTimeout time.Duration) error {
	buffer := make([]byte, 32*1024)
	for {
		if idleTimeout > 0 {
			if err := backend.SetReadDeadline(time.Now().Add(idleTimeout)); err != nil {
				return err
			}
		}
		n, err := backend.Read(buffer)
		if n > 0 {
			if err := ws.writeFrame(opcodeBinary, buffer[:n]); err != nil {
				return err
			}
		}
		if err != nil {
			return err
		}
	}
}

type wsFrame struct {
	fin     bool
	opcode  byte
	payload []byte
}

const (
	opcodeContinuation = 0x0
	opcodeText         = 0x1
	opcodeBinary       = 0x2
	opcodeClose        = 0x8
	opcodePing         = 0x9
	opcodePong         = 0xA
)

func readFrame(reader *bufio.Reader) (wsFrame, error) {
	var header [2]byte
	if _, err := io.ReadFull(reader, header[:]); err != nil {
		return wsFrame{}, err
	}
	fin := header[0]&0x80 != 0
	opcode := header[0] & 0x0F
	masked := header[1]&0x80 != 0
	lengthIndicator := int(header[1] & 0x7F)

	var length uint64
	switch lengthIndicator {
	case 126:
		var extended [2]byte
		if _, err := io.ReadFull(reader, extended[:]); err != nil {
			return wsFrame{}, err
		}
		length = uint64(extended[0])<<8 | uint64(extended[1])
	case 127:
		var extended [8]byte
		if _, err := io.ReadFull(reader, extended[:]); err != nil {
			return wsFrame{}, err
		}
		for _, b := range extended {
			length = (length << 8) | uint64(b)
		}
		if length > 1<<32 {
			return wsFrame{}, errors.New("websocket frame too large")
		}
	default:
		length = uint64(lengthIndicator)
	}

	var maskingKey [4]byte
	if masked {
		if _, err := io.ReadFull(reader, maskingKey[:]); err != nil {
			return wsFrame{}, err
		}
	}

	if length > 0 {
		payload := make([]byte, int(length))
		if _, err := io.ReadFull(reader, payload); err != nil {
			return wsFrame{}, err
		}
		if masked {
			for i := range payload {
				payload[i] ^= maskingKey[i%4]
			}
		}
		return wsFrame{fin: fin, opcode: opcode, payload: payload}, nil
	}
	return wsFrame{fin: fin, opcode: opcode, payload: nil}, nil
}

func (ws *wsConnection) writeFrame(opcode byte, payload []byte) error {
	ws.writeMu.Lock()
	defer ws.writeMu.Unlock()

	var header []byte
	length := len(payload)
	switch {
	case length <= 125:
		header = []byte{0x80 | (opcode & 0x0F), byte(length)}
	case length <= 0xFFFF:
		header = []byte{0x80 | (opcode & 0x0F), 126, byte(length >> 8), byte(length)}
	default:
		header = make([]byte, 10)
		header[0] = 0x80 | (opcode & 0x0F)
		header[1] = 127
		for i := 0; i < 8; i++ {
			shift := uint(7-i) * 8
			header[2+i] = byte(uint64(length) >> shift)
		}
	}

	if _, err := ws.Conn.Write(header); err != nil {
		return err
	}
	if length > 0 {
		if _, err := ws.Conn.Write(payload); err != nil {
			return err
		}
	}
	return nil
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func loadConfig() proxyConfig {
	listenAddr := getenv("CMUX_NOVNC_PROXY_LISTEN_ADDR", "0.0.0.0:39380")
	backendAddr := getenv("CMUX_NOVNC_PROXY_BACKEND_ADDR", "127.0.0.1:5901")
	webRoot := getenv("CMUX_NOVNC_PROXY_WEB_ROOT", "/usr/share/novnc")
	idle := getenv("CMUX_NOVNC_PROXY_IDLE_TIMEOUT", "60s")
	idleTimeout, err := time.ParseDuration(idle)
	if err != nil {
		log.Printf("invalid idle timeout %q, using default", idle)
		idleTimeout = 60 * time.Second
	}
	return proxyConfig{
		listenAddr:  listenAddr,
		backendAddr: backendAddr,
		webRoot:     webRoot,
		idleTimeout: idleTimeout,
	}
}

func main() {
	log.SetFlags(log.LstdFlags | log.LUTC)
	cfg := loadConfig()

	proxy, err := newProxy(cfg)
	if err != nil {
		log.Fatalf("failed to initialize proxy: %v", err)
	}

	server := &http.Server{
		Addr:              cfg.listenAddr,
		Handler:           proxy,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       0,
		WriteTimeout:      0,
		IdleTimeout:       0,
	}

	log.Printf("noVNC proxy listening on %s, forwarding to %s, web root %s", cfg.listenAddr, cfg.backendAddr, cfg.webRoot)

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("server exited: %v", err)
	}
}

// compile-time interface checks
var _ http.Handler = (*novncProxy)(nil)
