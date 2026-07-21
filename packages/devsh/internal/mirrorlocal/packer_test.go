package mirrorlocal

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTree(t *testing.T, root string, files map[string]string) {
	t.Helper()
	for rel, body := range files {
		path := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}
}

func TestPackAllowlistRedactRewriteExcludeSecrets(t *testing.T) {
	t.Parallel()

	home := t.TempDir()
	localHome := "/Users/karlchow"
	// Build a fake home tree under temp, but rewrite from the real macOS prefix.
	writeTree(t, home, map[string]string{
		".claude/settings.json": `{
  "apiKey": "sk-secret-should-go",
  "env": {"ANTHROPIC_API_KEY": "secret-env"},
  "mcpServers": {
    "ok-server": {"command": "npx", "args": ["-y", "some-mcp"]},
    "mac-only": {"command": "/Applications/Some.app/Contents/MacOS/tool", "args": []}
  },
  "notes": "path lives at /Users/karlchow/.claude/skills"
}
`,
		".claude/skills/hello/SKILL.md": "# Hello\npath: /Users/karlchow/.claude/skills/hello\n",
		".claude/projects/old/session.json": `{"should":"not appear"}`,
		".claude/sessions/s1.json":          `{"session":true}`,
		".claude/cache/x.bin":               "binary",
		".codex/config.toml": `model = "gpt"
api_key = "sk-codex-secret"
home = "/Users/karlchow/.codex"
`,
		".codex/auth.json": `{"tokens":{"access_token":"nope"}}`,
		".codex/skills/foo.md": "skill at /Users/karlchow/.codex/skills\n",
	})

	archive, err := Pack(PackOptions{
		HomeDir:         home,
		LocalHomePrefix: localHome,
		TargetHome:      "/root",
		IncludeSecrets:  false,
	})
	if err != nil {
		t.Fatalf("Pack: %v", err)
	}

	names, err := ListTarNames(archive)
	if err != nil {
		t.Fatalf("ListTarNames: %v", err)
	}
	joined := strings.Join(names, "\n")

	// Included
	for _, want := range []string{
		".claude/settings.json",
		".claude/skills/hello/SKILL.md",
		".codex/config.toml",
		".codex/skills/foo.md",
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("expected archive to include %q; names:\n%s", want, joined)
		}
	}

	// Excluded dirs / secrets
	for _, ban := range []string{
		".claude/projects/",
		".claude/sessions/",
		".claude/cache/",
		".codex/auth.json",
	} {
		if strings.Contains(joined, ban) {
			t.Errorf("archive must not include %q; names:\n%s", ban, joined)
		}
	}

	settings, err := ReadTarFile(archive, ".claude/settings.json")
	if err != nil {
		t.Fatalf("settings: %v", err)
	}
	s := string(settings)
	if strings.Contains(s, "sk-secret-should-go") || strings.Contains(s, "secret-env") {
		t.Errorf("settings still contains secrets:\n%s", s)
	}
	if strings.Contains(s, localHome) {
		t.Errorf("settings still contains local home prefix %q:\n%s", localHome, s)
	}
	if !strings.Contains(s, "/root/.claude/skills") {
		t.Errorf("settings missing rewritten path:\n%s", s)
	}
	if strings.Contains(s, "mac-only") || strings.Contains(s, "/Applications/") {
		t.Errorf("macOS-only MCP should be dropped:\n%s", s)
	}
	if !strings.Contains(s, "ok-server") {
		t.Errorf("portable MCP should remain:\n%s", s)
	}

	cfg, err := ReadTarFile(archive, ".codex/config.toml")
	if err != nil {
		t.Fatalf("config.toml: %v", err)
	}
	c := string(cfg)
	if strings.Contains(c, "sk-codex-secret") {
		t.Errorf("config.toml still has api_key secret:\n%s", c)
	}
	if strings.Contains(c, localHome) {
		t.Errorf("config.toml still has local home:\n%s", c)
	}
	if !strings.Contains(c, `/root/.codex`) {
		t.Errorf("config.toml missing rewritten home:\n%s", c)
	}

	skill, err := ReadTarFile(archive, ".claude/skills/hello/SKILL.md")
	if err != nil {
		t.Fatalf("skill: %v", err)
	}
	if strings.Contains(string(skill), localHome) {
		t.Errorf("skill path not rewritten:\n%s", skill)
	}
}

func TestPackSkipsMissingSources(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	// Only .claude present
	writeTree(t, home, map[string]string{
		".claude/keybindings.json": `{"bindings":[]}`,
	})
	archive, err := Pack(PackOptions{HomeDir: home, TargetHome: "/root"})
	if err != nil {
		t.Fatalf("Pack: %v", err)
	}
	names, err := ListTarNames(archive)
	if err != nil {
		t.Fatalf("names: %v", err)
	}
	joined := strings.Join(names, "\n")
	if !strings.Contains(joined, ".claude/keybindings.json") {
		t.Fatalf("missing keybindings: %s", joined)
	}
	if strings.Contains(joined, ".codex/") {
		t.Fatalf("unexpected codex entry: %s", joined)
	}
}

func TestPackIncludeSecretsKeepsAuthJSON(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	writeTree(t, home, map[string]string{
		".codex/auth.json": `{"ok":true}`,
	})
	// auth.json is not in DefaultIncludePaths; opt-in requires both IncludeSecrets and path.
	archive, err := Pack(PackOptions{
		HomeDir:        home,
		IncludeSecrets: true,
		IncludePaths:   []string{".codex/auth.json"},
	})
	if err != nil {
		t.Fatalf("Pack: %v", err)
	}
	if _, err := ReadTarFile(archive, ".codex/auth.json"); err != nil {
		t.Fatalf("auth.json should be present when IncludeSecrets + path: %v", err)
	}

	// Default allowlist never packs auth.json even if secrets flag is on without path.
	archive2, err := Pack(PackOptions{HomeDir: home, IncludeSecrets: true})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ReadTarFile(archive2, ".codex/auth.json"); err == nil {
		t.Fatal("default allowlist must not pack auth.json")
	}
}

func TestPackDefaultAllowlistSkipsHistoryAndPlugins(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	writeTree(t, home, map[string]string{
		".claude/settings.json":            `{"ok":true}` + "\n",
		".claude/projects/p/session.json":  `{"no":true}`,
		".claude/plugins/big/vendor.js":    "huge",
		".claude/file-history/x":           "hist",
		".codex/config.toml":               "model = \"x\"\n",
		".codex/sessions/s1.json":          `{}`,
		".codex/archived_sessions/a.json":  `{}`,
		".codex/plugins/p/x.js":            "p",
	})
	archive, err := Pack(PackOptions{HomeDir: home, TargetHome: "/root"})
	if err != nil {
		t.Fatal(err)
	}
	names, _ := ListTarNames(archive)
	joined := strings.Join(names, "\n")
	for _, ban := range []string{"projects/", "plugins/", "file-history/", "sessions/", "archived_sessions/"} {
		if strings.Contains(joined, ban) {
			t.Errorf("must not include %q; got:\n%s", ban, joined)
		}
	}
	if _, err := ReadTarFile(archive, ".claude/settings.json"); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadTarFile(archive, ".codex/config.toml"); err != nil {
		t.Fatal(err)
	}
}

func TestPackFollowsDirectorySymlinksForSkills(t *testing.T) {
	t.Parallel()

	home := t.TempDir()
	// Real skill content outside .claude (like ~/.agents/skills/boost-prompt)
	agents := filepath.Join(home, ".agents", "skills", "boost-prompt")
	writeTree(t, home, map[string]string{
		".claude/settings.json":               `{"model":"claude"}` + "\n",
		".codex/config.toml":                  "model = \"gpt\"\n",
		".agents/skills/boost-prompt/SKILL.md": "# boost\n",
		".agents/skills/boost-prompt/nested/x.json": `{"a":1}` + "\n",
	})
	// Symlink skill dir into .claude/skills (macOS-dev layout)
	skillsDir := filepath.Join(home, ".claude", "skills")
	if err := os.MkdirAll(skillsDir, 0o755); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(skillsDir, "boost-prompt")
	if err := os.Symlink(agents, link); err != nil {
		t.Fatalf("symlink: %v", err)
	}
	// Also a file symlink
	realFile := filepath.Join(home, ".agents", "skills", "boost-prompt", "SKILL.md")
	fileLink := filepath.Join(home, ".claude", "skills", "boost-link.md")
	if err := os.Symlink(realFile, fileLink); err != nil {
		t.Fatalf("file symlink: %v", err)
	}

	archive, err := Pack(PackOptions{
		HomeDir:    home,
		TargetHome: "/root",
	})
	if err != nil {
		t.Fatalf("Pack must succeed with dir symlinks (got %v)", err)
	}

	// Core configs must always ship even when skills are symlinked
	for _, want := range []string{
		".claude/settings.json",
		".codex/config.toml",
		".claude/skills/boost-prompt/SKILL.md",
		".claude/skills/boost-prompt/nested/x.json",
		".claude/skills/boost-link.md",
	} {
		if _, err := ReadTarFile(archive, want); err != nil {
			t.Errorf("missing %s: %v", want, err)
		}
	}
	// External real path should not appear as archive root
	names, _ := ListTarNames(archive)
	joined := strings.Join(names, "\n")
	if strings.Contains(joined, ".agents/") {
		t.Errorf("archive should use symlink path names, not external target: %s", joined)
	}
}

func TestPackContinuesWhenSingleEntryUnreadable(t *testing.T) {
	t.Parallel()
	home := t.TempDir()
	writeTree(t, home, map[string]string{
		".claude/settings.json":        `{"ok":true}` + "\n",
		".claude/skills/good/SKILL.md": "hello\n",
	})
	// Unreadable file under an included dir — pack should skip it, not fail whole archive
	bad := filepath.Join(home, ".claude", "skills", "secret-unreadable.bin")
	if err := os.WriteFile(bad, []byte("x"), 0o000); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chmod(bad, 0o644) })

	archive, err := Pack(PackOptions{HomeDir: home, TargetHome: "/root"})
	if err != nil {
		t.Fatalf("Pack should soft-skip unreadable files: %v", err)
	}
	if _, err := ReadTarFile(archive, ".claude/settings.json"); err != nil {
		t.Fatalf("settings should still be packed: %v", err)
	}
	if _, err := ReadTarFile(archive, ".claude/skills/good/SKILL.md"); err != nil {
		t.Fatalf("skill should still be packed: %v", err)
	}
}
