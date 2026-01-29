// internal/morph/types_test.go
package morph

import (
	"encoding/json"
	"testing"
	"time"
)

func TestInstance_JSONMarshal(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	inst := Instance{
		ID:         "inst_123",
		SnapshotID: "snap_456",
		Status:     StatusRunning,
		BaseURL:    "https://test.morph.so",
		CDPURL:     "https://test.morph.so/cdp/",
		VNCURL:     "https://test.morph.so/vnc/",
		CodeURL:    "https://test.morph.so/code/",
		AppURL:     "https://test.morph.so/app/",
		CreatedAt:  now,
		TTLSeconds: 3600,
		Metadata:   map[string]string{"key": "value"},
	}

	data, err := json.Marshal(inst)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var unmarshaled Instance
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if unmarshaled.ID != inst.ID {
		t.Errorf("ID mismatch: expected %s, got %s", inst.ID, unmarshaled.ID)
	}
	if unmarshaled.Status != inst.Status {
		t.Errorf("Status mismatch: expected %s, got %s", inst.Status, unmarshaled.Status)
	}
	if unmarshaled.TTLSeconds != inst.TTLSeconds {
		t.Errorf("TTLSeconds mismatch: expected %d, got %d", inst.TTLSeconds, unmarshaled.TTLSeconds)
	}
	if unmarshaled.Metadata["key"] != "value" {
		t.Errorf("Metadata mismatch: expected 'value', got '%s'", unmarshaled.Metadata["key"])
	}
}

func TestInstance_JSONUnmarshal(t *testing.T) {
	jsonStr := `{
		"id": "inst_abc",
		"snapshot_id": "snap_xyz",
		"status": "running",
		"base_url": "https://example.com",
		"cdp_url": "https://example.com/cdp/",
		"vnc_url": "https://example.com/vnc/",
		"code_url": "https://example.com/code/",
		"app_url": "https://example.com/app/",
		"ttl_seconds": 7200,
		"metadata": {"env": "test"}
	}`

	var inst Instance
	if err := json.Unmarshal([]byte(jsonStr), &inst); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if inst.ID != "inst_abc" {
		t.Errorf("expected 'inst_abc', got '%s'", inst.ID)
	}
	if inst.Status != StatusRunning {
		t.Errorf("expected StatusRunning, got '%s'", inst.Status)
	}
	if inst.TTLSeconds != 7200 {
		t.Errorf("expected 7200, got %d", inst.TTLSeconds)
	}
	if inst.Metadata["env"] != "test" {
		t.Errorf("expected 'test', got '%s'", inst.Metadata["env"])
	}
}

func TestInstance_EmptyMetadata(t *testing.T) {
	inst := Instance{
		ID:     "inst_123",
		Status: StatusRunning,
	}

	data, err := json.Marshal(inst)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var unmarshaled Instance
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	// nil metadata is OK
	if unmarshaled.Metadata != nil && len(unmarshaled.Metadata) != 0 {
		t.Errorf("expected nil or empty metadata, got %v", unmarshaled.Metadata)
	}
}

func TestInstance_NilMetadata(t *testing.T) {
	jsonStr := `{"id": "inst_123", "status": "running"}`

	var inst Instance
	if err := json.Unmarshal([]byte(jsonStr), &inst); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if inst.Metadata != nil {
		t.Errorf("expected nil metadata, got %v", inst.Metadata)
	}
}

func TestSnapshot_JSONMarshal(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	snap := Snapshot{
		ID:        "snap_123",
		Digest:    "my-snapshot-v1",
		ImageID:   "img_abc",
		VCPUs:     4,
		Memory:    8192,
		DiskSize:  65536,
		CreatedAt: now,
		Metadata:  map[string]string{"version": "1.0"},
	}

	data, err := json.Marshal(snap)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var unmarshaled Snapshot
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if unmarshaled.ID != snap.ID {
		t.Errorf("ID mismatch: expected %s, got %s", snap.ID, unmarshaled.ID)
	}
	if unmarshaled.Digest != snap.Digest {
		t.Errorf("Digest mismatch: expected %s, got %s", snap.Digest, unmarshaled.Digest)
	}
	if unmarshaled.VCPUs != snap.VCPUs {
		t.Errorf("VCPUs mismatch: expected %d, got %d", snap.VCPUs, unmarshaled.VCPUs)
	}
	if unmarshaled.Memory != snap.Memory {
		t.Errorf("Memory mismatch: expected %d, got %d", snap.Memory, unmarshaled.Memory)
	}
}

func TestSnapshot_JSONUnmarshal(t *testing.T) {
	jsonStr := `{
		"id": "snap_abc",
		"digest": "dba-base-v2",
		"image_id": "img_xyz",
		"vcpus": 2,
		"memory": 4096,
		"disk_size": 32768
	}`

	var snap Snapshot
	if err := json.Unmarshal([]byte(jsonStr), &snap); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if snap.ID != "snap_abc" {
		t.Errorf("expected 'snap_abc', got '%s'", snap.ID)
	}
	if snap.Digest != "dba-base-v2" {
		t.Errorf("expected 'dba-base-v2', got '%s'", snap.Digest)
	}
}

func TestExecResult_JSONMarshal(t *testing.T) {
	result := ExecResult{
		Stdout:   "hello world\n",
		Stderr:   "some warning\n",
		ExitCode: 0,
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var unmarshaled ExecResult
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if unmarshaled.Stdout != result.Stdout {
		t.Errorf("Stdout mismatch")
	}
	if unmarshaled.Stderr != result.Stderr {
		t.Errorf("Stderr mismatch")
	}
	if unmarshaled.ExitCode != result.ExitCode {
		t.Errorf("ExitCode mismatch")
	}
}

func TestExecResult_NonZeroExitCode(t *testing.T) {
	result := ExecResult{
		Stdout:   "",
		Stderr:   "command not found\n",
		ExitCode: 127,
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var unmarshaled ExecResult
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if unmarshaled.ExitCode != 127 {
		t.Errorf("expected 127, got %d", unmarshaled.ExitCode)
	}
}

func TestExecResult_EmptyOutput(t *testing.T) {
	result := ExecResult{
		Stdout:   "",
		Stderr:   "",
		ExitCode: 0,
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var unmarshaled ExecResult
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if unmarshaled.Stdout != "" {
		t.Errorf("expected empty stdout")
	}
}

func TestManagerConfig_Defaults(t *testing.T) {
	config := ManagerConfig{}

	if config.APIKey != "" {
		t.Errorf("expected empty APIKey by default")
	}
	if config.DefaultTTL != 0 {
		t.Errorf("expected 0 DefaultTTL by default")
	}
}

func TestManagerConfig_Complete(t *testing.T) {
	config := ManagerConfig{
		APIKey:         "morph_key_123",
		BaseSnapshotID: "snap_base_v1",
		DefaultTTL:     3600,
		DefaultVCPUs:   4,
		DefaultMemory:  8192,
		DefaultDisk:    65536,
	}

	if config.APIKey != "morph_key_123" {
		t.Errorf("APIKey mismatch")
	}
	if config.BaseSnapshotID != "snap_base_v1" {
		t.Errorf("BaseSnapshotID mismatch")
	}
	if config.DefaultTTL != 3600 {
		t.Errorf("DefaultTTL mismatch")
	}
}

func TestInstanceStatus_AllValues(t *testing.T) {
	statuses := map[InstanceStatus]string{
		StatusPending:  "pending",
		StatusStarting: "starting",
		StatusRunning:  "running",
		StatusStopping: "stopping",
		StatusStopped:  "stopped",
		StatusError:    "error",
	}

	for status, expected := range statuses {
		if string(status) != expected {
			t.Errorf("status %v: expected '%s', got '%s'", status, expected, string(status))
		}
	}
}

func TestInstanceStatus_JSONMarshal(t *testing.T) {
	type wrapper struct {
		Status InstanceStatus `json:"status"`
	}

	w := wrapper{Status: StatusRunning}
	data, err := json.Marshal(w)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	expected := `{"status":"running"}`
	if string(data) != expected {
		t.Errorf("expected %s, got %s", expected, string(data))
	}
}

func TestInstanceStatus_JSONUnmarshal(t *testing.T) {
	type wrapper struct {
		Status InstanceStatus `json:"status"`
	}

	jsonStr := `{"status":"stopped"}`
	var w wrapper
	if err := json.Unmarshal([]byte(jsonStr), &w); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if w.Status != StatusStopped {
		t.Errorf("expected StatusStopped, got %s", w.Status)
	}
}

func TestInstanceStatus_UnknownValue(t *testing.T) {
	type wrapper struct {
		Status InstanceStatus `json:"status"`
	}

	jsonStr := `{"status":"unknown_status"}`
	var w wrapper
	if err := json.Unmarshal([]byte(jsonStr), &w); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	// Go allows unknown enum values
	if w.Status != InstanceStatus("unknown_status") {
		t.Errorf("expected 'unknown_status', got %s", w.Status)
	}
}

func TestInstance_ZeroValues(t *testing.T) {
	inst := Instance{}

	if inst.ID != "" {
		t.Error("expected empty ID")
	}
	if inst.Status != "" {
		t.Error("expected empty Status")
	}
	if inst.TTLSeconds != 0 {
		t.Error("expected 0 TTLSeconds")
	}
	if !inst.CreatedAt.IsZero() {
		t.Error("expected zero CreatedAt")
	}
}

func TestSnapshot_ZeroValues(t *testing.T) {
	snap := Snapshot{}

	if snap.ID != "" {
		t.Error("expected empty ID")
	}
	if snap.VCPUs != 0 {
		t.Error("expected 0 VCPUs")
	}
	if snap.Memory != 0 {
		t.Error("expected 0 Memory")
	}
}

func TestInstance_LargeMetadata(t *testing.T) {
	metadata := make(map[string]string)
	for i := 0; i < 100; i++ {
		key := string(rune('a' + i%26))
		metadata[key] = "value"
	}

	inst := Instance{
		ID:       "inst_123",
		Metadata: metadata,
	}

	data, err := json.Marshal(inst)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var unmarshaled Instance
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	// Check some metadata survived
	if len(unmarshaled.Metadata) == 0 {
		t.Error("expected non-empty metadata")
	}
}

func TestExecResult_LargeOutput(t *testing.T) {
	// Create 1MB of output
	largeOutput := make([]byte, 1024*1024)
	for i := range largeOutput {
		largeOutput[i] = 'x'
	}

	result := ExecResult{
		Stdout:   string(largeOutput),
		ExitCode: 0,
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var unmarshaled ExecResult
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if len(unmarshaled.Stdout) != 1024*1024 {
		t.Errorf("expected 1MB output, got %d bytes", len(unmarshaled.Stdout))
	}
}

func TestExecResult_SpecialCharacters(t *testing.T) {
	result := ExecResult{
		Stdout:   "Hello\nWorld\t\"quoted\"\nUnicode: 世界 🌍",
		Stderr:   "Warning: special chars\n",
		ExitCode: 0,
	}

	data, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}

	var unmarshaled ExecResult
	if err := json.Unmarshal(data, &unmarshaled); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if unmarshaled.Stdout != result.Stdout {
		t.Errorf("Stdout mismatch after roundtrip")
	}
}
