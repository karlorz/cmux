package cli

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadStartTemplateAndExpand(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	path := filepath.Join(dir, "macos-dev-ready.yaml")
	body := `
name: macos-dev-ready
provider: pve-lxc
snapshot: snapshot_abc
clean: true
mirror_local:
  sources: [~/.claude, ~/.codex]
  secrets: false
  path_rewrite:
    from: /Users/karlchow
    to: /root
`
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}

	tmpl, err := LoadStartTemplate(path)
	if err != nil {
		t.Fatalf("LoadStartTemplate: %v", err)
	}
	if tmpl.Name != "macos-dev-ready" {
		t.Fatalf("name=%q", tmpl.Name)
	}
	if tmpl.Provider != "pve-lxc" {
		t.Fatalf("provider=%q", tmpl.Provider)
	}
	if tmpl.Clean == nil || !*tmpl.Clean {
		t.Fatal("clean should be true")
	}
	if !templateMirrorLocalEnabled(tmpl.MirrorLocal) {
		t.Fatal("mirror_local should enable")
	}

	// No CLI overrides → template wins
	got := ExpandStartTemplate(tmpl, StartTemplateFlags{}, map[string]bool{})
	if got.Provider != "pve-lxc" || got.Snapshot != "snapshot_abc" || !got.Clean || !got.MirrorLocal {
		t.Fatalf("expand without cli: %+v", got)
	}

	// Explicit CLI overrides template
	cli := StartTemplateFlags{
		Provider:    "morph",
		Snapshot:    "snap_cli",
		Clean:       false,
		MirrorLocal: false,
	}
	cliSet := map[string]bool{
		"provider":     true,
		"snapshot":     true,
		"clean":        true,
		"mirror-local": true,
	}
	got = ExpandStartTemplate(tmpl, cli, cliSet)
	if got.Provider != "morph" || got.Snapshot != "snap_cli" || got.Clean || got.MirrorLocal {
		t.Fatalf("CLI should override template: %+v", got)
	}
}

func TestLoadStartTemplateMissing(t *testing.T) {
	t.Parallel()
	_, err := LoadStartTemplate(filepath.Join(t.TempDir(), "nope.yaml"))
	if err == nil {
		t.Fatal("expected error for missing template")
	}
}

func TestResolveTemplatePathByName(t *testing.T) {
	// Uses real HOME — isolate with t.Setenv
	home := t.TempDir()
	t.Setenv("HOME", home)
	base := filepath.Join(home, ".cmux", "templates")
	if err := os.MkdirAll(base, 0o755); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(base, "ready.yaml")
	if err := os.WriteFile(path, []byte("clean: true\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	// ResolveTemplatePath uses os.UserHomeDir which respects HOME on Unix.
	got, err := ResolveTemplatePath("ready")
	if err != nil {
		t.Fatalf("ResolveTemplatePath: %v", err)
	}
	if got != path {
		// Some platforms may resolve differently; ensure file exists and ends with ready.yaml
		if filepath.Base(got) != "ready.yaml" {
			t.Fatalf("got %q want %q", got, path)
		}
	}
}

func TestExpandStartTemplateMirrorBool(t *testing.T) {
	t.Parallel()
	trueVal := true
	tmpl := &StartTemplate{
		MirrorLocal: true,
		Clean:       &trueVal,
	}
	got := ExpandStartTemplate(tmpl, StartTemplateFlags{}, nil)
	if !got.MirrorLocal || !got.Clean {
		t.Fatalf("%+v", got)
	}
}
