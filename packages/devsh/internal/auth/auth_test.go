// Package auth provides authentication for the devsh CLI via Stack Auth.
package auth

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSetBuildMode(t *testing.T) {
	// Save original
	orig := buildMode
	defer func() { buildMode = orig }()

	SetBuildMode("dev")
	if GetBuildMode() != "dev" {
		t.Errorf("expected mode 'dev', got '%s'", GetBuildMode())
	}

	SetBuildMode("prod")
	if GetBuildMode() != "prod" {
		t.Errorf("expected mode 'prod', got '%s'", GetBuildMode())
	}

	// Invalid mode should be ignored
	SetBuildMode("invalid")
	if GetBuildMode() != "prod" {
		t.Errorf("expected mode to remain 'prod' after invalid set, got '%s'", GetBuildMode())
	}
}

func TestGetDefaultsForMode(t *testing.T) {
	// Save original
	orig := buildMode
	defer func() { buildMode = orig }()

	// Test dev mode
	SetBuildMode("dev")
	projectID, publishableKey, cmuxURL, convexSiteURL, serverURL := getDefaultsForMode()

	if projectID != DevProjectID {
		t.Errorf("dev mode: expected DevProjectID, got '%s'", projectID)
	}
	if publishableKey != DevPublishableKey {
		t.Errorf("dev mode: expected DevPublishableKey, got '%s'", publishableKey)
	}
	if cmuxURL != DevCmuxURL {
		t.Errorf("dev mode: expected DevCmuxURL, got '%s'", cmuxURL)
	}
	if convexSiteURL != DevConvexSiteURL {
		t.Errorf("dev mode: expected DevConvexSiteURL, got '%s'", convexSiteURL)
	}
	if serverURL != DevServerURL {
		t.Errorf("dev mode: expected DevServerURL, got '%s'", serverURL)
	}

	// Test prod mode
	SetBuildMode("prod")
	projectID, publishableKey, cmuxURL, convexSiteURL, serverURL = getDefaultsForMode()

	if projectID != ProdProjectID {
		t.Errorf("prod mode: expected ProdProjectID, got '%s'", projectID)
	}
	if publishableKey != ProdPublishableKey {
		t.Errorf("prod mode: expected ProdPublishableKey, got '%s'", publishableKey)
	}
	if cmuxURL != ProdCmuxURL {
		t.Errorf("prod mode: expected ProdCmuxURL, got '%s'", cmuxURL)
	}
	if convexSiteURL != ProdConvexSiteURL {
		t.Errorf("prod mode: expected ProdConvexSiteURL, got '%s'", convexSiteURL)
	}
	// Prod mode has empty serverURL by default
	if serverURL != "" {
		t.Errorf("prod mode: expected empty serverURL, got '%s'", serverURL)
	}
}

func TestSetConfigOverrides(t *testing.T) {
	// Save originals
	origProjectID := cliProjectID
	origPublishableKey := cliPublishableKey
	origCmuxURL := cliCmuxURL
	origConvexSiteURL := cliConvexSiteURL
	defer func() {
		cliProjectID = origProjectID
		cliPublishableKey = origPublishableKey
		cliCmuxURL = origCmuxURL
		cliConvexSiteURL = origConvexSiteURL
	}()

	SetConfigOverrides("test-project", "test-key", "http://test.com", "http://convex.test")

	if cliProjectID != "test-project" {
		t.Errorf("expected cliProjectID 'test-project', got '%s'", cliProjectID)
	}
	if cliPublishableKey != "test-key" {
		t.Errorf("expected cliPublishableKey 'test-key', got '%s'", cliPublishableKey)
	}
	if cliCmuxURL != "http://test.com" {
		t.Errorf("expected cliCmuxURL 'http://test.com', got '%s'", cliCmuxURL)
	}
	if cliConvexSiteURL != "http://convex.test" {
		t.Errorf("expected cliConvexSiteURL 'http://convex.test', got '%s'", cliConvexSiteURL)
	}
}

func TestSetServerURLOverride(t *testing.T) {
	orig := cliServerURL
	defer func() { cliServerURL = orig }()

	SetServerURLOverride("http://server.test")
	if cliServerURL != "http://server.test" {
		t.Errorf("expected cliServerURL 'http://server.test', got '%s'", cliServerURL)
	}
}

func TestLoadEnvFileSkipComment(t *testing.T) {
	// Create temp dir with .env file
	tmpDir := t.TempDir()
	envPath := filepath.Join(tmpDir, ".env")

	// Write test .env file
	content := `# This is a comment
TEST_AUTH_VAR=test_value
# Another comment
TEST_AUTH_VAR2="quoted value"
TEST_AUTH_VAR3='single quoted'
`
	if err := os.WriteFile(envPath, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write .env: %v", err)
	}

	// Change to temp dir
	origDir, _ := os.Getwd()
	os.Chdir(tmpDir)
	defer os.Chdir(origDir)

	// Reset envLoaded flag
	origEnvLoaded := envLoaded
	envLoaded = false
	defer func() { envLoaded = origEnvLoaded }()

	// Clear test vars
	os.Unsetenv("TEST_AUTH_VAR")
	os.Unsetenv("TEST_AUTH_VAR2")
	os.Unsetenv("TEST_AUTH_VAR3")

	LoadEnvFile()

	// Check values were loaded
	if v := os.Getenv("TEST_AUTH_VAR"); v != "test_value" {
		t.Errorf("expected TEST_AUTH_VAR='test_value', got '%s'", v)
	}
	if v := os.Getenv("TEST_AUTH_VAR2"); v != "quoted value" {
		t.Errorf("expected TEST_AUTH_VAR2='quoted value', got '%s'", v)
	}
	if v := os.Getenv("TEST_AUTH_VAR3"); v != "single quoted" {
		t.Errorf("expected TEST_AUTH_VAR3='single quoted', got '%s'", v)
	}

	// Clean up
	os.Unsetenv("TEST_AUTH_VAR")
	os.Unsetenv("TEST_AUTH_VAR2")
	os.Unsetenv("TEST_AUTH_VAR3")
}

func TestLoadEnvFileDoesNotOverwrite(t *testing.T) {
	tmpDir := t.TempDir()
	envPath := filepath.Join(tmpDir, ".env")

	content := `TEST_AUTH_EXISTING=new_value`
	if err := os.WriteFile(envPath, []byte(content), 0644); err != nil {
		t.Fatalf("failed to write .env: %v", err)
	}

	origDir, _ := os.Getwd()
	os.Chdir(tmpDir)
	defer os.Chdir(origDir)

	// Reset envLoaded flag
	origEnvLoaded := envLoaded
	envLoaded = false
	defer func() { envLoaded = origEnvLoaded }()

	// Set existing value
	os.Setenv("TEST_AUTH_EXISTING", "original_value")
	defer os.Unsetenv("TEST_AUTH_EXISTING")

	LoadEnvFile()

	// Should NOT overwrite existing value
	if v := os.Getenv("TEST_AUTH_EXISTING"); v != "original_value" {
		t.Errorf("expected TEST_AUTH_EXISTING to remain 'original_value', got '%s'", v)
	}
}

func TestConstants(t *testing.T) {
	// Verify constants are defined
	if KeychainService != "cmux" {
		t.Errorf("expected KeychainService 'cmux', got '%s'", KeychainService)
	}
	if ConfigDirName != "cmux" {
		t.Errorf("expected ConfigDirName 'cmux', got '%s'", ConfigDirName)
	}
	if StackAuthAPIURL != "https://api.stack-auth.com" {
		t.Errorf("expected StackAuthAPIURL 'https://api.stack-auth.com', got '%s'", StackAuthAPIURL)
	}
}

func TestDevConstants(t *testing.T) {
	// Verify dev constants are set (unlike prod which are intentionally empty)
	if DevProjectID == "" {
		t.Error("expected DevProjectID to be set")
	}
	if DevPublishableKey == "" {
		t.Error("expected DevPublishableKey to be set")
	}
	if DevCmuxURL == "" {
		t.Error("expected DevCmuxURL to be set")
	}
	if DevConvexSiteURL == "" {
		t.Error("expected DevConvexSiteURL to be set")
	}
	if DevServerURL == "" {
		t.Error("expected DevServerURL to be set")
	}
}

func TestProdConstantsEmpty(t *testing.T) {
	// Verify prod constants are intentionally empty (must be injected at build time)
	if ProdProjectID != "" {
		t.Error("expected ProdProjectID to be empty (injected at build time)")
	}
	if ProdPublishableKey != "" {
		t.Error("expected ProdPublishableKey to be empty (injected at build time)")
	}
	if ProdCmuxURL != "" {
		t.Error("expected ProdCmuxURL to be empty (injected at build time)")
	}
	if ProdConvexSiteURL != "" {
		t.Error("expected ProdConvexSiteURL to be empty (injected at build time)")
	}
}

func TestConfigStruct(t *testing.T) {
	cfg := Config{
		ProjectID:      "proj-123",
		PublishableKey: "pk_test",
		CmuxURL:        "https://cmux.example.com",
		ConvexSiteURL:  "https://convex.example.com",
		ServerURL:      "https://server.example.com",
		StackAuthURL:   "https://api.stack-auth.com",
		IsDev:          true,
	}

	if cfg.ProjectID != "proj-123" {
		t.Errorf("expected ProjectID 'proj-123', got '%s'", cfg.ProjectID)
	}
	if cfg.IsDev != true {
		t.Error("expected IsDev true")
	}
}

func TestConfigValidateSuccess(t *testing.T) {
	cfg := Config{
		ProjectID:      "proj-123",
		PublishableKey: "pk_test",
		CmuxURL:        "https://cmux.example.com",
		ConvexSiteURL:  "https://convex.example.com",
	}

	if err := cfg.Validate(); err != nil {
		t.Errorf("expected validation to pass, got error: %v", err)
	}
}

func TestConfigValidateMissingProjectID(t *testing.T) {
	cfg := Config{
		PublishableKey: "pk_test",
		CmuxURL:        "https://cmux.example.com",
		ConvexSiteURL:  "https://convex.example.com",
	}

	err := cfg.Validate()
	if err == nil {
		t.Error("expected validation error for missing ProjectID")
	}
	if err != nil && !contains(err.Error(), "STACK_PROJECT_ID") {
		t.Errorf("expected error to mention STACK_PROJECT_ID, got: %v", err)
	}
}

func TestConfigValidateMissingPublishableKey(t *testing.T) {
	cfg := Config{
		ProjectID:     "proj-123",
		CmuxURL:       "https://cmux.example.com",
		ConvexSiteURL: "https://convex.example.com",
	}

	err := cfg.Validate()
	if err == nil {
		t.Error("expected validation error for missing PublishableKey")
	}
	if err != nil && !contains(err.Error(), "STACK_PUBLISHABLE_CLIENT_KEY") {
		t.Errorf("expected error to mention STACK_PUBLISHABLE_CLIENT_KEY, got: %v", err)
	}
}

func TestConfigValidateMissingCmuxURL(t *testing.T) {
	cfg := Config{
		ProjectID:      "proj-123",
		PublishableKey: "pk_test",
		ConvexSiteURL:  "https://convex.example.com",
	}

	err := cfg.Validate()
	if err == nil {
		t.Error("expected validation error for missing CmuxURL")
	}
	if err != nil && !contains(err.Error(), "CMUX_API_URL") {
		t.Errorf("expected error to mention CMUX_API_URL, got: %v", err)
	}
}

func TestConfigValidateMissingConvexSiteURL(t *testing.T) {
	cfg := Config{
		ProjectID:      "proj-123",
		PublishableKey: "pk_test",
		CmuxURL:        "https://cmux.example.com",
	}

	err := cfg.Validate()
	if err == nil {
		t.Error("expected validation error for missing ConvexSiteURL")
	}
	if err != nil && !contains(err.Error(), "CONVEX_SITE_URL") {
		t.Errorf("expected error to mention CONVEX_SITE_URL, got: %v", err)
	}
}

func TestConfigValidateServerURLOptional(t *testing.T) {
	// ServerURL is optional - should pass without it
	cfg := Config{
		ProjectID:      "proj-123",
		PublishableKey: "pk_test",
		CmuxURL:        "https://cmux.example.com",
		ConvexSiteURL:  "https://convex.example.com",
		// ServerURL intentionally empty
	}

	if err := cfg.Validate(); err != nil {
		t.Errorf("expected validation to pass without ServerURL, got error: %v", err)
	}
}

func TestConfigValidateMultipleMissing(t *testing.T) {
	cfg := Config{} // All empty

	err := cfg.Validate()
	if err == nil {
		t.Error("expected validation error for empty config")
	}
	// Should mention multiple missing fields
	errStr := err.Error()
	if !contains(errStr, "STACK_PROJECT_ID") {
		t.Error("expected error to mention STACK_PROJECT_ID")
	}
	if !contains(errStr, "STACK_PUBLISHABLE_CLIENT_KEY") {
		t.Error("expected error to mention STACK_PUBLISHABLE_CLIENT_KEY")
	}
}

// Helper function
func contains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
