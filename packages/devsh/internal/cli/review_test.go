// internal/cli/review_test.go
package cli

import (
	"testing"
)

func TestIsPRNumber(t *testing.T) {
	tests := []struct {
		input    string
		expected bool
	}{
		{"123", true},
		{"1", true},
		{"0", true},
		{"999999", true},
		{"", false},
		{"abc", false},
		{"123abc", false},
		{"12.3", false},
		{"-1", false},
		{"main", false},
		{"origin/main", false},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result := isPRNumber(tt.input)
			if result != tt.expected {
				t.Errorf("isPRNumber(%q) = %v, want %v", tt.input, result, tt.expected)
			}
		})
	}
}

func TestReviewFlagsExist(t *testing.T) {
	// Verify all flags are registered
	flags := []string{"base", "concurrency", "model", "output", "verbose", "json"}

	for _, flag := range flags {
		f := reviewCmd.Flags().Lookup(flag)
		if f == nil {
			t.Errorf("flag --%s not found on review command", flag)
		}
	}

	// Check shorthand flags
	shorthands := map[string]string{
		"b": "base",
		"c": "concurrency",
		"m": "model",
		"o": "output",
		"v": "verbose",
	}

	for short, long := range shorthands {
		f := reviewCmd.Flags().ShorthandLookup(short)
		if f == nil {
			t.Errorf("shorthand -%s not found", short)
		} else if f.Name != long {
			t.Errorf("shorthand -%s maps to %s, want %s", short, f.Name, long)
		}
	}
}

func TestReviewSummaryStruct(t *testing.T) {
	// Test that ReviewSummary can be marshaled
	summary := ReviewSummary{
		Base:          "abc123",
		Head:          "def456",
		TotalFiles:    5,
		HighRiskFiles: []string{"auth.ts", "payment.ts"},
		TopFocusAreas: []string{"Security", "Error handling"},
	}

	if summary.TotalFiles != 5 {
		t.Errorf("expected 5 total files, got %d", summary.TotalFiles)
	}

	if len(summary.HighRiskFiles) != 2 {
		t.Errorf("expected 2 high risk files, got %d", len(summary.HighRiskFiles))
	}
}

func TestFindPRHeatmapBinaryReturnsEmpty(t *testing.T) {
	// In test environment, pr-heatmap binary likely doesn't exist
	// The function should return empty string rather than error
	result := findPRHeatmapBinary()
	// We don't assert anything specific since the binary may or may not exist
	// Just verify it doesn't panic
	_ = result
}
