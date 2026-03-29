package pvelxc

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
)

type rewriteExecTransport struct {
	target *url.URL
}

func (t *rewriteExecTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	clone := req.Clone(req.Context())
	clone.URL.Scheme = t.target.Scheme
	clone.URL.Host = t.target.Host
	clone.Host = t.target.Host
	return http.DefaultTransport.RoundTrip(clone)
}

func newExecReadyTestClient(t *testing.T, execHandler http.HandlerFunc) *Client {
	t.Helper()

	apiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case strings.HasSuffix(r.URL.Path, "/dns"):
			_, _ = w.Write([]byte(`{"data":{"search":""}}`))
		case strings.HasSuffix(r.URL.Path, "/config"):
			_, _ = w.Write([]byte(`{"data":{"hostname":"cmux-200"}}`))
		default:
			t.Fatalf("unexpected PVE API path: %s", r.URL.Path)
		}
	}))
	t.Cleanup(apiServer.Close)

	execServer := httptest.NewServer(execHandler)
	t.Cleanup(execServer.Close)

	targetURL, err := url.Parse(execServer.URL)
	if err != nil {
		t.Fatalf("parse exec server URL: %v", err)
	}

	return &Client{
		apiURL:       apiServer.URL,
		apiToken:     "token",
		publicDomain: "example.com",
		apiHTTP:      apiServer.Client(),
		execHTTP: &http.Client{
			Transport: &rewriteExecTransport{target: targetURL},
		},
		node: "test-node",
	}
}

func TestWaitForExecReadyImmediateSuccess(t *testing.T) {
	client := newExecReadyTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("{\"type\":\"stdout\",\"data\":\"ready\"}\n{\"type\":\"exit\",\"code\":0}\n"))
	})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := client.WaitForExecReady(ctx, "200", 2*time.Second); err != nil {
		t.Fatalf("WaitForExecReady() error = %v", err)
	}
}

func TestWaitForExecReadyRetriesUntilSuccess(t *testing.T) {
	var (
		mu       sync.Mutex
		attempts int
	)

	client := newExecReadyTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		attempts++

		if attempts < 3 {
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte("not ready"))
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("{\"type\":\"stdout\",\"data\":\"ready\"}\n{\"type\":\"exit\",\"code\":0}\n"))
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.WaitForExecReady(ctx, "200", 5*time.Second); err != nil {
		t.Fatalf("WaitForExecReady() error = %v", err)
	}

	mu.Lock()
	defer mu.Unlock()
	if attempts != 3 {
		t.Fatalf("expected 3 attempts, got %d", attempts)
	}
}

func TestWaitForExecReadyTimesOut(t *testing.T) {
	client := newExecReadyTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("not ready"))
	})

	err := client.WaitForExecReady(context.Background(), "200", 50*time.Millisecond)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("WaitForExecReady() error = %v, want deadline exceeded", err)
	}
	if !strings.Contains(err.Error(), "did not become ready") {
		t.Fatalf("expected timeout error to mention readiness, got %q", err)
	}
}

func TestWaitForExecReadyHonorsCancellation(t *testing.T) {
	client := newExecReadyTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte("not ready"))
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := client.WaitForExecReady(ctx, "200", time.Second)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("WaitForExecReady() error = %v, want canceled", err)
	}
}
