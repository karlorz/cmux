package pvelxc

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// MaxHTTPPushChunkSize is the max base64 payload size per exec call (8 KiB).
// Multiple of 4 for base64 alignment; keeps shell args under CF / exec limits.
const MaxHTTPPushChunkSize = 8192

// ExecRunner runs a shell command inside a container (instance ID or host).
// Implemented by *Client.ExecCommand for production; tests inject fakes.
type ExecRunner interface {
	ExecCommand(ctx context.Context, instanceID string, command string) (stdout, stderr string, exitCode int, err error)
}

// PushPath is the transport selected for a dual-path push attempt.
type PushPath string

const (
	PushPathHTTPExec PushPath = "http-exec"
	PushPathPCT      PushPath = "pct-ssh"
)

// PushResult describes which path delivered the file.
type PushResult struct {
	Path PushPath
}

// PushFileOptions configures dual-path push.
type PushFileOptions struct {
	// SSHHost is the PVE host for scp + pct push fallback (e.g. root@pve).
	// When empty, only HTTP-exec is attempted; 413/failure returns a clear error.
	SSHHost string
	// Node is the Proxmox node name used by `pct` (optional; empty uses default pct).
	Node string
	// VMID is required for pct push fallback.
	VMID int
}

// ChunkBase64 splits a base64 string into chunks of at most MaxHTTPPushChunkSize.
func ChunkBase64(b64 string) []string {
	if b64 == "" {
		return nil
	}
	var chunks []string
	for offset := 0; offset < len(b64); offset += MaxHTTPPushChunkSize {
		end := offset + MaxHTTPPushChunkSize
		if end > len(b64) {
			end = len(b64)
		}
		chunks = append(chunks, b64[offset:end])
	}
	return chunks
}

// IsPayloadTooLarge reports whether stderr/stdout indicate Cloudflare/HTTP 413.
func IsPayloadTooLarge(stderr, stdout string) bool {
	combined := stderr + "\n" + stdout
	return strings.Contains(combined, "413") ||
		strings.Contains(combined, "Payload Too Large") ||
		strings.Contains(combined, "Request Entity Too Large")
}

// SelectPushFallback returns true when HTTP-exec failed in a way that warrants
// scp+pct fallback (unavailable, 413, or non-zero exit with payload-too-large).
func SelectPushFallback(httpOK bool, exitCode int, stderr, stdout string, err error, sshHost string) (useFallback bool, reason string) {
	if httpOK && err == nil && exitCode == 0 {
		return false, ""
	}
	if sshHost == "" {
		return false, "http-exec failed and PVE_SSH_HOST not set"
	}
	if err != nil {
		return true, "http-exec transport error"
	}
	if IsPayloadTooLarge(stderr, stdout) {
		return true, "http-exec payload too large (413)"
	}
	if exitCode != 0 {
		return true, fmt.Sprintf("http-exec exit %d", exitCode)
	}
	// httpOK false with no error (e.g. tryHTTPExec returned nil body)
	return true, "http-exec unavailable"
}

// BuildHTTPPushCommands returns the shell commands to init and append a remote
// file from base64 chunks (≤ MaxHTTPPushChunkSize each).
func BuildHTTPPushCommands(remotePath string, fileData []byte) []string {
	b64 := base64.StdEncoding.EncodeToString(fileData)
	escaped := shellSingleQuote(remotePath)
	parent := shellSingleQuote(filepath.Dir(remotePath))
	cmds := []string{
		fmt.Sprintf("mkdir -p %s && : > %s", parent, escaped),
	}
	for _, chunk := range ChunkBase64(b64) {
		// chunk is base64 alphabet — safe inside single quotes.
		cmds = append(cmds, fmt.Sprintf("printf '%%s' %s | base64 -d >> %s", shellSingleQuote(chunk), escaped))
	}
	return cmds
}

// PushFileViaHTTPExec pushes localPath to remotePath using runner exec + base64 chunks.
// Returns (ok=false) when transport is unavailable or 413 is detected so callers
// can select PCT fallback.
func PushFileViaHTTPExec(ctx context.Context, runner ExecRunner, instanceID, localPath, remotePath string) (ok bool, err error) {
	data, err := os.ReadFile(localPath)
	if err != nil {
		return false, fmt.Errorf("read local file: %w", err)
	}
	cmds := BuildHTTPPushCommands(remotePath, data)
	for i, cmd := range cmds {
		stdout, stderr, exitCode, execErr := runner.ExecCommand(ctx, instanceID, cmd)
		if execErr != nil {
			return false, nil // transport unavailable → allow fallback
		}
		if exitCode != 0 {
			if IsPayloadTooLarge(stderr, stdout) {
				return false, nil
			}
			return false, fmt.Errorf("http-exec push step %d failed (exit %d): %s", i, exitCode, strings.TrimSpace(stderr+"\n"+stdout))
		}
	}
	return true, nil
}

// PushFile dual-path: HTTP-exec chunked base64 first; on failure/413 fall back to
// scp + pct push when SSHHost is set.
func PushFile(ctx context.Context, runner ExecRunner, instanceID, localPath, remotePath string, opts PushFileOptions) (*PushResult, error) {
	ok, err := PushFileViaHTTPExec(ctx, runner, instanceID, localPath, remotePath)
	if err != nil {
		// Hard failure (local read / non-413 remote error) — still try fallback if configured?
		// Match Python: non-413 RuntimeError re-raises; we treat non-413 as hard error
		// only when fallback not selected.
		use, reason := SelectPushFallback(false, 1, err.Error(), "", nil, opts.SSHHost)
		if !use {
			return nil, err
		}
		if fbErr := pushViaPCT(ctx, localPath, remotePath, opts); fbErr != nil {
			return nil, fmt.Errorf("http-exec failed (%v); pct fallback (%s) failed: %w", err, reason, fbErr)
		}
		return &PushResult{Path: PushPathPCT}, nil
	}
	if ok {
		return &PushResult{Path: PushPathHTTPExec}, nil
	}

	use, reason := SelectPushFallback(false, 1, "unavailable", "", nil, opts.SSHHost)
	if !use {
		return nil, fmt.Errorf("HTTP exec push unavailable for %s and SSH fallback not configured (set PVE_SSH_HOST). reason=%s", instanceID, reason)
	}
	if fbErr := pushViaPCT(ctx, localPath, remotePath, opts); fbErr != nil {
		return nil, fmt.Errorf("pct fallback (%s) failed: %w", reason, fbErr)
	}
	return &PushResult{Path: PushPathPCT}, nil
}

// pushViaPCT scp's the file to the PVE host then runs `pct push`.
func pushViaPCT(ctx context.Context, localPath, remotePath string, opts PushFileOptions) error {
	if opts.SSHHost == "" {
		return fmt.Errorf("PVE_SSH_HOST required for pct push")
	}
	if opts.VMID <= 0 {
		return fmt.Errorf("VMID required for pct push")
	}
	tmpName := fmt.Sprintf("/tmp/devsh_pct_push_%d_%s", opts.VMID, filepath.Base(localPath))
	// scp local → host:tmp
	scp := exec.CommandContext(ctx, "scp", "-o", "StrictHostKeyChecking=accept-new", localPath, opts.SSHHost+":"+tmpName)
	if out, err := scp.CombinedOutput(); err != nil {
		return fmt.Errorf("scp to PVE host: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	// pct push vmid local_on_host remote_in_ct
	pctCmd := fmt.Sprintf("pct push %d %s %s && rm -f %s", opts.VMID, shellSingleQuote(tmpName), shellSingleQuote(remotePath), shellSingleQuote(tmpName))
	ssh := exec.CommandContext(ctx, "ssh", "-o", "StrictHostKeyChecking=accept-new", opts.SSHHost, pctCmd)
	if out, err := ssh.CombinedOutput(); err != nil {
		return fmt.Errorf("pct push: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	return nil
}

// SSHHostFromEnv returns PVE_SSH_HOST if set.
func SSHHostFromEnv() string {
	return strings.TrimSpace(os.Getenv("PVE_SSH_HOST"))
}

// PushFileFromEnv is a convenience wrapper using env for SSH fallback.
func (c *Client) PushFileFromEnv(ctx context.Context, instanceID string, vmid int, localPath, remotePath string) (*PushResult, error) {
	return PushFile(ctx, c, instanceID, localPath, remotePath, PushFileOptions{
		SSHHost: SSHHostFromEnv(),
		VMID:    vmid,
	})
}
