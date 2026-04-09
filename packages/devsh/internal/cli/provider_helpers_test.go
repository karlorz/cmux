package cli

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/karlorz/devsh/internal/provider"
)

func TestResolveProviderForCommandUsesServerSandboxProviderWhenLocalEnvUnset(t *testing.T) {
	t.Setenv("PVE_API_URL", "")
	t.Setenv("PVE_API_TOKEN", "")
	t.Setenv("E2B_API_KEY", "")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/config/sandbox" {
			t.Fatalf("unexpected request path %q", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"provider":"pve-lxc",
			"providerDisplayName":"PVE LXC",
			"presets":[],
			"defaultPresetId":"",
			"capabilities":{
				"supportsHibernate":true,
				"supportsSnapshots":true,
				"supportsResize":true,
				"supportsNestedVirt":false,
				"supportsGpu":false
			}
		}`))
	}))
	t.Cleanup(server.Close)
	t.Setenv("CMUX_API_URL", server.URL)

	previousProvider := flagProvider
	flagProvider = ""
	t.Cleanup(func() {
		flagProvider = previousProvider
	})

	selected, err := resolveProviderForCommand()
	if err != nil {
		t.Fatalf("resolveProviderForCommand returned error: %v", err)
	}
	if selected != provider.PveLxc {
		t.Fatalf("resolveProviderForCommand returned %q, want %q", selected, provider.PveLxc)
	}
}

func TestResolveProviderForCommandPrefersLocalProviderEnv(t *testing.T) {
	t.Setenv("PVE_API_URL", "https://pve.example.com")
	t.Setenv("PVE_API_TOKEN", "token")
	t.Setenv("E2B_API_KEY", "")
	t.Setenv("CMUX_API_URL", "http://127.0.0.1:1")

	previousProvider := flagProvider
	flagProvider = ""
	t.Cleanup(func() {
		flagProvider = previousProvider
	})

	selected, err := resolveProviderForCommand()
	if err != nil {
		t.Fatalf("resolveProviderForCommand returned error: %v", err)
	}
	if selected != provider.PveLxc {
		t.Fatalf("resolveProviderForCommand returned %q, want %q", selected, provider.PveLxc)
	}
}

func TestResolveProviderForCommandFallsBackToMorphWhenServerLookupFails(t *testing.T) {
	t.Setenv("PVE_API_URL", "")
	t.Setenv("PVE_API_TOKEN", "")
	t.Setenv("E2B_API_KEY", "")
	t.Setenv("CMUX_API_URL", "http://127.0.0.1:1")

	previousProvider := flagProvider
	flagProvider = ""
	t.Cleanup(func() {
		flagProvider = previousProvider
	})

	selected, err := resolveProviderForCommand()
	if err != nil {
		t.Fatalf("resolveProviderForCommand returned error: %v", err)
	}
	if selected != provider.Morph {
		t.Fatalf("resolveProviderForCommand returned %q, want %q", selected, provider.Morph)
	}
}
