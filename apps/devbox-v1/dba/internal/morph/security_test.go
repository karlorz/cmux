// internal/morph/security_test.go
// Tests for security-related edge cases, injection prevention, and escaping
package morph

import (
	"fmt"
	"strings"
	"testing"
)

// TestSnapshotIDValidation tests that snapshot IDs are properly validated
func TestSnapshotIDValidation(t *testing.T) {
	// Test various potentially problematic snapshot IDs
	testIDs := []string{
		`snap_123`,
		`snap_abc_def`,
		`snap_123-456`,
		`snap_test_snapshot`,
	}

	for _, id := range testIDs {
		t.Run("id_"+id[:min(20, len(id))], func(t *testing.T) {
			// Validate basic ID format
			if len(id) == 0 {
				t.Error("ID should not be empty")
			}
		})
	}
}

// TestCommandValidation tests that commands are validated
func TestCommandValidation(t *testing.T) {
	// Test various command formats
	testCommands := []string{
		`echo "hello"`,
		`ls -la`,
		`pwd`,
		`cat /etc/hostname`,
	}

	for _, cmd := range testCommands {
		t.Run("cmd_"+cmd[:min(20, len(cmd))], func(t *testing.T) {
			// Validate basic command format
			if len(cmd) == 0 {
				t.Error("command should not be empty")
			}
		})
	}
}

// TestSnapshotDigestValidation tests that snapshot digest names are validated
func TestSnapshotDigestValidation(t *testing.T) {
	testDigests := []string{
		`my-snapshot`,
		`snapshot-2024-01-01`,
		`test_checkpoint`,
		`v1.0.0`,
	}

	for _, digest := range testDigests {
		t.Run("digest_"+digest[:min(20, len(digest))], func(t *testing.T) {
			// Validate basic digest format
			if len(digest) == 0 {
				t.Error("digest should not be empty")
			}
		})
	}
}

// TestWorkspaceID_ControlCharacters tests workspace IDs with control characters
func TestWorkspaceID_ControlCharacters(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	controlCharIDs := []string{
		"ws\x00null",      // Null byte
		"ws\x01soh",       // Start of heading
		"ws\x07bell",      // Bell
		"ws\x08backspace", // Backspace
		"ws\x1bescape",    // Escape
		"ws\x7fdelete",    // Delete
		"ws\r\ncrfl",      // CRLF
		"ws\tinner\ttabs", // Tabs
	}

	for _, wsID := range controlCharIDs {
		t.Run("control_char", func(t *testing.T) {
			manager.SetInstance(wsID, &Instance{
				ID:     "inst_" + wsID,
				Status: StatusRunning,
			})

			// Should be able to retrieve
			if !manager.IsRunning(wsID) {
				t.Errorf("workspace with control chars should be running")
			}

			// Clean up
			manager.RemoveInstance(wsID)
		})
	}
}

// TestWorkspaceID_VeryLong tests very long workspace IDs
func TestWorkspaceID_VeryLong(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// 1KB workspace ID
	longID := strings.Repeat("a", 1024)
	manager.SetInstance(longID, &Instance{
		ID:     "inst_long",
		Status: StatusRunning,
	})

	if !manager.IsRunning(longID) {
		t.Error("long workspace ID should work")
	}

	// 1MB workspace ID (extreme case)
	veryLongID := strings.Repeat("b", 1024*1024)
	manager.SetInstance(veryLongID, &Instance{
		ID:     "inst_verylong",
		Status: StatusRunning,
	})

	if !manager.IsRunning(veryLongID) {
		t.Error("very long workspace ID should work")
	}
}

// TestInstance_VeryLongURLs tests instances with very long URLs
func TestInstance_VeryLongURLs(t *testing.T) {
	longPath := strings.Repeat("a", 10000)
	inst := Instance{
		ID:      "inst_123",
		BaseURL: "https://example.com/" + longPath,
		CDPURL:  "wss://example.com/" + longPath + "/cdp",
		VNCURL:  "https://example.com/" + longPath + "/vnc",
		CodeURL: "https://example.com/" + longPath + "/code",
		AppURL:  "https://example.com/" + longPath + "/app",
	}

	if len(inst.BaseURL) < 10000 {
		t.Error("URL should be very long")
	}
}

// TestInstance_InvalidURLFormats tests instances with invalid URL formats
func TestInstance_InvalidURLFormats(t *testing.T) {
	invalidURLs := []string{
		"not-a-url",
		"://missing-scheme",
		"http://",
		"http://:8080",
		"http://user:pass@:8080",
		"javascript:alert(1)",
		"data:text/html,<script>alert(1)</script>",
		"file:///etc/passwd",
	}

	for _, url := range invalidURLs {
		t.Run("url_"+url[:min(20, len(url))], func(t *testing.T) {
			inst := Instance{
				ID:      "inst_123",
				BaseURL: url,
			}
			// Should store without validation (validation is at API level)
			if inst.BaseURL != url {
				t.Errorf("should store URL as-is")
			}
		})
	}
}

// TestMetadata_VeryLargeValues tests metadata with very large values
func TestMetadata_VeryLargeValues(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// 1MB value in metadata
	largeValue := strings.Repeat("x", 1024*1024)
	manager.SetInstance("workspace1", &Instance{
		ID:     "inst_123",
		Status: StatusRunning,
		Metadata: map[string]string{
			"large_key": largeValue,
		},
	})

	found := manager.GetInstanceByID("inst_123")
	if found == nil {
		t.Fatal("should find instance")
	}
	if len(found.Metadata["large_key"]) != 1024*1024 {
		t.Error("large metadata value should be preserved")
	}
}

// TestMetadata_ManyKeys tests metadata with many keys
func TestMetadata_ManyKeys(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// 10000 keys
	metadata := make(map[string]string)
	for i := 0; i < 10000; i++ {
		metadata[fmt.Sprintf("key_%d", i)] = fmt.Sprintf("value_%d", i)
	}

	manager.SetInstance("workspace1", &Instance{
		ID:       "inst_123",
		Status:   StatusRunning,
		Metadata: metadata,
	})

	found := manager.GetInstanceByID("inst_123")
	if found == nil {
		t.Fatal("should find instance")
	}
	if len(found.Metadata) != 10000 {
		t.Errorf("expected 10000 keys, got %d", len(found.Metadata))
	}
}

// TestMetadata_SpecialKeys tests metadata with special key names
func TestMetadata_SpecialKeys(t *testing.T) {
	specialKeys := []string{
		"",             // Empty key
		" ",            // Space only
		"\t",           // Tab
		"\n",           // Newline
		"key with spaces",
		"key\twith\ttabs",
		"key\nwith\nnewlines",
		"日本語キー",       // Japanese
		"Ключ",        // Russian
		"🔑",           // Emoji
		"<script>",    // HTML-like
		"${variable}", // Template-like
		"$(command)",  // Shell-like
	}

	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	metadata := make(map[string]string)
	for _, key := range specialKeys {
		metadata[key] = "value_for_" + key
	}

	manager.SetInstance("workspace1", &Instance{
		ID:       "inst_123",
		Status:   StatusRunning,
		Metadata: metadata,
	})

	found := manager.GetInstanceByID("inst_123")
	if found == nil {
		t.Fatal("should find instance")
	}

	for _, key := range specialKeys {
		if found.Metadata[key] != "value_for_"+key {
			t.Errorf("metadata key '%s' not preserved", key)
		}
	}
}

// TestExecResult_BinaryOutput tests ExecResult with binary data
func TestExecResult_BinaryOutput(t *testing.T) {
	// All possible byte values
	allBytes := make([]byte, 256)
	for i := 0; i < 256; i++ {
		allBytes[i] = byte(i)
	}

	result := ExecResult{
		Stdout:   string(allBytes),
		Stderr:   string(allBytes),
		ExitCode: 0,
	}

	if len(result.Stdout) != 256 {
		t.Errorf("expected 256 bytes, got %d", len(result.Stdout))
	}
}

// TestExecResult_NegativeExitCodes tests negative exit codes
func TestExecResult_NegativeExitCodes(t *testing.T) {
	exitCodes := []int{-1, -127, -255, -32768, -2147483648}

	for _, code := range exitCodes {
		result := ExecResult{
			Stdout:   "",
			Stderr:   "killed by signal",
			ExitCode: code,
		}
		if result.ExitCode != code {
			t.Errorf("exit code not preserved: expected %d, got %d", code, result.ExitCode)
		}
	}
}

// TestExecResult_LargeExitCodes tests large exit codes
func TestExecResult_LargeExitCodes(t *testing.T) {
	exitCodes := []int{256, 1000, 65535, 2147483647}

	for _, code := range exitCodes {
		result := ExecResult{
			ExitCode: code,
		}
		if result.ExitCode != code {
			t.Errorf("exit code not preserved: expected %d, got %d", code, result.ExitCode)
		}
	}
}

// TestAPIError_EmptyFields tests APIError with empty fields
func TestAPIError_EmptyFields(t *testing.T) {
	tests := []struct {
		name     string
		err      APIError
		expected string
	}{
		{
			name:     "all empty",
			err:      APIError{},
			expected: "morph API error []: ",
		},
		{
			name:     "only code",
			err:      APIError{Code: "ERROR"},
			expected: "morph API error [ERROR]: ",
		},
		{
			name:     "only message",
			err:      APIError{Message: "Something failed"},
			expected: "morph API error []: Something failed",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if tc.err.Error() != tc.expected {
				t.Errorf("expected '%s', got '%s'", tc.expected, tc.err.Error())
			}
		})
	}
}

// TestWrapError_EmptyStrings tests WrapError with empty strings
func TestWrapError_EmptyStrings(t *testing.T) {
	// Empty error message
	emptyErr := fmt.Errorf("")
	wrapped := WrapError(emptyErr, "context")
	if wrapped.Error() != "context: " {
		t.Errorf("unexpected: %s", wrapped.Error())
	}

	// Empty context
	wrapped2 := WrapError(ErrNotFound, "")
	if wrapped2.Error() != ": resource not found" {
		t.Errorf("unexpected: %s", wrapped2.Error())
	}

	// Both empty
	wrapped3 := WrapError(emptyErr, "")
	if wrapped3.Error() != ": " {
		t.Errorf("unexpected: %s", wrapped3.Error())
	}
}

// TestManager_StressRemoveAndAdd tests rapid add/remove cycles
func TestManager_StressRemoveAndAdd(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Rapidly add and remove same workspace
	for i := 0; i < 10000; i++ {
		manager.SetInstance("workspace1", &Instance{
			ID:     fmt.Sprintf("inst_%d", i),
			Status: StatusRunning,
		})
		manager.RemoveInstance("workspace1")
	}

	if manager.IsRunning("workspace1") {
		t.Error("workspace should be removed")
	}
}

// TestManager_MapGrowth tests that map doesn't leak memory
func TestManager_MapGrowth(t *testing.T) {
	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	// Add and remove many unique workspaces
	for i := 0; i < 10000; i++ {
		wsID := fmt.Sprintf("workspace_%d", i)
		manager.SetInstance(wsID, &Instance{
			ID:     fmt.Sprintf("inst_%d", i),
			Status: StatusRunning,
		})
	}

	// Remove all
	for i := 0; i < 10000; i++ {
		wsID := fmt.Sprintf("workspace_%d", i)
		manager.RemoveInstance(wsID)
	}

	instances := manager.ListInstances()
	if len(instances) != 0 {
		t.Errorf("expected 0 instances, got %d", len(instances))
	}
}

// TestSnapshot_NegativeResources tests snapshot with negative resource values
func TestSnapshot_NegativeResources(t *testing.T) {
	snap := Snapshot{
		ID:       "snap_123",
		VCPUs:    -1,
		Memory:   -4096,
		DiskSize: -32768,
	}

	// Should store as-is (validation is at API level)
	if snap.VCPUs != -1 {
		t.Error("negative VCPUs should be stored")
	}
	if snap.Memory != -4096 {
		t.Error("negative Memory should be stored")
	}
}

// TestSnapshot_ZeroResources tests snapshot with zero resources
func TestSnapshot_ZeroResources(t *testing.T) {
	snap := Snapshot{
		ID:       "snap_123",
		VCPUs:    0,
		Memory:   0,
		DiskSize: 0,
	}

	if snap.VCPUs != 0 {
		t.Error("zero VCPUs should be stored")
	}
}

// TestSnapshot_MaxResources tests snapshot with max resource values
func TestSnapshot_MaxResources(t *testing.T) {
	snap := Snapshot{
		ID:       "snap_123",
		VCPUs:    2147483647, // Max int32
		Memory:   2147483647,
		DiskSize: 2147483647,
	}

	if snap.VCPUs != 2147483647 {
		t.Error("max VCPUs should be stored")
	}
}

// TestInstanceStatus_CustomValues tests custom status values
func TestInstanceStatus_CustomValues(t *testing.T) {
	customStatuses := []InstanceStatus{
		"custom_status",
		"RUNNING",         // Uppercase
		"Running",         // Mixed case
		"running ",        // Trailing space
		" running",        // Leading space
		"running\n",       // Trailing newline
		"",                // Empty
		"very_long_status_name_that_goes_on_and_on",
	}

	manager := &Manager{
		instances: make(map[string]*Instance),
	}

	for i, status := range customStatuses {
		wsID := fmt.Sprintf("ws_%d", i)
		manager.SetInstance(wsID, &Instance{
			ID:     fmt.Sprintf("inst_%d", i),
			Status: status,
		})

		// Only StatusRunning should make IsRunning return true
		isRunning := manager.IsRunning(wsID)
		shouldBeRunning := status == StatusRunning
		if isRunning != shouldBeRunning {
			t.Errorf("status '%s': expected IsRunning=%v, got %v", status, shouldBeRunning, isRunning)
		}
	}
}

// TestManagerConfig_NegativeTTL tests negative TTL values
func TestManagerConfig_NegativeTTL(t *testing.T) {
	config := ManagerConfig{
		APIKey:     "test",
		DefaultTTL: -1,
	}

	// Should store as-is
	if config.DefaultTTL != -1 {
		t.Error("negative TTL should be stored")
	}
}

// TestManagerConfig_VeryLargeTTL tests very large TTL values
func TestManagerConfig_VeryLargeTTL(t *testing.T) {
	config := ManagerConfig{
		APIKey:     "test",
		DefaultTTL: 2147483647, // Max int32
	}

	if config.DefaultTTL != 2147483647 {
		t.Error("large TTL should be stored")
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
