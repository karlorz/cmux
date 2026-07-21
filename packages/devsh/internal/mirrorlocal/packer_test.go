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
	archive, err := Pack(PackOptions{
		HomeDir:        home,
		IncludeSecrets: true,
	})
	if err != nil {
		t.Fatalf("Pack: %v", err)
	}
	if _, err := ReadTarFile(archive, ".codex/auth.json"); err != nil {
		t.Fatalf("auth.json should be present when IncludeSecrets: %v", err)
	}
}
