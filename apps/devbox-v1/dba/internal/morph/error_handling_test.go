// internal/morph/error_handling_test.go
// Comprehensive error handling edge cases
package morph

import (
	"errors"
	"fmt"
	"strings"
	"testing"
)

// TestError_SentinelErrors tests all sentinel error values
func TestError_SentinelErrors(t *testing.T) {
	sentinelErrors := []struct {
		name string
		err  error
	}{
		{"ErrNotFound", ErrNotFound},
		{"ErrAlreadyExists", ErrAlreadyExists},
		{"ErrAlreadyRunning", ErrAlreadyRunning},
		{"ErrNotRunning", ErrNotRunning},
		{"ErrTimeout", ErrTimeout},
		{"ErrAPIKeyMissing", ErrAPIKeyMissing},
	}

	for _, tc := range sentinelErrors {
		t.Run(tc.name, func(t *testing.T) {
			// Should have non-empty message
			if tc.err.Error() == "" {
				t.Error("error message should not be empty")
			}

			// Should be usable with errors.Is
			wrapped := fmt.Errorf("wrapped: %w", tc.err)
			if !errors.Is(wrapped, tc.err) {
				t.Error("errors.Is should work")
			}

			// Double wrap should still work
			doubleWrapped := fmt.Errorf("double: %w", wrapped)
			if !errors.Is(doubleWrapped, tc.err) {
				t.Error("double wrapped errors.Is should work")
			}
		})
	}
}

// TestError_APIError_AllScenarios tests APIError comprehensively
func TestError_APIError_AllScenarios(t *testing.T) {
	testCases := []struct {
		name    string
		code    string
		message string
		details string
	}{
		{"all_empty", "", "", ""},
		{"code_only", "ERR_001", "", ""},
		{"message_only", "", "Error occurred", ""},
		{"details_only", "", "", "Detailed info"},
		{"code_and_message", "ERR_001", "Error occurred", ""},
		{"all_fields", "ERR_001", "Error occurred", "Detailed info"},
		{"long_code", strings.Repeat("X", 1000), "", ""},
		{"long_message", "", strings.Repeat("Y", 10000), ""},
		{"long_details", "", "", strings.Repeat("Z", 100000)},
		{"unicode_code", "错误_001", "", ""},
		{"unicode_message", "", "エラーが発生しました", ""},
		{"unicode_details", "", "", "تفاصيل الخطأ"},
		{"emoji", "🔥", "💥 Error", "🚨 Details"},
		{"newlines", "ERR\n001", "Line1\nLine2", "Detail\n\nMore"},
		{"special_chars", "ERR<>001", "Error & Message", "Details \"quoted\""},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := &APIError{
				Code:    tc.code,
				Message: tc.message,
				Details: tc.details,
			}

			// Should implement error interface
			var _ error = err

			// Error() should return something
			errStr := err.Error()
			t.Logf("Error string: %s", errStr)

			// Should contain code if present
			if tc.code != "" && !strings.Contains(errStr, tc.code) {
				t.Error("error string should contain code")
			}

			// Should contain message if present
			if tc.message != "" && !strings.Contains(errStr, tc.message) {
				t.Error("error string should contain message")
			}

			// Should be usable with errors.As
			wrapped := fmt.Errorf("context: %w", err)
			var target *APIError
			if !errors.As(wrapped, &target) {
				t.Error("errors.As should work")
			}

			if target.Code != tc.code {
				t.Error("code should be preserved")
			}
		})
	}
}

// TestError_APIError_Comparison tests APIError comparison
func TestError_APIError_Comparison(t *testing.T) {
	err1 := &APIError{Code: "ERR_001", Message: "Error 1"}
	err2 := &APIError{Code: "ERR_001", Message: "Error 1"}
	err3 := &APIError{Code: "ERR_002", Message: "Error 2"}

	// Different pointers are not equal
	if err1 == err2 {
		t.Error("different pointers should not be equal")
	}

	// Same pointer is equal
	if err1 != err1 {
		t.Error("same pointer should be equal")
	}

	// Content comparison (manual)
	if err1.Code != err2.Code || err1.Message != err2.Message {
		t.Error("content should be equal")
	}

	if err1.Code == err3.Code {
		t.Error("different codes should not match")
	}
}

// TestError_WrapError_EdgeCases tests WrapError edge cases
func TestError_WrapError_EdgeCases(t *testing.T) {
	testCases := []struct {
		name    string
		err     error
		context string
	}{
		{"nil_error", nil, "context"},
		{"empty_context", ErrNotFound, ""},
		{"whitespace_context", ErrNotFound, "   "},
		{"long_context", ErrNotFound, strings.Repeat("x", 10000)},
		{"unicode_context", ErrNotFound, "上下文"},
		{"newline_context", ErrNotFound, "line1\nline2"},
		{"special_context", ErrNotFound, "context: with %s format"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			wrapped := WrapError(tc.err, tc.context)

			if tc.err == nil {
				if wrapped != nil {
					t.Error("wrapping nil should return nil")
				}
				return
			}

			if wrapped == nil {
				t.Error("wrapped should not be nil")
				return
			}

			// Should be unwrappable
			if !errors.Is(wrapped, tc.err) {
				t.Error("should be able to unwrap to original")
			}

			// Error message should contain context if non-empty
			if tc.context != "" && !strings.Contains(wrapped.Error(), tc.context) {
				t.Error("error should contain context")
			}
		})
	}
}

// TestError_WrapError_DeepChain tests deeply nested error chains
func TestError_WrapError_DeepChain(t *testing.T) {
	depths := []int{1, 10, 100, 1000}

	for _, depth := range depths {
		t.Run(fmt.Sprintf("depth_%d", depth), func(t *testing.T) {
			var err error = ErrNotFound
			for i := 0; i < depth; i++ {
				err = WrapError(err, fmt.Sprintf("level_%d", i))
			}

			// Should still be able to find original
			if !errors.Is(err, ErrNotFound) {
				t.Error("should find original error at any depth")
			}

			// Error message should contain all contexts
			errStr := err.Error()
			if !strings.Contains(errStr, "level_0") {
				t.Error("should contain first level")
			}
			if !strings.Contains(errStr, fmt.Sprintf("level_%d", depth-1)) {
				t.Error("should contain last level")
			}
		})
	}
}

// TestError_WrapError_MixedTypes tests wrapping different error types
func TestError_WrapError_MixedTypes(t *testing.T) {
	// Wrap sentinel error
	err1 := WrapError(ErrNotFound, "context1")
	if !errors.Is(err1, ErrNotFound) {
		t.Error("should unwrap to sentinel")
	}

	// Wrap APIError
	apiErr := &APIError{Code: "TEST", Message: "test"}
	err2 := WrapError(apiErr, "context2")
	var target *APIError
	if !errors.As(err2, &target) {
		t.Error("should unwrap to APIError")
	}

	// Wrap wrapped error
	err3 := WrapError(err1, "context3")
	if !errors.Is(err3, ErrNotFound) {
		t.Error("should still unwrap to original")
	}

	// Wrap standard error
	stdErr := errors.New("standard error")
	err4 := WrapError(stdErr, "context4")
	if !errors.Is(err4, stdErr) {
		t.Error("should unwrap to standard error")
	}
}

// TestError_ErrorsIs_AllCombinations tests errors.Is for all error types
func TestError_ErrorsIs_AllCombinations(t *testing.T) {
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
			shouldMatch := i == j
			doesMatch := errors.Is(err1, err2)

			if shouldMatch != doesMatch {
				t.Errorf("errors.Is(%v, %v) = %v, expected %v",
					err1, err2, doesMatch, shouldMatch)
			}
		}
	}
}

// TestError_ErrorsAs_APIError tests errors.As with APIError
func TestError_ErrorsAs_APIError(t *testing.T) {
	// Direct APIError
	err := &APIError{Code: "TEST", Message: "test"}
	var target *APIError
	if !errors.As(err, &target) {
		t.Error("should match direct APIError")
	}

	// Wrapped APIError
	wrapped := fmt.Errorf("wrapped: %w", err)
	if !errors.As(wrapped, &target) {
		t.Error("should match wrapped APIError")
	}

	// Double wrapped APIError
	doubleWrapped := fmt.Errorf("double: %w", wrapped)
	if !errors.As(doubleWrapped, &target) {
		t.Error("should match double wrapped APIError")
	}

	// Sentinel error should NOT match APIError
	var notAPIError *APIError
	if errors.As(ErrNotFound, &notAPIError) {
		t.Error("sentinel should not match APIError")
	}
}

// TestError_ConcurrentAccess tests concurrent error access
func TestError_ConcurrentAccess(t *testing.T) {
	// Sentinel errors should be safe for concurrent access
	done := make(chan bool, 100)

	for i := 0; i < 100; i++ {
		go func() {
			_ = ErrNotFound.Error()
			_ = errors.Is(ErrNotFound, ErrNotFound)
			done <- true
		}()
	}

	for i := 0; i < 100; i++ {
		<-done
	}
}

// TestError_APIError_ZeroValue tests zero value APIError
func TestError_APIError_ZeroValue(t *testing.T) {
	var err APIError
	errStr := err.Error()

	// Should not panic
	if errStr == "" {
		t.Error("zero value should still produce error string")
	}

	// Pointer to zero value
	pErr := &APIError{}
	if pErr.Error() == "" {
		t.Error("pointer to zero value should still produce error string")
	}
}

// TestError_APIError_ErrorFormat tests error string format
func TestError_APIError_ErrorFormat(t *testing.T) {
	err := &APIError{
		Code:    "INVALID_REQUEST",
		Message: "The request was invalid",
		Details: "Missing required field: name",
	}

	errStr := err.Error()

	// Should be human readable
	if !strings.Contains(errStr, "INVALID_REQUEST") {
		t.Error("should contain code")
	}
	if !strings.Contains(errStr, "request was invalid") {
		t.Error("should contain message")
	}
}

// TestError_WrapError_NilHandling tests WrapError nil handling
func TestError_WrapError_NilHandling(t *testing.T) {
	// Wrap nil
	result := WrapError(nil, "context")
	if result != nil {
		t.Error("wrapping nil should return nil")
	}

	// Wrap with empty context
	result = WrapError(ErrNotFound, "")
	if result == nil {
		t.Error("wrapping with empty context should not return nil")
	}
}

// TestError_ChainPreservation tests error chain preservation
func TestError_ChainPreservation(t *testing.T) {
	// Build a chain: APIError -> wrapped -> wrapped -> wrapped
	original := &APIError{Code: "ORIGINAL", Message: "original error"}

	chain := []error{original}
	current := error(original)

	for i := 0; i < 10; i++ {
		current = WrapError(current, fmt.Sprintf("layer_%d", i))
		chain = append(chain, current)
	}

	// Should be able to extract original from any point in chain
	for i, err := range chain {
		var apiErr *APIError
		if !errors.As(err, &apiErr) {
			t.Errorf("chain[%d]: should extract APIError", i)
		}
		if apiErr.Code != "ORIGINAL" {
			t.Errorf("chain[%d]: code should be preserved", i)
		}
	}
}

// TestError_MessageContent tests error message content quality
func TestError_MessageContent(t *testing.T) {
	// All sentinel errors should have meaningful messages
	sentinels := []error{
		ErrNotFound,
		ErrAlreadyExists,
		ErrAlreadyRunning,
		ErrNotRunning,
		ErrTimeout,
		ErrAPIKeyMissing,
	}

	for _, err := range sentinels {
		msg := err.Error()

		// Should not be just "error"
		if msg == "error" {
			t.Errorf("%v: message should be more descriptive than 'error'", err)
		}

		// Should not contain weird characters
		if strings.ContainsAny(msg, "\x00\x01\x02") {
			t.Errorf("%v: message should not contain control characters", err)
		}

		// Should be reasonable length
		if len(msg) > 1000 {
			t.Errorf("%v: message too long (%d chars)", err, len(msg))
		}
	}
}
