package cli

import (
	"testing"

	"github.com/karlorz/devsh/internal/pvelxc"
)

func TestResolveSandboxTimezone(t *testing.T) {
	t.Run("prefers TZ", func(t *testing.T) {
		t.Setenv("TZ", "Asia/Tokyo")
		t.Setenv("DEFAULT_SANDBOX_TIMEZONE", "America/Los_Angeles")

		if got := resolveSandboxTimezone(); got != "Asia/Tokyo" {
			t.Fatalf("resolveSandboxTimezone() = %q, want %q", got, "Asia/Tokyo")
		}
	})

	t.Run("falls back to DEFAULT_SANDBOX_TIMEZONE", func(t *testing.T) {
		t.Setenv("TZ", "")
		t.Setenv("DEFAULT_SANDBOX_TIMEZONE", "Europe/Berlin")

		if got := resolveSandboxTimezone(); got != "Europe/Berlin" {
			t.Fatalf("resolveSandboxTimezone() = %q, want %q", got, "Europe/Berlin")
		}
	})

	t.Run("uses built-in default", func(t *testing.T) {
		t.Setenv("TZ", "")
		t.Setenv("DEFAULT_SANDBOX_TIMEZONE", "")

		if got := resolveSandboxTimezone(); got != pvelxc.DefaultSandboxTimezone {
			t.Fatalf("resolveSandboxTimezone() = %q, want %q", got, pvelxc.DefaultSandboxTimezone)
		}
	})
}
