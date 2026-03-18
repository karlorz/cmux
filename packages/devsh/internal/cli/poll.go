// internal/cli/poll.go
package cli

import (
	"context"
	"fmt"
	"time"
)

// PollConfig holds configuration for the polling operation.
type PollConfig struct {
	Interval    time.Duration
	ClearScreen bool
	WatchHeader string // Shown at top of screen when watching
}

// PollResult represents the result of a poll operation.
type PollResult struct {
	Done      bool   // If true, polling should stop
	LastValue string // Used for change detection (e.g., status string)
}

// DefaultPollConfig returns a standard poll configuration.
func DefaultPollConfig(interval time.Duration) PollConfig {
	return PollConfig{
		Interval:    interval,
		ClearScreen: false,
	}
}

// WatchPollConfig returns a poll configuration for watch mode.
func WatchPollConfig(interval time.Duration, header string) PollConfig {
	return PollConfig{
		Interval:    interval,
		ClearScreen: true,
		WatchHeader: header,
	}
}

// PollUntil runs a fetch-and-check loop until shouldStop returns true or context is cancelled.
// The fetch function is called at each interval.
// The shouldStop function receives the result and returns (done, newValue, error).
// The display function is called whenever the value changes.
func PollUntil(
	ctx context.Context,
	config PollConfig,
	fetch func(ctx context.Context) (interface{}, error),
	shouldStop func(result interface{}, lastValue string) (done bool, newValue string, err error),
	display func(result interface{}, isInitial bool),
) error {
	// Validate interval
	if config.Interval < time.Second {
		config.Interval = 3 * time.Second
	}

	ticker := time.NewTicker(config.Interval)
	defer ticker.Stop()

	var lastValue string
	isInitial := true

	// Initial fetch
	result, err := fetch(ctx)
	if err != nil {
		return err
	}

	done, lastValue, err := shouldStop(result, lastValue)
	if err != nil {
		return err
	}

	if config.ClearScreen {
		clearScreen()
		if config.WatchHeader != "" {
			fmt.Printf("[%s] %s\n", time.Now().Format("15:04:05"), config.WatchHeader)
			fmt.Println("Press Ctrl+C to stop watching")
			fmt.Println()
		}
	}
	display(result, isInitial)
	isInitial = false

	if done {
		return nil
	}

	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("timeout or cancelled")
		case <-ticker.C:
			result, err := fetch(ctx)
			if err != nil {
				// Log error but continue polling
				fmt.Printf("[%s] Error: %v\n", time.Now().Format("15:04:05"), err)
				continue
			}

			done, newValue, err := shouldStop(result, lastValue)
			if err != nil {
				return err
			}

			// Only update display if value changed
			if newValue != lastValue || done {
				if config.ClearScreen {
					clearScreen()
					if config.WatchHeader != "" {
						fmt.Printf("[%s] %s (status changed: %s -> %s)\n",
							time.Now().Format("15:04:05"), config.WatchHeader, lastValue, newValue)
						fmt.Println("Press Ctrl+C to stop watching")
						fmt.Println()
					}
				}
				display(result, false)
				lastValue = newValue
			} else if config.ClearScreen {
				// Update timestamp without clearing screen
				fmt.Printf("\r[%s] Status: %s (polling...)", time.Now().Format("15:04:05"), lastValue)
			}

			if done {
				return nil
			}
		}
	}
}

// clearScreen clears the terminal screen using ANSI escape codes.
func clearScreen() {
	fmt.Print("\033[H\033[2J")
}
