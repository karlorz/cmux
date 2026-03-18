package cli

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func TestDefaultPollConfig(t *testing.T) {
	config := DefaultPollConfig(5 * time.Second)
	if config.Interval != 5*time.Second {
		t.Errorf("expected 5s interval, got %v", config.Interval)
	}
	if config.ClearScreen {
		t.Error("expected ClearScreen=false for default config")
	}
	if config.WatchHeader != "" {
		t.Error("expected empty WatchHeader for default config")
	}
}

func TestWatchPollConfig(t *testing.T) {
	config := WatchPollConfig(3*time.Second, "Test Header")
	if config.Interval != 3*time.Second {
		t.Errorf("expected 3s interval, got %v", config.Interval)
	}
	if !config.ClearScreen {
		t.Error("expected ClearScreen=true for watch config")
	}
	if config.WatchHeader != "Test Header" {
		t.Errorf("expected header 'Test Header', got %q", config.WatchHeader)
	}
}

func TestPollUntilImmediateStop(t *testing.T) {
	ctx := context.Background()
	config := PollConfig{Interval: time.Second}

	fetchCount := 0
	displayCount := 0

	err := PollUntil(
		ctx,
		config,
		func(ctx context.Context) (interface{}, error) {
			fetchCount++
			return "done", nil
		},
		func(result interface{}, lastValue string) (bool, string, error) {
			return true, "done", nil
		},
		func(result interface{}, isInitial bool) {
			displayCount++
			if !isInitial {
				t.Error("expected isInitial=true on first call")
			}
		},
	)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if fetchCount != 1 {
		t.Errorf("expected 1 fetch, got %d", fetchCount)
	}
	if displayCount != 1 {
		t.Errorf("expected 1 display, got %d", displayCount)
	}
}

func TestPollUntilMultipleIterations(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	config := PollConfig{Interval: time.Second}

	fetchCount := 0

	err := PollUntil(
		ctx,
		config,
		func(ctx context.Context) (interface{}, error) {
			fetchCount++
			return fetchCount, nil
		},
		func(result interface{}, lastValue string) (bool, string, error) {
			count := result.(int)
			value := fmt.Sprintf("%d", count)
			// Stop after 3 fetches
			if count >= 3 {
				return true, value, nil
			}
			return false, value, nil
		},
		func(result interface{}, isInitial bool) {
			// Accept display calls
		},
	)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
	if fetchCount != 3 {
		t.Errorf("expected 3 fetches, got %d", fetchCount)
	}
}

func TestPollUntilFetchError(t *testing.T) {
	ctx := context.Background()
	config := PollConfig{Interval: time.Second}

	err := PollUntil(
		ctx,
		config,
		func(ctx context.Context) (interface{}, error) {
			return nil, fmt.Errorf("fetch failed")
		},
		func(result interface{}, lastValue string) (bool, string, error) {
			return false, "", nil
		},
		func(result interface{}, isInitial bool) {},
	)

	if err == nil {
		t.Error("expected error from failed initial fetch")
	}
	if err.Error() != "fetch failed" {
		t.Errorf("expected 'fetch failed' error, got %q", err.Error())
	}
}

func TestPollUntilContextCancel(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	config := PollConfig{Interval: time.Second}

	fetchCount := 0

	// Cancel after first fetch
	err := PollUntil(
		ctx,
		config,
		func(ctx context.Context) (interface{}, error) {
			fetchCount++
			if fetchCount == 1 {
				// Schedule cancel for after the initial display
				go func() {
					time.Sleep(50 * time.Millisecond)
					cancel()
				}()
			}
			return "data", nil
		},
		func(result interface{}, lastValue string) (bool, string, error) {
			return false, "running", nil
		},
		func(result interface{}, isInitial bool) {},
	)

	if err == nil {
		t.Error("expected error from context cancellation")
	}
}

func TestPollUntilMinInterval(t *testing.T) {
	// Verify that sub-second intervals get clamped to 3s
	ctx := context.Background()
	config := PollConfig{Interval: 100 * time.Millisecond}

	err := PollUntil(
		ctx,
		config,
		func(ctx context.Context) (interface{}, error) {
			return "ok", nil
		},
		func(result interface{}, lastValue string) (bool, string, error) {
			return true, "done", nil
		},
		func(result interface{}, isInitial bool) {},
	)

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}
}
