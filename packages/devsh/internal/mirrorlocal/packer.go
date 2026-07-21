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
	// Sources lists relative home subdirs (legacy; ignored when IncludePaths is set).
	Sources []string
	// IncludePaths is an allowlist of paths relative to HomeDir (files or dirs).
	// Empty means DefaultIncludePaths.
	IncludePaths []string
}

// DefaultSources are the agent config roots mirrored in v1.
var DefaultSources = []string{".claude", ".codex"}

// DefaultIncludePaths are the only paths packed by default (relative to HomeDir).
// This is an allowlist — full-tree walks of ~/.claude / ~/.codex pull multi‑GB
// session history and blow CF/exec transfer limits. Skills may be directory
// symlinks (e.g. ~/.claude/skills/foo -> ~/.agents/skills/foo); those are followed.
var DefaultIncludePaths = []string{
	".claude/settings.json",
	".claude/config.json",
	".claude/keybindings.json",
	".claude/skills",
	".claude/hooks",
	".claude/commands",
	".codex/config.toml",
	".codex/keybindings.json",
	".codex/AGENTS.md",
	".codex/skills",
	".codex/hooks",
	".codex/automations",
}

// SecretFileBasenames are never copied unless IncludeSecrets is true.
var SecretFileBasenames = map[string]struct{}{
	"auth.json":         {},
	".credentials.json": {},
	"credentials.json":  {},
}

// ExcludeDirNames are skipped entirely when encountered under an include path.
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
	"shell_snapshots":   {},
	"statsig":           {},
	"todos":             {},
	"file-history":      {},
	"plugins":           {}, // large vendor trees; not needed for CLI settings
	"backups":           {},
	"node_modules":      {},
	".git":              {},
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
	includePaths := opts.IncludePaths
	if len(includePaths) == 0 {
		includePaths = append([]string(nil), DefaultIncludePaths...)
	}

	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)

	for _, relPath := range includePaths {
		relPath = strings.TrimPrefix(relPath, "~/")
		relPath = strings.TrimPrefix(relPath, "/")
		abs := filepath.Join(opts.HomeDir, relPath)
		info, err := os.Stat(abs)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			// Soft-skip unreadable include roots.
			continue
		}
		if info.IsDir() {
			// logical root == path as it appears under HomeDir (may be a symlink dir).
			if err := walkAndPack(tw, opts, abs, abs); err != nil {
				return nil, err
			}
			continue
		}
		// Single file include.
		if err := packFile(tw, opts, abs, relPath); err != nil {
			return nil, err
		}
	}

	if err := tw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// packFile packs one regular file (or symlink-to-file) at logicalRel under HomeDir.
func packFile(tw *tar.Writer, opts PackOptions, absPath, logicalRel string) error {
	base := filepath.Base(absPath)
	if !opts.IncludeSecrets {
		if _, secret := SecretFileBasenames[base]; secret {
			return nil
		}
	}
	lower := strings.ToLower(base)
	if strings.HasSuffix(lower, ".sqlite") ||
		strings.HasSuffix(lower, ".sqlite3") ||
		strings.HasSuffix(lower, ".db") ||
		strings.HasSuffix(lower, ".lock") ||
		strings.HasSuffix(lower, ".wal") ||
		strings.HasSuffix(lower, ".shm") {
		return nil
	}
	data, err := os.ReadFile(absPath)
	if err != nil {
		return nil
	}
	data = transformFile(base, data, opts)
	relSlash := filepath.ToSlash(logicalRel)
	// Ensure parent dir entries exist lightly (tar extract usually creates them).
	hdr := &tar.Header{
		Name:     relSlash,
		Mode:     0o644,
		Size:     int64(len(data)),
		Typeflag: tar.TypeReg,
	}
	if err := tw.WriteHeader(hdr); err != nil {
		return err
	}
	_, err = tw.Write(data)
	return err
}

// walkAndPack walks physicalRoot, packing files under archive names rooted at
// logicalRoot (both absolute). Directory symlinks under HomeDir
// (e.g. ~/.claude/skills/foo -> ~/.agents/skills/foo) are followed and archived
// under the symlink path, not the external target path.
// filepath.WalkDir does not descend into symlink dirs, so we re-enter manually.
func walkAndPack(tw *tar.Writer, opts PackOptions, logicalRoot, physicalRoot string) error {
	return filepath.WalkDir(physicalRoot, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			// Soft-skip unreadable entries so one bad file cannot abort the whole mirror.
			return nil
		}
		sub, err := filepath.Rel(physicalRoot, path)
		if err != nil {
			return nil
		}
		logicalBase, err := filepath.Rel(opts.HomeDir, logicalRoot)
		if err != nil {
			return nil
		}
		var rel string
		if sub == "." {
			rel = logicalBase
		} else {
			rel = filepath.Join(logicalBase, sub)
		}
		// Refuse to emit archive paths that escape HomeDir naming.
		if rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return nil
		}
		relSlash := filepath.ToSlash(rel)

		isDir, isSymlinkDir, err := entryDirKind(path, d)
		if err != nil {
			return nil
		}
		if isDir {
			base := d.Name()
			if _, skip := ExcludeDirNames[base]; skip && path != physicalRoot {
				return filepath.SkipDir
			}
			hdr := &tar.Header{
				Name:     relSlash + "/",
				Mode:     0o755,
				Typeflag: tar.TypeDir,
			}
			if err := tw.WriteHeader(hdr); err != nil {
				return err
			}
			// WalkDir does not descend into symlink directories; re-enter on the target.
			if isSymlinkDir {
				target, err := filepath.EvalSymlinks(path)
				if err != nil {
					return nil
				}
				// Archive names stay under the symlink path (path under HomeDir).
				if err := walkAndPack(tw, opts, path, target); err != nil {
					return err
				}
				return filepath.SkipDir
			}
			return nil
		}

		return packFile(tw, opts, path, rel)
	})
}

// entryDirKind reports whether path is a directory and whether it is a
// directory reached via a symlink (WalkDir will not descend into those).
func entryDirKind(path string, d fs.DirEntry) (isDir bool, isSymlinkDir bool, err error) {
	if d.IsDir() {
		return true, false, nil
	}
	if d.Type()&fs.ModeSymlink == 0 {
		// Regular file (or other non-dir, non-symlink).
		info, err := d.Info()
		if err != nil {
			// Fall back to Stat.
			st, err := os.Stat(path)
			if err != nil {
				return false, false, err
			}
			return st.IsDir(), false, nil
		}
		return info.IsDir(), false, nil
	}
	// Symlink: Stat follows to target.
	st, err := os.Stat(path)
	if err != nil {
		return false, false, err
	}
	if st.IsDir() {
		return true, true, nil
	}
	return false, false, nil
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
	if strings.HasSuffix(strings.ToLower(base), ".toml") {
		if !opts.IncludeSecrets {
			data = redactTOMLSecrets(data)
		}
		// After path rewrite, host project tables like [projects."$HOME/wiki"] and
		// pre-existing [projects."/root/wiki"] collapse to the same key. Codex
		// rejects duplicate TOML tables — keep the first occurrence of each header.
		data = dedupeTOMLTables(data)
	}
	return data
}

// dedupeTOMLTables drops repeated table headers (and their bodies) after rewrite.
// First occurrence of each exact header line wins. Handles standard TOML tables
// like [projects."/root/wiki"] used by Codex config.toml.
func dedupeTOMLTables(data []byte) []byte {
	lines := bytes.Split(data, []byte("\n"))
	seen := make(map[string]struct{})
	out := make([][]byte, 0, len(lines))
	skipping := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(string(line))
		isTable := len(trimmed) >= 3 &&
			trimmed[0] == '[' &&
			trimmed[len(trimmed)-1] == ']' &&
			!strings.HasPrefix(trimmed, "[[") // leave arrays-of-tables alone

		if isTable {
			if _, dup := seen[trimmed]; dup {
				skipping = true
				continue
			}
			seen[trimmed] = struct{}{}
			skipping = false
			out = append(out, line)
			continue
		}
		if skipping {
			// Skip body lines of a duplicate table until the next header.
			continue
		}
		out = append(out, line)
	}
	return bytes.Join(out, []byte("\n"))
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
