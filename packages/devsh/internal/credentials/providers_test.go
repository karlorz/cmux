package credentials

import (
	"os"
	"testing"
)

func TestIsProviderAvailable(t *testing.T) {
	status := AllProviderStatus{
		Providers: map[string]ProviderStatus{
			"anthropic": {Available: true, Source: "env:ANTHROPIC_API_KEY"},
			"openai":    {Available: true, Source: "env:OPENAI_API_KEY"},
			"google":    {Available: false, Source: ""},
		},
	}

	tests := []struct {
		provider string
		want     bool
	}{
		{"anthropic", true},
		{"openai", true},
		{"google", false},
		{"nonexistent", false},
	}

	for _, tt := range tests {
		t.Run(tt.provider, func(t *testing.T) {
			got := status.IsProviderAvailable(tt.provider)
			if got != tt.want {
				t.Errorf("IsProviderAvailable(%q) = %v, want %v", tt.provider, got, tt.want)
			}
		})
	}
}

func TestIsProviderAvailableWithVendorMapping(t *testing.T) {
	status := AllProviderStatus{
		Providers: map[string]ProviderStatus{
			"anthropic": {Available: true, Source: "test"},
			"openai":    {Available: true, Source: "test"},
			"google":    {Available: true, Source: "test"},
		},
	}

	tests := []struct {
		vendor string
		want   bool
	}{
		// Direct providers
		{"anthropic", true},
		{"openai", true},
		{"google", true},
		// Aliases should map to providers
		{"claude", true},    // maps to anthropic
		{"codex", true},     // maps to openai
		{"gpt", true},       // maps to openai
		{"gemini", true},    // maps to google
		// Unknown
		{"unknown", false},
	}

	for _, tt := range tests {
		t.Run(tt.vendor, func(t *testing.T) {
			got := status.IsProviderAvailable(tt.vendor)
			if got != tt.want {
				t.Errorf("IsProviderAvailable(%q) = %v, want %v", tt.vendor, got, tt.want)
			}
		})
	}
}

func TestGetProviderForVendor(t *testing.T) {
	tests := []struct {
		vendor string
		want   string
	}{
		{"anthropic", "anthropic"},
		{"claude", "anthropic"},
		{"openai", "openai"},
		{"codex", "openai"},
		{"gpt", "openai"},
		{"google", "google"},
		{"gemini", "google"},
		{"unknown", "unknown"}, // passthrough for unknown
	}

	for _, tt := range tests {
		t.Run(tt.vendor, func(t *testing.T) {
			got := GetProviderForVendor(tt.vendor)
			if got != tt.want {
				t.Errorf("GetProviderForVendor(%q) = %v, want %v", tt.vendor, got, tt.want)
			}
		})
	}
}

func TestCheckAnthropicCredentialsWithEnv(t *testing.T) {
	// Save and restore env
	original := os.Getenv("ANTHROPIC_API_KEY")
	defer os.Setenv("ANTHROPIC_API_KEY", original)

	// Test with env var set
	os.Setenv("ANTHROPIC_API_KEY", "test-key")
	status := CheckAnthropicCredentials()
	if !status.Available {
		t.Error("CheckAnthropicCredentials() should be available when ANTHROPIC_API_KEY is set")
	}
	if status.Source != "env:ANTHROPIC_API_KEY" {
		t.Errorf("CheckAnthropicCredentials() source = %q, want %q", status.Source, "env:ANTHROPIC_API_KEY")
	}

	// Test without env var
	os.Setenv("ANTHROPIC_API_KEY", "")
	status = CheckAnthropicCredentials()
	if status.Available {
		t.Error("CheckAnthropicCredentials() should not be available when ANTHROPIC_API_KEY is empty")
	}
}

func TestCheckOpenAICredentialsWithEnv(t *testing.T) {
	// Save and restore env
	original := os.Getenv("OPENAI_API_KEY")
	defer os.Setenv("OPENAI_API_KEY", original)

	// Test with env var set
	os.Setenv("OPENAI_API_KEY", "test-key")
	status := CheckOpenAICredentials()
	if !status.Available {
		t.Error("CheckOpenAICredentials() should be available when OPENAI_API_KEY is set")
	}
	if status.Source != "env:OPENAI_API_KEY" {
		t.Errorf("CheckOpenAICredentials() source = %q, want %q", status.Source, "env:OPENAI_API_KEY")
	}

	// Test without env var
	os.Setenv("OPENAI_API_KEY", "")
	status = CheckOpenAICredentials()
	if status.Available {
		t.Error("CheckOpenAICredentials() should not be available when OPENAI_API_KEY is empty")
	}
}

func TestCheckGoogleCredentialsWithEnv(t *testing.T) {
	// Save and restore env vars
	originalGemini := os.Getenv("GEMINI_API_KEY")
	originalGoogle := os.Getenv("GOOGLE_API_KEY")
	defer func() {
		os.Setenv("GEMINI_API_KEY", originalGemini)
		os.Setenv("GOOGLE_API_KEY", originalGoogle)
	}()

	// Clear both
	os.Setenv("GEMINI_API_KEY", "")
	os.Setenv("GOOGLE_API_KEY", "")

	// Test with GEMINI_API_KEY
	os.Setenv("GEMINI_API_KEY", "test-key")
	status := CheckGoogleCredentials()
	if !status.Available {
		t.Error("CheckGoogleCredentials() should be available when GEMINI_API_KEY is set")
	}
	if status.Source != "env:GEMINI_API_KEY" {
		t.Errorf("CheckGoogleCredentials() source = %q, want %q", status.Source, "env:GEMINI_API_KEY")
	}

	// Test with GOOGLE_API_KEY
	os.Setenv("GEMINI_API_KEY", "")
	os.Setenv("GOOGLE_API_KEY", "test-key")
	status = CheckGoogleCredentials()
	if !status.Available {
		t.Error("CheckGoogleCredentials() should be available when GOOGLE_API_KEY is set")
	}
	if status.Source != "env:GOOGLE_API_KEY" {
		t.Errorf("CheckGoogleCredentials() source = %q, want %q", status.Source, "env:GOOGLE_API_KEY")
	}

	// Test without any env var
	os.Setenv("GOOGLE_API_KEY", "")
	status = CheckGoogleCredentials()
	if status.Available {
		t.Error("CheckGoogleCredentials() should not be available when no API key is set")
	}
}

func TestVendorToProviderMap(t *testing.T) {
	// Ensure common mappings exist
	required := map[string]string{
		"anthropic": "anthropic",
		"claude":    "anthropic",
		"openai":    "openai",
		"codex":     "openai",
		"gpt":       "openai",
		"google":    "google",
		"gemini":    "google",
	}

	for vendor, expectedProvider := range required {
		if got, ok := VendorToProviderMap[vendor]; !ok {
			t.Errorf("VendorToProviderMap missing vendor %q", vendor)
		} else if got != expectedProvider {
			t.Errorf("VendorToProviderMap[%q] = %q, want %q", vendor, got, expectedProvider)
		}
	}
}

func TestProviderOrder(t *testing.T) {
	// Ensure common providers are in the order list
	required := []string{"anthropic", "openai", "google"}
	orderSet := make(map[string]bool)
	for _, p := range ProviderOrder {
		orderSet[p] = true
	}

	for _, p := range required {
		if !orderSet[p] {
			t.Errorf("ProviderOrder missing required provider %q", p)
		}
	}
}

func TestProviderStatusStruct(t *testing.T) {
	status := ProviderStatus{
		Available: true,
		Source:    "env:TEST_KEY",
	}

	if !status.Available {
		t.Error("expected Available true")
	}
	if status.Source != "env:TEST_KEY" {
		t.Errorf("expected Source 'env:TEST_KEY', got '%s'", status.Source)
	}
}

func TestProviderStatusDefaults(t *testing.T) {
	status := ProviderStatus{}

	if status.Available {
		t.Error("expected Available false by default")
	}
	if status.Source != "" {
		t.Errorf("expected empty Source, got '%s'", status.Source)
	}
}

func TestCheckXAICredentialsWithEnv(t *testing.T) {
	original := os.Getenv("XAI_API_KEY")
	defer os.Setenv("XAI_API_KEY", original)

	os.Setenv("XAI_API_KEY", "test-key")
	status := CheckXAICredentials()
	if !status.Available {
		t.Error("CheckXAICredentials() should be available when XAI_API_KEY is set")
	}
	if status.Source != "env:XAI_API_KEY" {
		t.Errorf("CheckXAICredentials() source = %q, want %q", status.Source, "env:XAI_API_KEY")
	}

	os.Setenv("XAI_API_KEY", "")
	status = CheckXAICredentials()
	if status.Available {
		t.Error("CheckXAICredentials() should not be available when XAI_API_KEY is empty")
	}
}

func TestCheckDeepSeekCredentialsWithEnv(t *testing.T) {
	original := os.Getenv("DEEPSEEK_API_KEY")
	defer os.Setenv("DEEPSEEK_API_KEY", original)

	os.Setenv("DEEPSEEK_API_KEY", "test-key")
	status := CheckDeepSeekCredentials()
	if !status.Available {
		t.Error("CheckDeepSeekCredentials() should be available when DEEPSEEK_API_KEY is set")
	}
	if status.Source != "env:DEEPSEEK_API_KEY" {
		t.Errorf("CheckDeepSeekCredentials() source = %q, want %q", status.Source, "env:DEEPSEEK_API_KEY")
	}

	os.Setenv("DEEPSEEK_API_KEY", "")
	status = CheckDeepSeekCredentials()
	if status.Available {
		t.Error("CheckDeepSeekCredentials() should not be available when DEEPSEEK_API_KEY is empty")
	}
}

func TestCheckGroqCredentialsWithEnv(t *testing.T) {
	original := os.Getenv("GROQ_API_KEY")
	defer os.Setenv("GROQ_API_KEY", original)

	os.Setenv("GROQ_API_KEY", "test-key")
	status := CheckGroqCredentials()
	if !status.Available {
		t.Error("CheckGroqCredentials() should be available when GROQ_API_KEY is set")
	}
	if status.Source != "env:GROQ_API_KEY" {
		t.Errorf("CheckGroqCredentials() source = %q, want %q", status.Source, "env:GROQ_API_KEY")
	}

	os.Setenv("GROQ_API_KEY", "")
	status = CheckGroqCredentials()
	if status.Available {
		t.Error("CheckGroqCredentials() should not be available when GROQ_API_KEY is empty")
	}
}

func TestCheckOpenRouterCredentialsWithEnv(t *testing.T) {
	original := os.Getenv("OPENROUTER_API_KEY")
	defer os.Setenv("OPENROUTER_API_KEY", original)

	os.Setenv("OPENROUTER_API_KEY", "test-key")
	status := CheckOpenRouterCredentials()
	if !status.Available {
		t.Error("CheckOpenRouterCredentials() should be available when OPENROUTER_API_KEY is set")
	}
	if status.Source != "env:OPENROUTER_API_KEY" {
		t.Errorf("CheckOpenRouterCredentials() source = %q, want %q", status.Source, "env:OPENROUTER_API_KEY")
	}

	os.Setenv("OPENROUTER_API_KEY", "")
	status = CheckOpenRouterCredentials()
	if status.Available {
		t.Error("CheckOpenRouterCredentials() should not be available when OPENROUTER_API_KEY is empty")
	}
}

func TestCheckQwenCredentialsWithEnv(t *testing.T) {
	origModel := os.Getenv("MODEL_STUDIO_API_KEY")
	origDash := os.Getenv("DASHSCOPE_API_KEY")
	defer func() {
		os.Setenv("MODEL_STUDIO_API_KEY", origModel)
		os.Setenv("DASHSCOPE_API_KEY", origDash)
	}()

	// Clear both
	os.Setenv("MODEL_STUDIO_API_KEY", "")
	os.Setenv("DASHSCOPE_API_KEY", "")

	// Test with MODEL_STUDIO_API_KEY
	os.Setenv("MODEL_STUDIO_API_KEY", "test-key")
	status := CheckQwenCredentials()
	if !status.Available {
		t.Error("CheckQwenCredentials() should be available when MODEL_STUDIO_API_KEY is set")
	}
	if status.Source != "env:MODEL_STUDIO_API_KEY" {
		t.Errorf("CheckQwenCredentials() source = %q, want %q", status.Source, "env:MODEL_STUDIO_API_KEY")
	}

	// Test with DASHSCOPE_API_KEY
	os.Setenv("MODEL_STUDIO_API_KEY", "")
	os.Setenv("DASHSCOPE_API_KEY", "test-key")
	status = CheckQwenCredentials()
	if !status.Available {
		t.Error("CheckQwenCredentials() should be available when DASHSCOPE_API_KEY is set")
	}
	if status.Source != "env:DASHSCOPE_API_KEY" {
		t.Errorf("CheckQwenCredentials() source = %q, want %q", status.Source, "env:DASHSCOPE_API_KEY")
	}

	// Test without any
	os.Setenv("DASHSCOPE_API_KEY", "")
	status = CheckQwenCredentials()
	if status.Available {
		t.Error("CheckQwenCredentials() should not be available when no key is set")
	}
}

func TestCheckAmpCredentialsWithEnv(t *testing.T) {
	original := os.Getenv("AMP_API_KEY")
	defer os.Setenv("AMP_API_KEY", original)

	os.Setenv("AMP_API_KEY", "test-key")
	status := CheckAmpCredentials()
	if !status.Available {
		t.Error("CheckAmpCredentials() should be available when AMP_API_KEY is set")
	}
	if status.Source != "env:AMP_API_KEY" {
		t.Errorf("CheckAmpCredentials() source = %q, want %q", status.Source, "env:AMP_API_KEY")
	}

	os.Setenv("AMP_API_KEY", "")
	status = CheckAmpCredentials()
	// Note: may still be available from file, so just check env path
}

func TestCheckCursorCredentialsWithEnv(t *testing.T) {
	original := os.Getenv("CURSOR_API_KEY")
	defer os.Setenv("CURSOR_API_KEY", original)

	os.Setenv("CURSOR_API_KEY", "test-key")
	status := CheckCursorCredentials()
	if !status.Available {
		t.Error("CheckCursorCredentials() should be available when CURSOR_API_KEY is set")
	}
	if status.Source != "env:CURSOR_API_KEY" {
		t.Errorf("CheckCursorCredentials() source = %q, want %q", status.Source, "env:CURSOR_API_KEY")
	}
}

func TestAllProviderStatusStruct(t *testing.T) {
	status := AllProviderStatus{
		Providers: map[string]ProviderStatus{
			"test": {Available: true, Source: "test"},
		},
		OpenCodeModels: []OpenCodeModel{
			{ID: "model1", Provider: "test"},
		},
	}

	if len(status.Providers) != 1 {
		t.Errorf("expected 1 provider, got %d", len(status.Providers))
	}
	if len(status.OpenCodeModels) != 1 {
		t.Errorf("expected 1 OpenCodeModel, got %d", len(status.OpenCodeModels))
	}
}

func TestVendorMappingsComplete(t *testing.T) {
	// Verify all expected aliases are mapped
	aliases := map[string]string{
		"gemini":    "google",
		"codex":     "openai",
		"claude":    "anthropic",
		"gpt":       "openai",
		"grok":      "xai",
		"alibaba":   "qwen",
		"dashscope": "qwen",
	}

	for alias, expected := range aliases {
		if got := VendorToProviderMap[alias]; got != expected {
			t.Errorf("VendorToProviderMap[%q] = %q, want %q", alias, got, expected)
		}
	}
}
