package cli

import (
	"testing"
)

func TestFilterModels(t *testing.T) {
	models := []ModelInfo{
		{Name: "claude/opus-4.6", DisplayName: "Opus 4.6", Vendor: "anthropic", Tier: "paid", Disabled: false},
		{Name: "gpt-4o", DisplayName: "GPT-4o", Vendor: "openai", Tier: "paid", Disabled: false},
		{Name: "gemini-pro", DisplayName: "Gemini Pro", Vendor: "google", Tier: "free", Disabled: true},
	}

	tests := []struct {
		name        string
		provider    string
		enabledOnly bool
		filter      string
		wantCount   int
	}{
		{"no filter", "", false, "", 3},
		{"filter by anthropic", "anthropic", false, "", 1},
		{"filter by openai", "openai", false, "", 1},
		{"enabled only", "", true, "", 2},
		{"text filter claude", "", false, "claude", 1},
		{"text filter opus", "", false, "opus", 1},
		{"combined anthropic enabled", "anthropic", true, "", 1},
		{"no match", "nonexistent", false, "", 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := filterModels(models, tt.provider, tt.enabledOnly, tt.filter)
			if len(result) != tt.wantCount {
				t.Errorf("filterModels() got %d models, want %d", len(result), tt.wantCount)
			}
		})
	}
}

func TestFilterModelsCaseInsensitive(t *testing.T) {
	models := []ModelInfo{
		{Name: "claude/opus-4.6", DisplayName: "Opus 4.6", Vendor: "Anthropic", Tier: "paid"},
	}

	result := filterModels(models, "ANTHROPIC", false, "")
	if len(result) != 1 {
		t.Errorf("provider filter should be case-insensitive (uppercase)")
	}

	result = filterModels(models, "anthropic", false, "")
	if len(result) != 1 {
		t.Errorf("provider filter should be case-insensitive (lowercase)")
	}
}

func TestFilterModelsTextFilterMatchesMultipleFields(t *testing.T) {
	models := []ModelInfo{
		{Name: "model-a", DisplayName: "claude-sonnet", Vendor: "test", Tier: "paid"},
		{Name: "claude-opus", DisplayName: "Model B", Vendor: "test", Tier: "paid"},
		{Name: "model-c", DisplayName: "Model C", Vendor: "anthropic", Tier: "paid"},
	}

	result := filterModels(models, "", false, "claude")
	if len(result) != 2 {
		t.Errorf("text filter should match name or displayName, got %d, want 2", len(result))
	}

	result = filterModels(models, "", false, "anthropic")
	if len(result) != 1 {
		t.Errorf("text filter should match vendor, got %d, want 1", len(result))
	}
}

func TestFilterModelsEmptySlice(t *testing.T) {
	result := filterModels([]ModelInfo{}, "", false, "")
	if len(result) != 0 {
		t.Errorf("filterModels() got %d models for empty input, want 0", len(result))
	}
}

func TestFilterModelsDisabledWithReason(t *testing.T) {
	reason := "API key expired"
	models := []ModelInfo{
		{Name: "model-a", DisplayName: "A", Vendor: "test", Tier: "paid", Disabled: true, DisabledReason: &reason},
		{Name: "model-b", DisplayName: "B", Vendor: "test", Tier: "paid", Disabled: false},
	}

	result := filterModels(models, "", true, "")
	if len(result) != 1 {
		t.Errorf("enabled-only should filter disabled models, got %d, want 1", len(result))
	}
	if result[0].Name != "model-b" {
		t.Errorf("enabled-only should return model-b, got %s", result[0].Name)
	}
}
