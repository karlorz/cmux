package pvelxc

import (
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/karlorz/devsh/internal/provider"
)

func TestIsPveLxcInstanceID(t *testing.T) {
	tests := []struct {
		id   string
		want bool
	}{
		{"pvelxc-abc123", true},
		{"cmux-200", true},
		{"200", true},
		{"cmux_abc123", false},
		{"morphvm_xyz", false},
		{"e2b-sandbox", false},
	}

	for _, tt := range tests {
		if got := provider.IsPveLxcInstanceID(tt.id); got != tt.want {
			t.Errorf("IsPveLxcInstanceID(%q) = %v, want %v", tt.id, got, tt.want)
		}
	}
}

func TestDetectProviderFromEnv(t *testing.T) {
	t.Setenv("PVE_API_URL", "https://pve.test:8006")
	t.Setenv("PVE_API_TOKEN", "root@pam!token=abc")
	t.Setenv("E2B_API_KEY", "")
	if got := provider.DetectFromEnv(); got != provider.PveLxc {
		t.Fatalf("DetectFromEnv() = %q, want %q", got, provider.PveLxc)
	}

	t.Setenv("PVE_API_URL", "")
	t.Setenv("PVE_API_TOKEN", "")
	t.Setenv("E2B_API_KEY", "")
	if got := provider.DetectFromEnv(); got != provider.Morph {
		t.Fatalf("DetectFromEnv() = %q, want %q", got, provider.Morph)
	}
}

func TestParseFirstDomainFromSearchList(t *testing.T) {
	tests := []struct {
		search string
		want   string
	}{
		{"example.com", ".example.com"},
		{"corp.example.com local", ".corp.example.com"},
		{"a.com b.com c.com", ".a.com"},
		{"  spaced.com  other.com  ", ".spaced.com"},
		{"", ""},
		{"   ", ""},
	}

	for _, tt := range tests {
		search := tt.search
		var got string
		trimmed := strings.TrimSpace(search)
		if trimmed == "" {
			got = ""
		} else {
			firstDomain := strings.Fields(trimmed)[0]
			got = "." + firstDomain
		}
		if got != tt.want {
			t.Errorf("parseFirstDomain(%q) = %q, want %q", tt.search, got, tt.want)
		}
	}
}

func TestNumericHostnameFallback(t *testing.T) {
	tests := []struct {
		instanceID string
		wantVMID   int
		wantOK     bool
	}{
		{"200", 200, true},
		{"cmux-200", 200, true},
		{"pvelxc-abc123", 0, false},
	}

	for _, tt := range tests {
		vmid, ok := ParseVMID(tt.instanceID)
		if ok != tt.wantOK {
			t.Errorf("ParseVMID(%q) ok = %v, want %v", tt.instanceID, ok, tt.wantOK)
		}
		if ok && vmid != tt.wantVMID {
			t.Errorf("ParseVMID(%q) = %d, want %d", tt.instanceID, vmid, tt.wantVMID)
		}

		// Test hostname fallback logic for numeric IDs
		if ok {
			hostname := normalizeHostID(tt.instanceID)
			if hostname == "" || reDigits.MatchString(hostname) {
				hostname = fmt.Sprintf("cmux-%d", vmid)
			}
			expected := fmt.Sprintf("cmux-%d", tt.wantVMID)
			if hostname != expected {
				t.Errorf("hostname fallback for %q = %q, want %q", tt.instanceID, hostname, expected)
			}
		}
	}
}

func TestExecURLFormat(t *testing.T) {
	host, err := ExecHostFromPublicDomain("example.com", 39375, "pvelxc-abc123")
	if err != nil {
		t.Fatalf("ExecHostFromPublicDomain() error = %v", err)
	}
	if host != "https://port-39375-pvelxc-abc123.example.com" {
		t.Fatalf("ExecHostFromPublicDomain() = %q", host)
	}

	execURL, err := buildExecURL(host)
	if err != nil {
		t.Fatalf("buildExecURL() error = %v", err)
	}
	if execURL != "https://port-39375-pvelxc-abc123.example.com/exec" {
		t.Fatalf("buildExecURL() = %q", execURL)
	}

	execURL2, err := buildExecURL("10.0.0.1:39375")
	if err != nil {
		t.Fatalf("buildExecURL(bare host) error = %v", err)
	}
	if execURL2 != "http://10.0.0.1:39375/exec" {
		t.Fatalf("buildExecURL(bare host) = %q", execURL2)
	}
}

func TestConfigStruct(t *testing.T) {
	cfg := Config{
		APIURL:       "https://pve.example.com:8006",
		APIToken:     "root@pam!token=secret",
		Node:         "pve1",
		PublicDomain: "example.com",
		VerifyTLS:    true,
	}

	if cfg.APIURL != "https://pve.example.com:8006" {
		t.Errorf("expected APIURL, got '%s'", cfg.APIURL)
	}
	if cfg.APIToken != "root@pam!token=secret" {
		t.Errorf("expected APIToken, got '%s'", cfg.APIToken)
	}
	if cfg.Node != "pve1" {
		t.Errorf("expected Node 'pve1', got '%s'", cfg.Node)
	}
	if cfg.PublicDomain != "example.com" {
		t.Errorf("expected PublicDomain 'example.com', got '%s'", cfg.PublicDomain)
	}
	if !cfg.VerifyTLS {
		t.Error("expected VerifyTLS true")
	}
}

func TestInstanceStruct(t *testing.T) {
	inst := Instance{
		ID:        "pvelxc-abc123",
		VMID:      200,
		Status:    "running",
		Hostname:  "cmux-200",
		FQDN:      "cmux-200.example.com",
		VSCodeURL: "https://vscode.example.com",
		WorkerURL: "https://worker.example.com",
		VNCURL:    "https://vnc.example.com",
		XTermURL:  "https://xterm.example.com",
	}

	if inst.ID != "pvelxc-abc123" {
		t.Errorf("expected ID 'pvelxc-abc123', got '%s'", inst.ID)
	}
	if inst.VMID != 200 {
		t.Errorf("expected VMID 200, got %d", inst.VMID)
	}
	if inst.Status != "running" {
		t.Errorf("expected Status 'running', got '%s'", inst.Status)
	}
	if inst.Hostname != "cmux-200" {
		t.Errorf("expected Hostname 'cmux-200', got '%s'", inst.Hostname)
	}
}

func TestStartOptionsStruct(t *testing.T) {
	opts := StartOptions{
		SnapshotID:   "snapshot_abc123",
		TemplateVMID: 9000,
		InstanceID:   "pvelxc-test",
	}

	if opts.SnapshotID != "snapshot_abc123" {
		t.Errorf("expected SnapshotID 'snapshot_abc123', got '%s'", opts.SnapshotID)
	}
	if opts.TemplateVMID != 9000 {
		t.Errorf("expected TemplateVMID 9000, got %d", opts.TemplateVMID)
	}
	if opts.InstanceID != "pvelxc-test" {
		t.Errorf("expected InstanceID 'pvelxc-test', got '%s'", opts.InstanceID)
	}
}

func TestStartOptionsDefaults(t *testing.T) {
	opts := StartOptions{}

	if opts.SnapshotID != "" {
		t.Errorf("expected empty SnapshotID, got '%s'", opts.SnapshotID)
	}
	if opts.TemplateVMID != 0 {
		t.Errorf("expected TemplateVMID 0, got %d", opts.TemplateVMID)
	}
	if opts.InstanceID != "" {
		t.Errorf("expected empty InstanceID, got '%s'", opts.InstanceID)
	}
}

func TestNewClientMissingAPIURL(t *testing.T) {
	_, err := NewClient(Config{
		APIToken: "token",
	})
	if err == nil {
		t.Error("expected error for missing APIURL")
	}
	if err != nil && !strings.Contains(err.Error(), "apiUrl") {
		t.Errorf("expected error about apiUrl, got: %v", err)
	}
}

func TestNewClientMissingAPIToken(t *testing.T) {
	_, err := NewClient(Config{
		APIURL: "https://pve.example.com:8006",
	})
	if err == nil {
		t.Error("expected error for missing APIToken")
	}
	if err != nil && !strings.Contains(err.Error(), "apiToken") {
		t.Errorf("expected error about apiToken, got: %v", err)
	}
}

func TestNewClientSuccess(t *testing.T) {
	client, err := NewClient(Config{
		APIURL:       "https://pve.example.com:8006",
		APIToken:     "root@pam!token=secret",
		Node:         "pve1",
		PublicDomain: "example.com",
		VerifyTLS:    false,
	})
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if client == nil {
		t.Fatal("expected client, got nil")
	}
}

func TestNewClientTrimsAPIURL(t *testing.T) {
	client, err := NewClient(Config{
		APIURL:   "  https://pve.example.com:8006/  ",
		APIToken: "token",
	})
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	// URL should be trimmed of whitespace and trailing slash
	if client.apiURL != "https://pve.example.com:8006" {
		t.Errorf("expected trimmed URL, got '%s'", client.apiURL)
	}
}

func TestRegexPatterns(t *testing.T) {
	// Test reDigits
	if !reDigits.MatchString("12345") {
		t.Error("expected reDigits to match '12345'")
	}
	if reDigits.MatchString("abc123") {
		t.Error("expected reDigits to NOT match 'abc123'")
	}

	// Test reCmuxVmid
	if !reCmuxVmid.MatchString("cmux-200") {
		t.Error("expected reCmuxVmid to match 'cmux-200'")
	}
	if reCmuxVmid.MatchString("cmux_200") {
		t.Error("expected reCmuxVmid to NOT match 'cmux_200'")
	}

	// Test reSnapshotID
	if !reSnapshotID.MatchString("snapshot_abc123") {
		t.Error("expected reSnapshotID to match 'snapshot_abc123'")
	}
	if reSnapshotID.MatchString("snapshot-abc123") {
		t.Error("expected reSnapshotID to NOT match 'snapshot-abc123'")
	}
}

func TestResolveSnapshotUsesBuiltInDefaultPair(t *testing.T) {
	client, err := NewClient(Config{
		APIURL:   "https://pve.example.com:8006",
		APIToken: "root@pam!token=secret",
	})
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	snapshotID, templateVMID, err := client.resolveSnapshot("")
	if err != nil {
		t.Fatalf("resolveSnapshot(\"\") error = %v", err)
	}
	if snapshotID != defaultSnapshotID {
		t.Fatalf("resolveSnapshot(\"\") snapshotID = %q, want %q", snapshotID, defaultSnapshotID)
	}
	if templateVMID != defaultTemplateVMID {
		t.Fatalf("resolveSnapshot(\"\") templateVMID = %d, want %d", templateVMID, defaultTemplateVMID)
	}
	if templateVMID == 9045 {
		t.Fatalf("resolveSnapshot(\"\") unexpectedly returned stale template VMID 9045")
	}
}

func TestResolveSnapshotExplicitCurrentDefault(t *testing.T) {
	client, err := NewClient(Config{
		APIURL:   "https://pve.example.com:8006",
		APIToken: "root@pam!token=secret",
	})
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}

	snapshotID, templateVMID, err := client.resolveSnapshot(defaultSnapshotID)
	if err != nil {
		t.Fatalf("resolveSnapshot(defaultSnapshotID) error = %v", err)
	}
	if snapshotID != defaultSnapshotID {
		t.Fatalf("resolveSnapshot(defaultSnapshotID) snapshotID = %q, want %q", snapshotID, defaultSnapshotID)
	}
	if templateVMID != defaultTemplateVMID {
		t.Fatalf("resolveSnapshot(defaultSnapshotID) templateVMID = %d, want %d", templateVMID, defaultTemplateVMID)
	}
}

func TestResolveSnapshotFromManifestOrDefaultUsesUpdatedFallback(t *testing.T) {
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd() error = %v", err)
	}
	if err := os.Chdir(t.TempDir()); err != nil {
		t.Fatalf("Chdir(tempDir) error = %v", err)
	}
	defer func() {
		if err := os.Chdir(wd); err != nil {
			t.Fatalf("restore cwd error = %v", err)
		}
	}()

	templateVMID, err := resolveSnapshotFromManifestOrDefault("")
	if err != nil {
		t.Fatalf("resolveSnapshotFromManifestOrDefault(\"\") error = %v", err)
	}
	if templateVMID != defaultTemplateVMID {
		t.Fatalf("resolveSnapshotFromManifestOrDefault(\"\") = %d, want %d", templateVMID, defaultTemplateVMID)
	}
	if templateVMID == 9045 {
		t.Fatalf("resolveSnapshotFromManifestOrDefault(\"\") unexpectedly returned stale template VMID 9045")
	}
}
