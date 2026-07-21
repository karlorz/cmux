package mirrorlocal

import (
	"os"
	"strings"
	"testing"
)

func TestPackRealUserHomeSmoke(t *testing.T) {
	if os.Getenv("MIRRORLOCAL_REAL_HOME") != "1" {
		t.Skip("set MIRRORLOCAL_REAL_HOME=1 to pack the real $HOME")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	archive, err := Pack(PackOptions{HomeDir: home, TargetHome: "/root"})
	if err != nil {
		t.Fatalf("Pack real home: %v", err)
	}
	names, err := ListTarNames(archive)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(names, "\n")
	// settings / config if present on this machine
	if _, err := os.Stat(home + "/.claude/settings.json"); err == nil {
		if _, err := ReadTarFile(archive, ".claude/settings.json"); err != nil {
			t.Fatalf("settings.json missing from archive: %v", err)
		}
	}
	if _, err := os.Stat(home + "/.codex/config.toml"); err == nil {
		if _, err := ReadTarFile(archive, ".codex/config.toml"); err != nil {
			t.Fatalf("config.toml missing from archive: %v", err)
		}
	}
	if strings.Contains(joined, "auth.json") {
		t.Error("auth.json must not be packed by default")
	}
	t.Logf("packed %d entries, %d bytes", len(names), len(archive))
}
