// Package mirrorlocal packs a safe redacted subset of local agent CLI config
// (e.g. ~/.claude, ~/.codex) for push into a fresh cloud workspace.
package mirrorlocal

import (
	"archive/tar"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// PackOptions controls what gets included and how paths/secrets are rewritten.
type PackOptions struct {
	// HomeDir is the local host home (source of ~/.claude / ~/.codex).
	HomeDir string
	// LocalHomePrefix is rewritten inside text configs (defaults to HomeDir).
	LocalHomePrefix string
	// TargetHome is the cloud home path used as rewrite destination (default /root).
	TargetHome string
	// IncludeSecrets keeps auth.json / known secret keys when true (v1 default false).
	IncludeSecrets bool
	// Sources lists relative home subdirs to consider (default: .claude, .codex).
	Sources []string
}

// DefaultSources are the agent config roots mirrored in v1.
var DefaultSources = []string{".claude", ".codex"}

// SecretFileBasenames are never copied unless IncludeSecrets is true.
var SecretFileBasenames = map[string]struct{}{
	"auth.json":       {},
	".credentials.json": {},
	"credentials.json":  {},
}

// ExcludeDirNames are skipped entirely (session history, caches, etc.).
var ExcludeDirNames = map[string]struct{}{
	"projects":          {},
	"sessions":          {},
	"archived_sessions": {},
	"cache":             {},
	"caches":            {},
	".tmp":              {},
	"tmp":               {},
	"debug":             {},
	"telemetry":         {},
	"shell-snapshots":   {},
	"statsig":           {},
	"todos":             {},
	"file-history":      {},
}

// SecretJSONKeys are redacted (set to empty string / removed) in JSON configs.
var SecretJSONKeys = map[string]struct{}{
	"apiKey":            {},
	"api_key":           {},
	"token":             {},
	"accessToken":       {},
	"access_token":      {},
	"refreshToken":      {},
	"refresh_token":     {},
	"password":          {},
	"secret":            {},
	"clientSecret":      {},
	"client_secret":     {},
	"OPENAI_API_KEY":    {},
	"ANTHROPIC_API_KEY": {},
}

// Pack builds a tar archive of the safe config subset under opts.HomeDir.
// Returns the tar bytes (uncompressed) ready for dual-path push.
func Pack(opts PackOptions) ([]byte, error) {
	if opts.HomeDir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("resolve home: %w", err)
		}
		opts.HomeDir = home
	}
	if opts.LocalHomePrefix == "" {
		opts.LocalHomePrefix = opts.HomeDir
	}
	if opts.TargetHome == "" {
		opts.TargetHome = "/root"
	}
	if len(opts.Sources) == 0 {
		opts.Sources = append([]string(nil), DefaultSources...)
	}

	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)

	for _, src := range opts.Sources {
		src = strings.TrimPrefix(src, "~/")
		src = strings.TrimPrefix(src, "/")
		root := filepath.Join(opts.HomeDir, src)
		info, err := os.Stat(root)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, fmt.Errorf("stat %s: %w", root, err)
		}
		if !info.IsDir() {
			continue
		}
		if err := filepath.WalkDir(root, func(path string, d fs.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			rel, err := filepath.Rel(opts.HomeDir, path)
			if err != nil {
				return err
			}
			// Normalize to forward slashes for tar + cloud Linux.
			relSlash := filepath.ToSlash(rel)

			if d.IsDir() {
				base := d.Name()
				if _, skip := ExcludeDirNames[base]; skip && path != root {
					return filepath.SkipDir
				}
				// Ensure directory entries exist in the archive.
				hdr := &tar.Header{
					Name:     relSlash + "/",
					Mode:     0o755,
					Typeflag: tar.TypeDir,
				}
				return tw.WriteHeader(hdr)
			}

			base := d.Name()
			if !opts.IncludeSecrets {
				if _, secret := SecretFileBasenames[base]; secret {
					return nil
				}
			}
			// Skip sqlite / binary caches by extension.
			lower := strings.ToLower(base)
			if strings.HasSuffix(lower, ".sqlite") ||
				strings.HasSuffix(lower, ".sqlite3") ||
				strings.HasSuffix(lower, ".db") ||
				strings.HasSuffix(lower, ".lock") {
				return nil
			}

			data, err := os.ReadFile(path)
			if err != nil {
				return fmt.Errorf("read %s: %w", path, err)
			}

			data = transformFile(base, data, opts)

			hdr := &tar.Header{
				Name:     relSlash,
				Mode:     0o644,
				Size:     int64(len(data)),
				Typeflag: tar.TypeReg,
			}
			if err := tw.WriteHeader(hdr); err != nil {
				return err
			}
			if _, err := tw.Write(data); err != nil {
				return err
			}
			return nil
		}); err != nil {
			return nil, err
		}
	}

	if err := tw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// PackToFile writes the archive to destPath and returns that path.
func PackToFile(opts PackOptions, destPath string) (string, error) {
	data, err := Pack(opts)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(destPath, data, 0o600); err != nil {
		return "", err
	}
	return destPath, nil
}

func transformFile(base string, data []byte, opts PackOptions) []byte {
	// Redact secrets in JSON.
	if strings.HasSuffix(strings.ToLower(base), ".json") {
		if redacted, ok := redactJSON(data); ok {
			data = redacted
		}
	}
	// Drop macOS-only MCP server entries when targeting Linux cloud home.
	if base == "settings.json" || base == "mcp.json" || base == "claude_desktop_config.json" {
		if cleaned, ok := dropMacOSOnlyMCP(data); ok {
			data = cleaned
		}
	}
	// Path rewrite for text-ish configs.
	if isTextConfig(base) {
		from := opts.LocalHomePrefix
		to := opts.TargetHome
		if from != "" && from != to {
			data = bytes.ReplaceAll(data, []byte(from), []byte(to))
			// Also rewrite file:// URLs and escaped variants if present.
			data = bytes.ReplaceAll(data, []byte("file://"+from), []byte("file://"+to))
		}
	}
	// TOML secret lines (simple key = "value" for known keys).
	if strings.HasSuffix(strings.ToLower(base), ".toml") && !opts.IncludeSecrets {
		data = redactTOMLSecrets(data)
	}
	return data
}

func isTextConfig(base string) bool {
	lower := strings.ToLower(base)
	for _, ext := range []string{".json", ".toml", ".yaml", ".yml", ".md", ".txt", ".sh", ".js", ".ts", ".mjs", ".cjs"} {
		if strings.HasSuffix(lower, ext) {
			return true
		}
	}
	// Common bare names.
	switch lower {
	case "config", "keybindings.json", "settings.json", "config.toml":
		return true
	}
	return false
}

func redactJSON(data []byte) ([]byte, bool) {
	var v any
	if err := json.Unmarshal(data, &v); err != nil {
		return nil, false
	}
	_ = redactValue(v)
	// Always re-encode when parse succeeds so path rewrite runs on stable JSON text.
	out, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return nil, false
	}
	return append(out, '\n'), true
}

func redactValue(v any) bool {
	changed := false
	switch t := v.(type) {
	case map[string]any:
		for k, child := range t {
			if _, secret := SecretJSONKeys[k]; secret {
				t[k] = ""
				changed = true
				continue
			}
			if redactValue(child) {
				changed = true
			}
		}
	case []any:
		for _, child := range t {
			if redactValue(child) {
				changed = true
			}
		}
	}
	return changed
}

// dropMacOSOnlyMCP removes MCP server entries whose command/args clearly target macOS paths
// (e.g. /Applications, *.app/Contents, npx under /Users only when command is absolute mac path).
func dropMacOSOnlyMCP(data []byte) ([]byte, bool) {
	var root map[string]any
	if err := json.Unmarshal(data, &root); err != nil {
		return nil, false
	}
	changed := false
	for _, key := range []string{"mcpServers", "mcp"} {
		raw, ok := root[key]
		if !ok {
			continue
		}
		servers, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		for name, srv := range servers {
			if isMacOSOnlyServer(srv) {
				delete(servers, name)
				changed = true
			}
		}
	}
	if !changed {
		return nil, false
	}
	out, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return nil, false
	}
	return append(out, '\n'), true
}

func isMacOSOnlyServer(srv any) bool {
	m, ok := srv.(map[string]any)
	if !ok {
		return false
	}
	fields := []string{}
	if cmd, ok := m["command"].(string); ok {
		fields = append(fields, cmd)
	}
	if args, ok := m["args"].([]any); ok {
		for _, a := range args {
			if s, ok := a.(string); ok {
				fields = append(fields, s)
			}
		}
	}
	joined := strings.Join(fields, " ")
	macMarkers := []string{
		"/Applications/",
		".app/Contents/",
		"/Library/Application Support/",
		"osascript",
	}
	for _, m := range macMarkers {
		if strings.Contains(joined, m) {
			return true
		}
	}
	return false
}

func redactTOMLSecrets(data []byte) []byte {
	lines := bytes.Split(data, []byte("\n"))
	out := make([][]byte, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(string(line))
		skip := false
		for key := range SecretJSONKeys {
			// key = "..." or key = '...'
			if strings.HasPrefix(trimmed, key+" ") || strings.HasPrefix(trimmed, key+"=") || strings.HasPrefix(trimmed, key+" =") {
				skip = true
				break
			}
		}
		if skip {
			// Keep key with empty string so structure is visible.
			// Prefer rewriting rather than dropping.
			eq := bytes.IndexByte(line, '=')
			if eq >= 0 {
				prefix := bytes.TrimRight(line[:eq+1], " \t")
				out = append(out, append(append([]byte{}, prefix...), []byte(` ""`)...))
			}
			continue
		}
		out = append(out, line)
	}
	return bytes.Join(out, []byte("\n"))
}

// ListTarNames returns file names inside a tar archive (for tests).
func ListTarNames(archive []byte) ([]string, error) {
	tr := tar.NewReader(bytes.NewReader(archive))
	var names []string
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		names = append(names, hdr.Name)
	}
	return names, nil
}

// ReadTarFile returns the contents of name from archive.
func ReadTarFile(archive []byte, name string) ([]byte, error) {
	tr := tar.NewReader(bytes.NewReader(archive))
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		if hdr.Name == name {
			return io.ReadAll(tr)
		}
	}
	return nil, fmt.Errorf("file %q not found in archive", name)
}
