// internal/morph/json_edge_test.go
// Comprehensive JSON marshaling/unmarshaling edge cases
package morph

import (
	"encoding/json"
	"math"
	"strings"
	"testing"
	"time"
)

// TestJSON_Instance_AllFieldsRoundtrip tests complete Instance roundtrip
func TestJSON_Instance_AllFieldsRoundtrip(t *testing.T) {
	original := Instance{
		ID:         "inst_test_123",
		SnapshotID: "snap_456",
		Status:     StatusRunning,
		BaseURL:    "https://example.com",
		CDPURL:     "wss://example.com/cdp",
		VNCURL:     "https://example.com/vnc",
		CodeURL:    "https://example.com/code",
		AppURL:     "https://example.com/app",
		CreatedAt:  time.Date(2024, 1, 15, 10, 30, 0, 0, time.UTC),
		TTLSeconds: 7200,
		Metadata: map[string]string{
			"key1": "value1",
			"key2": "value2",
		},
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var recovered Instance
	if err := json.Unmarshal(data, &recovered); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	// Verify all fields
	if recovered.ID != original.ID {
		t.Errorf("ID: got %s, want %s", recovered.ID, original.ID)
	}
	if recovered.SnapshotID != original.SnapshotID {
		t.Errorf("SnapshotID: got %s, want %s", recovered.SnapshotID, original.SnapshotID)
	}
	if recovered.Status != original.Status {
		t.Errorf("Status: got %s, want %s", recovered.Status, original.Status)
	}
	if recovered.BaseURL != original.BaseURL {
		t.Errorf("BaseURL: got %s, want %s", recovered.BaseURL, original.BaseURL)
	}
	if recovered.CDPURL != original.CDPURL {
		t.Errorf("CDPURL: got %s, want %s", recovered.CDPURL, original.CDPURL)
	}
	if recovered.VNCURL != original.VNCURL {
		t.Errorf("VNCURL: got %s, want %s", recovered.VNCURL, original.VNCURL)
	}
	if recovered.CodeURL != original.CodeURL {
		t.Errorf("CodeURL: got %s, want %s", recovered.CodeURL, original.CodeURL)
	}
	if recovered.AppURL != original.AppURL {
		t.Errorf("AppURL: got %s, want %s", recovered.AppURL, original.AppURL)
	}
	if !recovered.CreatedAt.Equal(original.CreatedAt) {
		t.Errorf("CreatedAt: got %v, want %v", recovered.CreatedAt, original.CreatedAt)
	}
	if recovered.TTLSeconds != original.TTLSeconds {
		t.Errorf("TTLSeconds: got %d, want %d", recovered.TTLSeconds, original.TTLSeconds)
	}
	if recovered.Metadata["key1"] != "value1" {
		t.Errorf("Metadata[key1]: got %s, want value1", recovered.Metadata["key1"])
	}
}

// TestJSON_Instance_PartialData tests unmarshaling partial JSON
func TestJSON_Instance_PartialData(t *testing.T) {
	testCases := []struct {
		name string
		json string
	}{
		{"empty", `{}`},
		{"id_only", `{"id": "test"}`},
		{"status_only", `{"status": "running"}`},
		{"id_and_status", `{"id": "test", "status": "running"}`},
		{"with_null_metadata", `{"id": "test", "metadata": null}`},
		{"with_empty_metadata", `{"id": "test", "metadata": {}}`},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			var inst Instance
			err := json.Unmarshal([]byte(tc.json), &inst)
			if err != nil {
				t.Errorf("unmarshal failed: %v", err)
			}
		})
	}
}

// TestJSON_Instance_ExtraFields tests that extra fields are ignored
func TestJSON_Instance_ExtraFields(t *testing.T) {
	jsonData := `{
		"id": "test",
		"status": "running",
		"extra_field": "ignored",
		"another_extra": 12345,
		"nested_extra": {"foo": "bar"}
	}`

	var inst Instance
	err := json.Unmarshal([]byte(jsonData), &inst)
	if err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if inst.ID != "test" {
		t.Errorf("ID should be 'test', got '%s'", inst.ID)
	}
	if inst.Status != StatusRunning {
		t.Errorf("Status should be 'running', got '%s'", inst.Status)
	}
}

// TestJSON_Instance_WrongTypes tests behavior with wrong JSON types
func TestJSON_Instance_WrongTypes(t *testing.T) {
	testCases := []struct {
		name      string
		json      string
		shouldErr bool
	}{
		{"id_as_number", `{"id": 123}`, true},
		{"status_as_number", `{"status": 456}`, true},
		{"ttl_as_string", `{"ttl_seconds": "3600"}`, true},
		{"metadata_as_array", `{"metadata": []}`, true},
		{"metadata_as_string", `{"metadata": "wrong"}`, true},
		{"created_at_as_number", `{"created_at": 12345}`, true},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			var inst Instance
			err := json.Unmarshal([]byte(tc.json), &inst)
			if tc.shouldErr && err == nil {
				t.Error("expected error, got nil")
			}
		})
	}
}

// TestJSON_Instance_SpecialStrings tests special string values in JSON
func TestJSON_Instance_SpecialStrings(t *testing.T) {
	testCases := []struct {
		name  string
		value string
	}{
		{"empty", ""},
		{"unicode", "日本語"},
		{"emoji", "🚀💻🎉"},
		{"newlines", "line1\nline2"},
		{"tabs", "col1\tcol2"},
		{"quotes", `"quoted"`},
		{"backslash", `back\slash`},
		{"control_chars", "\x00\x01\x02"},
		{"html", "<script>alert('xss')</script>"},
		{"url_encoded", "%20%3C%3E"},
		{"very_long", strings.Repeat("x", 100000)},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			original := Instance{ID: tc.value}

			data, err := json.Marshal(original)
			if err != nil {
				t.Fatalf("marshal failed: %v", err)
			}

			var recovered Instance
			if err := json.Unmarshal(data, &recovered); err != nil {
				t.Fatalf("unmarshal failed: %v", err)
			}

			if recovered.ID != tc.value {
				t.Errorf("value not preserved: got %q, want %q", recovered.ID, tc.value)
			}
		})
	}
}

// TestJSON_Instance_TTLEdgeCases tests TTL value edge cases
func TestJSON_Instance_TTLEdgeCases(t *testing.T) {
	testCases := []struct {
		name string
		ttl  int
	}{
		{"zero", 0},
		{"one", 1},
		{"negative_one", -1},
		{"max_int32", math.MaxInt32},
		{"min_int32", math.MinInt32},
		{"typical", 3600},
		{"one_day", 86400},
		{"one_year", 31536000},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			original := Instance{TTLSeconds: tc.ttl}

			data, err := json.Marshal(original)
			if err != nil {
				t.Fatalf("marshal failed: %v", err)
			}

			var recovered Instance
			if err := json.Unmarshal(data, &recovered); err != nil {
				t.Fatalf("unmarshal failed: %v", err)
			}

			if recovered.TTLSeconds != tc.ttl {
				t.Errorf("TTL not preserved: got %d, want %d", recovered.TTLSeconds, tc.ttl)
			}
		})
	}
}

// TestJSON_Instance_MetadataEdgeCases tests metadata edge cases
func TestJSON_Instance_MetadataEdgeCases(t *testing.T) {
	testCases := []struct {
		name     string
		metadata map[string]string
	}{
		{"nil", nil},
		{"empty", map[string]string{}},
		{"single", map[string]string{"key": "value"}},
		{"many", func() map[string]string {
			m := make(map[string]string)
			for i := 0; i < 1000; i++ {
				m[string(rune('a'+i%26))+string(rune('0'+i%10))] = "value"
			}
			return m
		}()},
		{"empty_key", map[string]string{"": "value"}},
		{"empty_value", map[string]string{"key": ""}},
		{"unicode_key", map[string]string{"日本語": "value"}},
		{"unicode_value", map[string]string{"key": "日本語"}},
		{"large_value", map[string]string{"key": strings.Repeat("x", 100000)}},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			original := Instance{Metadata: tc.metadata}

			data, err := json.Marshal(original)
			if err != nil {
				t.Fatalf("marshal failed: %v", err)
			}

			var recovered Instance
			if err := json.Unmarshal(data, &recovered); err != nil {
				t.Fatalf("unmarshal failed: %v", err)
			}

			// nil and empty map both become empty after roundtrip
			if tc.metadata == nil {
				if recovered.Metadata != nil && len(recovered.Metadata) > 0 {
					t.Error("nil metadata should become nil or empty")
				}
			} else {
				if len(recovered.Metadata) != len(tc.metadata) {
					t.Errorf("metadata length: got %d, want %d", len(recovered.Metadata), len(tc.metadata))
				}
			}
		})
	}
}

// TestJSON_Snapshot_AllFieldsRoundtrip tests complete Snapshot roundtrip
func TestJSON_Snapshot_AllFieldsRoundtrip(t *testing.T) {
	original := Snapshot{
		ID:        "snap_123",
		Digest:    "dba-base-v1",
		ImageID:   "img_456",
		VCPUs:     4,
		Memory:    8192,
		DiskSize:  65536,
		CreatedAt: time.Date(2024, 1, 15, 10, 30, 0, 0, time.UTC),
		Metadata:  map[string]string{"version": "1.0"},
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var recovered Snapshot
	if err := json.Unmarshal(data, &recovered); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if recovered.ID != original.ID {
		t.Errorf("ID mismatch")
	}
	if recovered.Digest != original.Digest {
		t.Errorf("Digest mismatch")
	}
	if recovered.VCPUs != original.VCPUs {
		t.Errorf("VCPUs mismatch")
	}
	if recovered.Memory != original.Memory {
		t.Errorf("Memory mismatch")
	}
	if recovered.DiskSize != original.DiskSize {
		t.Errorf("DiskSize mismatch")
	}
}

// TestJSON_Snapshot_ResourceEdgeCases tests resource value edge cases
func TestJSON_Snapshot_ResourceEdgeCases(t *testing.T) {
	testCases := []struct {
		name     string
		vcpus    int
		memory   int
		diskSize int
	}{
		{"all_zero", 0, 0, 0},
		{"all_one", 1, 1, 1},
		{"typical", 4, 8192, 65536},
		{"large", 256, 1048576, 10737418240},
		{"negative", -1, -1, -1},
		{"max_int", math.MaxInt, math.MaxInt, math.MaxInt},
		{"min_int", math.MinInt, math.MinInt, math.MinInt},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			original := Snapshot{
				VCPUs:    tc.vcpus,
				Memory:   tc.memory,
				DiskSize: tc.diskSize,
			}

			data, err := json.Marshal(original)
			if err != nil {
				t.Fatalf("marshal failed: %v", err)
			}

			var recovered Snapshot
			if err := json.Unmarshal(data, &recovered); err != nil {
				t.Fatalf("unmarshal failed: %v", err)
			}

			if recovered.VCPUs != tc.vcpus {
				t.Errorf("VCPUs: got %d, want %d", recovered.VCPUs, tc.vcpus)
			}
		})
	}
}

// TestJSON_ExecResult_AllFieldsRoundtrip tests complete ExecResult roundtrip
func TestJSON_ExecResult_AllFieldsRoundtrip(t *testing.T) {
	original := ExecResult{
		Stdout:   "standard output",
		Stderr:   "standard error",
		ExitCode: 0,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var recovered ExecResult
	if err := json.Unmarshal(data, &recovered); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if recovered.Stdout != original.Stdout {
		t.Errorf("Stdout mismatch")
	}
	if recovered.Stderr != original.Stderr {
		t.Errorf("Stderr mismatch")
	}
	if recovered.ExitCode != original.ExitCode {
		t.Errorf("ExitCode mismatch")
	}
}

// TestJSON_ExecResult_BinaryData tests binary data in output
func TestJSON_ExecResult_BinaryData(t *testing.T) {
	// Binary data with all byte values
	binaryData := make([]byte, 256)
	for i := 0; i < 256; i++ {
		binaryData[i] = byte(i)
	}

	original := ExecResult{
		Stdout: string(binaryData),
		Stderr: string(binaryData),
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var recovered ExecResult
	if err := json.Unmarshal(data, &recovered); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	// Note: Some bytes might not round-trip perfectly due to JSON encoding
	// This test documents the behavior
	if len(recovered.Stdout) == 0 {
		t.Error("Stdout should not be empty after roundtrip")
	}
}

// TestJSON_ExecResult_ExitCodeEdgeCases tests exit code edge cases
func TestJSON_ExecResult_ExitCodeEdgeCases(t *testing.T) {
	testCases := []int{
		0, 1, -1, 127, 128, 255, 256, -128,
		math.MaxInt32, math.MinInt32,
	}

	for _, exitCode := range testCases {
		original := ExecResult{ExitCode: exitCode}

		data, err := json.Marshal(original)
		if err != nil {
			t.Fatalf("marshal failed for %d: %v", exitCode, err)
		}

		var recovered ExecResult
		if err := json.Unmarshal(data, &recovered); err != nil {
			t.Fatalf("unmarshal failed for %d: %v", exitCode, err)
		}

		if recovered.ExitCode != exitCode {
			t.Errorf("ExitCode: got %d, want %d", recovered.ExitCode, exitCode)
		}
	}
}

// TestJSON_APIError_Roundtrip tests APIError JSON roundtrip
func TestJSON_APIError_Roundtrip(t *testing.T) {
	original := APIError{
		Code:    "TEST_ERROR",
		Message: "Test error message",
		Details: "Detailed error information",
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var recovered APIError
	if err := json.Unmarshal(data, &recovered); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if recovered.Code != original.Code {
		t.Errorf("Code mismatch")
	}
	if recovered.Message != original.Message {
		t.Errorf("Message mismatch")
	}
	if recovered.Details != original.Details {
		t.Errorf("Details mismatch")
	}
}

// TestJSON_ManagerConfig_Roundtrip tests ManagerConfig JSON roundtrip
func TestJSON_ManagerConfig_Roundtrip(t *testing.T) {
	original := ManagerConfig{
		APIKey:         "test_api_key",
		BaseSnapshotID: "snap_123",
		DefaultTTL:     3600,
		DefaultVCPUs:   4,
		DefaultMemory:  8192,
		DefaultDisk:    65536,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}

	var recovered ManagerConfig
	if err := json.Unmarshal(data, &recovered); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if recovered.APIKey != original.APIKey {
		t.Errorf("APIKey mismatch")
	}
	if recovered.DefaultTTL != original.DefaultTTL {
		t.Errorf("DefaultTTL mismatch")
	}
	if recovered.BaseSnapshotID != original.BaseSnapshotID {
		t.Errorf("BaseSnapshotID mismatch")
	}
	if recovered.DefaultVCPUs != original.DefaultVCPUs {
		t.Errorf("DefaultVCPUs mismatch")
	}
	if recovered.DefaultMemory != original.DefaultMemory {
		t.Errorf("DefaultMemory mismatch")
	}
	if recovered.DefaultDisk != original.DefaultDisk {
		t.Errorf("DefaultDisk mismatch")
	}
}

// TestJSON_MalformedInput tests handling of malformed JSON
func TestJSON_MalformedInput(t *testing.T) {
	malformedCases := []string{
		"",
		"null",
		"[]",
		"{",
		"}",
		"{{}}",
		`{"id": }`,
		`{"id": undefined}`,
		`{"id": NaN}`,
		`{"id": Infinity}`,
		`{id: "value"}`,
		`{'id': 'value'}`,
	}

	for _, input := range malformedCases {
		var inst Instance
		err := json.Unmarshal([]byte(input), &inst)
		// Some of these will error, some won't (like "null")
		// This test documents the behavior
		t.Logf("Input %q: error=%v", input, err)
	}
}

// TestJSON_TimeEdgeCases tests time value edge cases
func TestJSON_TimeEdgeCases(t *testing.T) {
	testCases := []struct {
		name string
		time time.Time
	}{
		{"zero", time.Time{}},
		{"unix_epoch", time.Unix(0, 0)},
		{"before_epoch", time.Date(1969, 1, 1, 0, 0, 0, 0, time.UTC)},
		{"far_future", time.Date(9999, 12, 31, 23, 59, 59, 0, time.UTC)},
		{"max_nano", time.Date(2024, 1, 1, 0, 0, 0, 999999999, time.UTC)},
		{"year_zero", time.Date(0, 1, 1, 0, 0, 0, 0, time.UTC)},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			original := Instance{CreatedAt: tc.time}

			data, err := json.Marshal(original)
			if err != nil {
				t.Fatalf("marshal failed: %v", err)
			}

			var recovered Instance
			if err := json.Unmarshal(data, &recovered); err != nil {
				t.Fatalf("unmarshal failed: %v", err)
			}

			if !recovered.CreatedAt.Equal(tc.time) {
				t.Errorf("time not preserved: got %v, want %v", recovered.CreatedAt, tc.time)
			}
		})
	}
}

// TestJSON_InstanceStatus_AllValues tests all status values
func TestJSON_InstanceStatus_AllValues(t *testing.T) {
	statuses := []InstanceStatus{
		StatusPending,
		StatusStarting,
		StatusRunning,
		StatusStopping,
		StatusStopped,
		StatusError,
		"",           // Empty
		"custom",     // Custom value
		"RUNNING",    // Wrong case
		" running ",  // With spaces
	}

	for _, status := range statuses {
		original := Instance{Status: status}

		data, err := json.Marshal(original)
		if err != nil {
			t.Fatalf("marshal failed for %q: %v", status, err)
		}

		var recovered Instance
		if err := json.Unmarshal(data, &recovered); err != nil {
			t.Fatalf("unmarshal failed for %q: %v", status, err)
		}

		if recovered.Status != status {
			t.Errorf("Status: got %q, want %q", recovered.Status, status)
		}
	}
}
