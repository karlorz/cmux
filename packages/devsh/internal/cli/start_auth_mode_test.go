package cli

import (
	"strings"
	"testing"
)

func TestResolveStartAuthModeMatrix(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name        string
		noAuth      bool
		clean       bool
		mirrorLocal bool
		wantOwn     bool
		wantSetup   bool
		wantWarnSub string
	}{
		{
			name:      "default records ownership and setup",
			wantOwn:   true,
			wantSetup: true,
		},
		{
			name:      "clean records ownership skips setup",
			clean:     true,
			wantOwn:   true,
			wantSetup: false,
		},
		{
			name:      "no-auth skips both",
			noAuth:    true,
			wantOwn:   false,
			wantSetup: false,
		},
		{
			name:        "no-auth wins over clean",
			noAuth:      true,
			clean:       true,
			wantOwn:     false,
			wantSetup:   false,
			wantWarnSub: "--no-auth wins over --clean",
		},
		{
			name:        "mirror-local auto-implies clean for auth",
			mirrorLocal: true,
			wantOwn:     true,
			wantSetup:   false,
			wantWarnSub: "--mirror-local implies --clean",
		},
		{
			name:        "mirror-local with clean still records ownership",
			clean:       true,
			mirrorLocal: true,
			wantOwn:     true,
			wantSetup:   false,
		},
		{
			name:        "no-auth wins over mirror-local",
			noAuth:      true,
			mirrorLocal: true,
			wantOwn:     false,
			wantSetup:   false,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := ResolveStartAuthMode(tc.noAuth, tc.clean, tc.mirrorLocal)
			if got.RecordOwnership != tc.wantOwn {
				t.Fatalf("RecordOwnership: got %v want %v", got.RecordOwnership, tc.wantOwn)
			}
			if got.SetupProviders != tc.wantSetup {
				t.Fatalf("SetupProviders: got %v want %v", got.SetupProviders, tc.wantSetup)
			}
			if tc.wantWarnSub != "" && !strings.Contains(got.Warning, tc.wantWarnSub) {
				t.Fatalf("Warning %q does not contain %q", got.Warning, tc.wantWarnSub)
			}
		})
	}
}
