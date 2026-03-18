// internal/cli/orchestrate_local_tail.go
package cli

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/spf13/cobra"
)

var (
	tailLocalFollow bool
	tailLocalStderr bool
	tailLocalLines  int
)

var orchestrateTailLocalCmd = &cobra.Command{
	Use:   "tail-local <run-id>",
	Short: "Tail logs from a local orchestration run",
	Long: `Follow or display logs from a local orchestration run.

By default shows stdout. Use --stderr to show stderr instead.
Use --follow (-f) to continuously follow new output.

Examples:
  devsh orchestrate tail-local local_abc123
  devsh orchestrate tail-local local_abc123 -f
  devsh orchestrate tail-local local_abc123 --stderr
  devsh orchestrate tail-local local_abc123 -f --stderr
  devsh orchestrate tail-local local_abc123 -n 50`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		runID := args[0]

		// Resolve run directory
		runDir, err := resolveLocalRunDir(runID)
		if err != nil {
			return err
		}

		// Determine which log file to tail
		logFile := "stdout.log"
		if tailLocalStderr {
			logFile = "stderr.log"
		}
		logPath := filepath.Join(runDir, logFile)

		// Check if log file exists
		if _, err := os.Stat(logPath); os.IsNotExist(err) {
			return fmt.Errorf("log file not found: %s", logPath)
		}

		if tailLocalFollow {
			return tailFollow(runDir, logPath)
		}

		return tailLast(logPath, tailLocalLines)
	},
}

// tailLast shows the last N lines of a file
func tailLast(logPath string, lines int) error {
	file, err := os.Open(logPath)
	if err != nil {
		return fmt.Errorf("failed to open log file: %w", err)
	}
	defer file.Close()

	// Read all lines and show last N
	var allLines []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		allLines = append(allLines, scanner.Text())
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("error reading log file: %w", err)
	}

	start := 0
	if len(allLines) > lines {
		start = len(allLines) - lines
	}

	for i := start; i < len(allLines); i++ {
		fmt.Println(allLines[i])
	}

	return nil
}

// tailFollow continuously follows a log file
func tailFollow(runDir, logPath string) error {
	// Setup signal handling for clean exit
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		cancel()
	}()

	file, err := os.Open(logPath)
	if err != nil {
		return fmt.Errorf("failed to open log file: %w", err)
	}
	defer file.Close()

	// Seek to end of file
	_, err = file.Seek(0, 2)
	if err != nil {
		return fmt.Errorf("failed to seek to end: %w", err)
	}

	// Show header
	fmt.Printf("Following %s (Ctrl+C to stop)\n", logPath)
	fmt.Println("---")

	reader := bufio.NewReader(file)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	stateTicker := time.NewTicker(2 * time.Second)
	defer stateTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			fmt.Println("\n---")
			fmt.Println("Stopped following logs")
			return nil

		case <-ticker.C:
			// Read any new lines
			for {
				line, err := reader.ReadString('\n')
				if err != nil {
					break
				}
				fmt.Print(line)
			}

		case <-stateTicker.C:
			// Check if run is still in progress
			statePath := filepath.Join(runDir, "state.json")
			if data, err := os.ReadFile(statePath); err == nil {
				var state LocalState
				if err := json.Unmarshal(data, &state); err == nil {
					if state.Status == "completed" || state.Status == "failed" {
						// Read any remaining lines
						for {
							line, err := reader.ReadString('\n')
							if err != nil {
								break
							}
							fmt.Print(line)
						}
						fmt.Println("\n---")
						fmt.Printf("Run %s: %s\n", state.OrchestrationID, state.Status)
						return nil
					}
				}
			}
		}
	}
}

func init() {
	orchestrateTailLocalCmd.Flags().BoolVarP(&tailLocalFollow, "follow", "f", false, "Follow log output in real-time")
	orchestrateTailLocalCmd.Flags().BoolVar(&tailLocalStderr, "stderr", false, "Show stderr instead of stdout")
	orchestrateTailLocalCmd.Flags().IntVarP(&tailLocalLines, "lines", "n", 20, "Number of lines to show (without -f)")
	orchestrateCmd.AddCommand(orchestrateTailLocalCmd)
}
