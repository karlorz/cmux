package pvelxc

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestChunkBase64MaxSize(t *testing.T) {
	t.Parallel()
	// 12 KiB of raw data → base64 is 16 KiB → at least 2 chunks of ≤8 KiB
	raw := make([]byte, 12*1024)
	for i := range raw {
		raw[i] = byte(i % 251)
	}
	b64 := base64.StdEncoding.EncodeToString(raw)
	chunks := ChunkBase64(b64)
	if len(chunks) < 2 {
		t.Fatalf("expected ≥2 chunks for %d base64 bytes, got %d", len(b64), len(chunks))
	}
	for i, c := range chunks {
		if len(c) > MaxHTTPPushChunkSize {
			t.Fatalf("chunk %d size %d > %d", i, len(c), MaxHTTPPushChunkSize)
		}
	}
	if strings.Join(chunks, "") != b64 {
		t.Fatal("chunks do not reassemble to original base64")
	}
}

func TestChunkBase64Empty(t *testing.T) {
	t.Parallel()
	if ChunkBase64("") != nil {
		t.Fatal("empty should yield nil/empty")
	}
}

func TestIsPayloadTooLarge(t *testing.T) {
	t.Parallel()
	if !IsPayloadTooLarge("error 413 Payload Too Large", "") {
		t.Fatal("expected 413 detection")
	}
	if !IsPayloadTooLarge("", "Request Entity Too Large") {
		t.Fatal("expected entity too large")
	}
	if IsPayloadTooLarge("ok", "done") {
		t.Fatal("false positive")
	}
}

func TestSelectPushFallback(t *testing.T) {
	t.Parallel()
	// success → no fallback
	if use, _ := SelectPushFallback(true, 0, "", "", nil, "root@pve"); use {
		t.Fatal("success should not fallback")
	}
	// 413 with SSH → fallback
	if use, reason := SelectPushFallback(false, 1, "413 Payload Too Large", "", nil, "root@pve"); !use {
		t.Fatalf("expected fallback, reason would be %s", reason)
	} else if !strings.Contains(reason, "413") {
		t.Fatalf("reason=%q", reason)
	}
	// 413 without SSH → no fallback path available
	if use, reason := SelectPushFallback(false, 1, "413", "", nil, ""); use {
		t.Fatalf("should not use fallback without SSH, reason=%s", reason)
	}
	// transport error with SSH
	if use, _ := SelectPushFallback(false, 0, "", "", fmt.Errorf("dial"), "root@pve"); !use {
		t.Fatal("expected fallback on transport error")
	}
}

type fakeExec struct {
	// commands recorded
	cmds []string
	// per-call responses (cycled if exhausted uses last)
	responses []struct {
		stdout, stderr string
		code           int
		err            error
	}
	i int
}

func (f *fakeExec) ExecCommand(ctx context.Context, instanceID, command string) (string, string, int, error) {
	f.cmds = append(f.cmds, command)
	if len(f.responses) == 0 {
		return "", "", 0, nil
	}
	idx := f.i
	if idx >= len(f.responses) {
		idx = len(f.responses) - 1
	}
	f.i++
	r := f.responses[idx]
	return r.stdout, r.stderr, r.code, r.err
}

func TestBuildHTTPPushCommandsChunked(t *testing.T) {
	t.Parallel()
	// large enough for multiple chunks
	raw := bytesRepeat(6000)
	cmds := BuildHTTPPushCommands("/root/mirror.tar", raw)
	if len(cmds) < 2 {
		t.Fatalf("expected init + ≥1 append, got %d", len(cmds))
	}
	if !strings.Contains(cmds[0], "mkdir -p") || !strings.Contains(cmds[0], "/root/mirror.tar") {
		t.Fatalf("init cmd unexpected: %s", cmds[0])
	}
	for i, c := range cmds[1:] {
		if !strings.Contains(c, "base64 -d") {
			t.Fatalf("append %d missing base64: %s", i, c)
		}
		// ensure no single printf payload exceeds MaxHTTPPushChunkSize
		// extract quoted payload roughly
		if len(c) > MaxHTTPPushChunkSize+200 {
			// shell wrapper overhead ~100; payload itself must be ≤8192
			// Find the quoted base64 segment
			start := strings.Index(c, "printf '%s' '")
			if start < 0 {
				continue
			}
			start += len("printf '%s' '")
			end := strings.Index(c[start:], "'")
			if end > MaxHTTPPushChunkSize {
				t.Fatalf("chunk payload %d > max", end)
			}
		}
	}
}

func TestPushFileViaHTTPExecSuccess(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	local := filepath.Join(dir, "payload.bin")
	content := []byte("hello-mirror-payload")
	if err := os.WriteFile(local, content, 0o600); err != nil {
		t.Fatal(err)
	}
	fake := &fakeExec{}
	ok, err := PushFileViaHTTPExec(context.Background(), fake, "inst-1", local, "/root/payload.bin")
	if err != nil {
		t.Fatalf("err: %v", err)
	}
	if !ok {
		t.Fatal("expected ok")
	}
	if len(fake.cmds) < 2 {
		t.Fatalf("expected ≥2 exec cmds, got %d", len(fake.cmds))
	}
	// reassembled base64 from append commands should decode to content
	var b64 strings.Builder
	for _, cmd := range fake.cmds[1:] {
		// printf '%s' '<b64>' | base64 -d >> ...
		const prefix = "printf '%s' '"
		i := strings.Index(cmd, prefix)
		if i < 0 {
			t.Fatalf("unexpected cmd: %s", cmd)
		}
		rest := cmd[i+len(prefix):]
		j := strings.Index(rest, "'")
		b64.WriteString(rest[:j])
	}
	decoded, err := base64.StdEncoding.DecodeString(b64.String())
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if string(decoded) != string(content) {
		t.Fatalf("decoded %q want %q", decoded, content)
	}
}

func TestPushFileViaHTTPExec413ReturnsNotOK(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	local := filepath.Join(dir, "payload.bin")
	if err := os.WriteFile(local, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	fake := &fakeExec{
		responses: []struct {
			stdout, stderr string
			code           int
			err            error
		}{
			{stderr: "413 Payload Too Large", code: 1},
		},
	}
	ok, err := PushFileViaHTTPExec(context.Background(), fake, "inst-1", local, "/root/x")
	if err != nil {
		t.Fatalf("413 should soft-fail for fallback, not hard err: %v", err)
	}
	if ok {
		t.Fatal("expected ok=false on 413")
	}
}

func TestPushFileSelectsFallbackWhenHTTPFailsAndSSHSet(t *testing.T) {
	t.Parallel()
	// Unit-level: SelectPushFallback + PushFileViaHTTPExec 413 path;
	// full pct push needs real ssh — covered by selection logic.
	use, reason := SelectPushFallback(false, 1, "413 Payload Too Large", "", nil, "root@pve")
	if !use {
		t.Fatal("expected fallback selection")
	}
	if !strings.Contains(reason, "413") {
		t.Fatalf("reason=%s", reason)
	}
	// Without SSH
	use, _ = SelectPushFallback(false, 1, "413", "", nil, "")
	if use {
		t.Fatal("no SSH → no fallback")
	}
}

func bytesRepeat(n int) []byte {
	b := make([]byte, n)
	for i := range b {
		b[i] = 'A' + byte(i%26)
	}
	return b
}
