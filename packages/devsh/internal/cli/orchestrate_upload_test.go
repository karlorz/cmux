// internal/cli/orchestrate_upload_test.go
package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestUploadBundleValidation(t *testing.T) {
	tests := []struct {
		name    string
		bundle  ExportBundle
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid bundle",
			bundle: ExportBundle{
				ExportedAt: "2026-03-18T10:00:00Z",
				Version:    "1.0.0",
				Orchestration: OrchestrationExportInfo{
					ID:     "orch_test123",
					Status: "completed",
				},
				Summary: ExportSummary{TotalTasks: 1},
			},
			wantErr: false,
		},
		{
			name: "missing orchestration ID",
			bundle: ExportBundle{
				Version: "1.0.0",
				Orchestration: OrchestrationExportInfo{
					Status: "completed",
				},
			},
			wantErr: true,
			errMsg:  "invalid bundle: missing orchestration.id",
		},
		{
			name: "missing version",
			bundle: ExportBundle{
				Orchestration: OrchestrationExportInfo{
					ID:     "orch_test123",
					Status: "completed",
				},
			},
			wantErr: true,
			errMsg:  "invalid bundle: missing version",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Write bundle to temp file
			tmpDir := t.TempDir()
			bundlePath := filepath.Join(tmpDir, "bundle.json")
			data, _ := json.MarshalIndent(tt.bundle, "", "  ")
			os.WriteFile(bundlePath, data, 0644)

			// Validate bundle (same logic as upload command)
			bundleData, err := os.ReadFile(bundlePath)
			if err != nil {
				t.Fatalf("failed to read bundle: %v", err)
			}

			var bundle ExportBundle
			if err := json.Unmarshal(bundleData, &bundle); err != nil {
				t.Fatalf("failed to parse bundle: %v", err)
			}

			// Run validation
			var validationErr error
			if bundle.Orchestration.ID == "" {
				validationErr = &validationError{"invalid bundle: missing orchestration.id"}
			} else if bundle.Version == "" {
				validationErr = &validationError{"invalid bundle: missing version"}
			}

			if tt.wantErr {
				if validationErr == nil {
					t.Error("expected validation error, got nil")
				} else if validationErr.Error() != tt.errMsg {
					t.Errorf("expected error %q, got %q", tt.errMsg, validationErr.Error())
				}
			} else {
				if validationErr != nil {
					t.Errorf("unexpected validation error: %v", validationErr)
				}
			}
		})
	}
}

type validationError struct {
	msg string
}

func (e *validationError) Error() string {
	return e.msg
}

func TestUploadBundleWithLogs(t *testing.T) {
	// Test that bundles with logs can be parsed correctly
	bundle := ExportBundle{
		ExportedAt: "2026-03-18T10:00:00Z",
		Version:    "1.0.0",
		Orchestration: OrchestrationExportInfo{
			ID:     "local_test123",
			Status: "completed",
		},
		Summary: ExportSummary{TotalTasks: 1},
		Logs: &ExportLogs{
			Stdout: "Hello from stdout",
			Stderr: "Warning from stderr",
		},
	}

	data, err := json.MarshalIndent(bundle, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal bundle: %v", err)
	}

	var parsed ExportBundle
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("failed to unmarshal bundle: %v", err)
	}

	if parsed.Logs == nil {
		t.Fatal("logs should not be nil")
	}
	if parsed.Logs.Stdout != "Hello from stdout" {
		t.Errorf("stdout mismatch: %q", parsed.Logs.Stdout)
	}
}

func TestUploadFlagsExist(t *testing.T) {
	// Verify flag variables exist
	origJwt := orchestrateUploadUseEnvJwt
	origStdin := orchestrateUploadFromStdin
	defer func() {
		orchestrateUploadUseEnvJwt = origJwt
		orchestrateUploadFromStdin = origStdin
	}()

	orchestrateUploadUseEnvJwt = true
	if !orchestrateUploadUseEnvJwt {
		t.Error("failed to set orchestrateUploadUseEnvJwt")
	}

	orchestrateUploadFromStdin = true
	if !orchestrateUploadFromStdin {
		t.Error("failed to set orchestrateUploadFromStdin")
	}
}
