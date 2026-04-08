package cli

import (
	"testing"

	"github.com/karlorz/devsh/internal/provider"
)

func TestResolveStartMode(t *testing.T) {
	t.Run("explicit provider keeps direct provider flow", func(t *testing.T) {
		t.Setenv("PVE_API_URL", "")
		t.Setenv("PVE_API_TOKEN", "")
		t.Setenv("E2B_API_KEY", "")

		mode, err := resolveStartMode("morph")
		if err != nil {
			t.Fatalf("resolveStartMode returned error: %v", err)
		}
		if mode.provider != provider.Morph || mode.serverManaged {
			t.Fatalf("resolveStartMode returned %#v, want explicit direct morph flow", mode)
		}
	})

	t.Run("local pve env keeps direct pve flow", func(t *testing.T) {
		t.Setenv("PVE_API_URL", "https://pve.example.com")
		t.Setenv("PVE_API_TOKEN", "token")
		t.Setenv("E2B_API_KEY", "")

		mode, err := resolveStartMode("")
		if err != nil {
			t.Fatalf("resolveStartMode returned error: %v", err)
		}
		if mode.provider != provider.PveLxc || mode.serverManaged {
			t.Fatalf("resolveStartMode returned %#v, want direct pve-lxc flow", mode)
		}
	})

	t.Run("no explicit provider and no local provider env uses server managed start", func(t *testing.T) {
		t.Setenv("PVE_API_URL", "")
		t.Setenv("PVE_API_TOKEN", "")
		t.Setenv("E2B_API_KEY", "")

		mode, err := resolveStartMode("")
		if err != nil {
			t.Fatalf("resolveStartMode returned error: %v", err)
		}
		if !mode.serverManaged {
			t.Fatalf("resolveStartMode returned %#v, want server-managed default flow", mode)
		}
	})
}
