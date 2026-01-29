// internal/morph/errors_test.go
package morph

import (
	"errors"
	"fmt"
	"testing"
)

func TestSentinelErrors(t *testing.T) {
	tests := []struct {
		name string
		err  error
		msg  string
	}{
		{"ErrNotFound", ErrNotFound, "resource not found"},
		{"ErrAlreadyExists", ErrAlreadyExists, "resource already exists"},
		{"ErrAlreadyRunning", ErrAlreadyRunning, "instance is already running"},
		{"ErrNotRunning", ErrNotRunning, "instance is not running"},
		{"ErrTimeout", ErrTimeout, "operation timed out"},
		{"ErrAPIKeyMissing", ErrAPIKeyMissing, "MORPH_API_KEY environment variable not set"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if tc.err.Error() != tc.msg {
				t.Errorf("expected '%s', got '%s'", tc.msg, tc.err.Error())
			}
		})
	}
}

func TestSentinelErrors_IsComparison(t *testing.T) {
	// Test that errors.Is works correctly
	wrapped := fmt.Errorf("context: %w", ErrNotFound)

	if !errors.Is(wrapped, ErrNotFound) {
		t.Error("errors.Is should find ErrNotFound in wrapped error")
	}

	if errors.Is(wrapped, ErrTimeout) {
		t.Error("errors.Is should not find ErrTimeout in wrapped ErrNotFound")
	}
}

func TestAPIError_Error(t *testing.T) {
	tests := []struct {
		name     string
		apiErr   APIError
		expected string
	}{
		{
			name: "basic error",
			apiErr: APIError{
				Code:    "RATE_LIMITED",
				Message: "Too many requests",
				Details: "Please wait",
			},
			expected: "morph API error [RATE_LIMITED]: Too many requests",
		},
		{
			name: "empty code",
			apiErr: APIError{
				Code:    "",
				Message: "Something went wrong",
			},
			expected: "morph API error []: Something went wrong",
		},
		{
			name: "empty message",
			apiErr: APIError{
				Code:    "UNKNOWN",
				Message: "",
			},
			expected: "morph API error [UNKNOWN]: ",
		},
		{
			name: "special characters",
			apiErr: APIError{
				Code:    "AUTH_FAILED",
				Message: "Invalid key: \"test\" with 'quotes'",
			},
			expected: "morph API error [AUTH_FAILED]: Invalid key: \"test\" with 'quotes'",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := tc.apiErr.Error()
			if result != tc.expected {
				t.Errorf("expected '%s', got '%s'", tc.expected, result)
			}
		})
	}
}

func TestAPIError_Interface(t *testing.T) {
	var err error = &APIError{
		Code:    "TEST",
		Message: "test error",
	}

	if err.Error() != "morph API error [TEST]: test error" {
		t.Errorf("APIError does not implement error interface correctly")
	}
}

func TestAPIError_As(t *testing.T) {
	apiErr := &APIError{
		Code:    "RESOURCE_NOT_FOUND",
		Message: "Instance not found",
		Details: "Instance ID: inst_123",
	}

	wrapped := fmt.Errorf("failed to get instance: %w", apiErr)

	var target *APIError
	if !errors.As(wrapped, &target) {
		t.Error("errors.As should find APIError in wrapped error")
	}

	if target.Code != "RESOURCE_NOT_FOUND" {
		t.Errorf("expected code 'RESOURCE_NOT_FOUND', got '%s'", target.Code)
	}
	if target.Details != "Instance ID: inst_123" {
		t.Errorf("expected details 'Instance ID: inst_123', got '%s'", target.Details)
	}
}

func TestWrapError_Nil(t *testing.T) {
	result := WrapError(nil, "some context")
	if result != nil {
		t.Errorf("expected nil, got %v", result)
	}
}

func TestWrapError_Simple(t *testing.T) {
	original := errors.New("original error")
	wrapped := WrapError(original, "context")

	expected := "context: original error"
	if wrapped.Error() != expected {
		t.Errorf("expected '%s', got '%s'", expected, wrapped.Error())
	}
}

func TestWrapError_SentinelError(t *testing.T) {
	wrapped := WrapError(ErrNotFound, "getting workspace")

	if !errors.Is(wrapped, ErrNotFound) {
		t.Error("wrapped error should contain ErrNotFound")
	}

	expected := "getting workspace: resource not found"
	if wrapped.Error() != expected {
		t.Errorf("expected '%s', got '%s'", expected, wrapped.Error())
	}
}

func TestWrapError_DoubleWrap(t *testing.T) {
	original := ErrTimeout
	wrapped1 := WrapError(original, "inner context")
	wrapped2 := WrapError(wrapped1, "outer context")

	if !errors.Is(wrapped2, ErrTimeout) {
		t.Error("double wrapped error should contain ErrTimeout")
	}

	expected := "outer context: inner context: operation timed out"
	if wrapped2.Error() != expected {
		t.Errorf("expected '%s', got '%s'", expected, wrapped2.Error())
	}
}

func TestWrapError_APIError(t *testing.T) {
	apiErr := &APIError{
		Code:    "TEST",
		Message: "test message",
	}

	wrapped := WrapError(apiErr, "calling API")

	var target *APIError
	if !errors.As(wrapped, &target) {
		t.Error("wrapped APIError should be extractable with errors.As")
	}
}

func TestWrapError_EmptyContext(t *testing.T) {
	original := errors.New("original")
	wrapped := WrapError(original, "")

	expected := ": original"
	if wrapped.Error() != expected {
		t.Errorf("expected '%s', got '%s'", expected, wrapped.Error())
	}
}

func TestWrapError_LongContext(t *testing.T) {
	original := errors.New("error")
	longContext := "this is a very long context message that describes what we were trying to do when the error occurred"
	wrapped := WrapError(original, longContext)

	expected := longContext + ": error"
	if wrapped.Error() != expected {
		t.Errorf("expected '%s', got '%s'", expected, wrapped.Error())
	}
}

func TestWrapError_SpecialCharacters(t *testing.T) {
	original := errors.New("error with \"quotes\" and 'apostrophes'")
	wrapped := WrapError(original, "context with\nnewlines\tand\ttabs")

	// Just verify it doesn't panic and produces some output
	if len(wrapped.Error()) == 0 {
		t.Error("expected non-empty error message")
	}
}

func TestErrorsAreDistinct(t *testing.T) {
	allErrors := []error{
		ErrNotFound,
		ErrAlreadyExists,
		ErrAlreadyRunning,
		ErrNotRunning,
		ErrTimeout,
		ErrAPIKeyMissing,
	}

	for i, err1 := range allErrors {
		for j, err2 := range allErrors {
			if i != j {
				if errors.Is(err1, err2) {
					t.Errorf("errors should be distinct: %v and %v", err1, err2)
				}
			}
		}
	}
}

func TestAPIError_ZeroValue(t *testing.T) {
	var apiErr APIError

	expected := "morph API error []: "
	if apiErr.Error() != expected {
		t.Errorf("expected '%s', got '%s'", expected, apiErr.Error())
	}
}

func TestAPIError_PointerVsValue(t *testing.T) {
	apiErr := APIError{
		Code:    "TEST",
		Message: "message",
	}

	// Value receiver
	msg := apiErr.Error()
	if msg != "morph API error [TEST]: message" {
		t.Errorf("unexpected message: %s", msg)
	}

	// Pointer
	pErr := &apiErr
	msg = pErr.Error()
	if msg != "morph API error [TEST]: message" {
		t.Errorf("unexpected message from pointer: %s", msg)
	}
}

func TestWrapError_ChainedUnwrap(t *testing.T) {
	level1 := ErrNotFound
	level2 := WrapError(level1, "level 2")
	level3 := WrapError(level2, "level 3")
	level4 := WrapError(level3, "level 4")

	// All levels should find the original error
	if !errors.Is(level4, ErrNotFound) {
		t.Error("level4 should contain ErrNotFound")
	}
	if !errors.Is(level3, ErrNotFound) {
		t.Error("level3 should contain ErrNotFound")
	}
	if !errors.Is(level2, ErrNotFound) {
		t.Error("level2 should contain ErrNotFound")
	}

	// Check the full chain
	expected := "level 4: level 3: level 2: resource not found"
	if level4.Error() != expected {
		t.Errorf("expected '%s', got '%s'", expected, level4.Error())
	}
}

func BenchmarkWrapError(b *testing.B) {
	original := ErrNotFound
	for i := 0; i < b.N; i++ {
		_ = WrapError(original, "context")
	}
}

func BenchmarkAPIError_Error(b *testing.B) {
	apiErr := &APIError{
		Code:    "TEST_CODE",
		Message: "Test message for benchmarking",
		Details: "Some details",
	}
	for i := 0; i < b.N; i++ {
		_ = apiErr.Error()
	}
}
