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
