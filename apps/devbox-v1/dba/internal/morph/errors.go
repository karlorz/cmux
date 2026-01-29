// internal/morph/errors.go
package morph

import (
	"errors"
	"fmt"
)

var (
	// ErrNotFound is returned when a resource doesn't exist
	ErrNotFound = errors.New("resource not found")

	// ErrAlreadyExists is returned when trying to create existing resource
	ErrAlreadyExists = errors.New("resource already exists")

	// ErrAlreadyRunning is returned when starting an already-running instance
	ErrAlreadyRunning = errors.New("instance is already running")

	// ErrNotRunning is returned when stopping a non-running instance
	ErrNotRunning = errors.New("instance is not running")

	// ErrTimeout is returned when an operation times out
	ErrTimeout = errors.New("operation timed out")

	// ErrAPIKeyMissing is returned when MORPH_API_KEY is not set
	ErrAPIKeyMissing = errors.New("MORPH_API_KEY environment variable not set")

)

// APIError represents an error from the Morph API
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details string `json:"details"`
}

func (e *APIError) Error() string {
	return fmt.Sprintf("morph API error [%s]: %s", e.Code, e.Message)
}

// WrapError wraps an error with additional context
func WrapError(err error, context string) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", context, err)
}
