// Package vm provides a simple client for managing Morph VMs via Convex API.
package vm

import (
	"net/http"
	"strings"
	"testing"
)

func TestFormatAPIError401(t *testing.T) {
	err := formatAPIError(http.StatusUnauthorized, "invalid token", "test endpoint")

	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()
	if !strings.Contains(errStr, "401") {
		t.Errorf("expected error to contain '401', got: %s", errStr)
	}
	if !strings.Contains(errStr, "authentication failed") {
		t.Errorf("expected error to contain 'authentication failed', got: %s", errStr)
	}
	if !strings.Contains(errStr, "devsh login") {
		t.Errorf("expected error to mention 'devsh login', got: %s", errStr)
	}
	if !strings.Contains(errStr, "CMUX_TASK_RUN_JWT") {
		t.Errorf("expected error to mention JWT, got: %s", errStr)
	}
}

func TestFormatAPIError403(t *testing.T) {
	err := formatAPIError(http.StatusForbidden, "access denied", "test endpoint")

	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()
	if !strings.Contains(errStr, "403") {
		t.Errorf("expected error to contain '403', got: %s", errStr)
	}
	if !strings.Contains(errStr, "access denied") {
		t.Errorf("expected error to contain 'access denied', got: %s", errStr)
	}
	if !strings.Contains(errStr, "permission") {
		t.Errorf("expected error to mention permission, got: %s", errStr)
	}
}

func TestFormatAPIError404(t *testing.T) {
	err := formatAPIError(http.StatusNotFound, "not found", "test endpoint")

	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()
	if !strings.Contains(errStr, "404") {
		t.Errorf("expected error to contain '404', got: %s", errStr)
	}
	if !strings.Contains(errStr, "not found") {
		t.Errorf("expected error to contain 'not found', got: %s", errStr)
	}
}

func TestFormatAPIError429(t *testing.T) {
	err := formatAPIError(http.StatusTooManyRequests, "rate limited", "test endpoint")

	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()
	if !strings.Contains(errStr, "429") {
		t.Errorf("expected error to contain '429', got: %s", errStr)
	}
	if !strings.Contains(errStr, "rate limited") {
		t.Errorf("expected error to contain 'rate limited', got: %s", errStr)
	}
}

func TestFormatAPIError500(t *testing.T) {
	err := formatAPIError(http.StatusInternalServerError, "internal error", "test endpoint")

	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()
	if !strings.Contains(errStr, "500") {
		t.Errorf("expected error to contain '500', got: %s", errStr)
	}
	if !strings.Contains(errStr, "server error") {
		t.Errorf("expected error to contain 'server error', got: %s", errStr)
	}
}

func TestFormatAPIError502(t *testing.T) {
	err := formatAPIError(http.StatusBadGateway, "bad gateway", "test endpoint")

	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()
	if !strings.Contains(errStr, "502") {
		t.Errorf("expected error to contain '502', got: %s", errStr)
	}
	if !strings.Contains(errStr, "unavailable") {
		t.Errorf("expected error to mention unavailable, got: %s", errStr)
	}
}

func TestFormatAPIErrorDefault(t *testing.T) {
	err := formatAPIError(418, "I'm a teapot", "test endpoint")

	if err == nil {
		t.Fatal("expected error, got nil")
	}

	errStr := err.Error()
	if !strings.Contains(errStr, "418") {
		t.Errorf("expected error to contain '418', got: %s", errStr)
	}
	if !strings.Contains(errStr, "I'm a teapot") {
		t.Errorf("expected error to contain body, got: %s", errStr)
	}
}

func TestReadErrorBodyEmpty(t *testing.T) {
	result := readErrorBody(strings.NewReader(""))
	if result != "(empty response)" {
		t.Errorf("expected '(empty response)', got: %s", result)
	}
}

func TestReadErrorBodyWithContent(t *testing.T) {
	result := readErrorBody(strings.NewReader("error message"))
	if result != "error message" {
		t.Errorf("expected 'error message', got: %s", result)
	}
}
