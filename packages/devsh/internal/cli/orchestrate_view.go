// internal/cli/orchestrate_view.go
package cli

import (
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

var (
	orchestrateViewPort      int
	orchestrateViewNoBrowser bool
	orchestrateViewWatch     bool
	orchestrateViewLive      bool
)

//go:embed orchestrate_view.html
var viewerHTML embed.FS

var orchestrateViewCmd = &cobra.Command{
	Use:   "view <bundle.json|run-dir>",
	Short: "View an exported orchestration bundle in a local browser",
	Long: `Open a local HTTP server to view an exported orchestration bundle.

This provides an offline, read-only replay viewer for debugging orchestrations
without requiring Convex, server, or client services running.

The viewer shows the 3-surface split (Operator/Supervisor/Worker) from the
exported bundle data.

Live Modes:

  --watch: Reloads bundle.json on each refresh (5s auto-refresh).
    Useful for monitoring runs that write a bundle.json file.

  --live: Reads raw run directory files (config.json, state.json, events.jsonl, logs)
    with 2s auto-refresh. Best for actively running tasks created with --persist.
    Automatically detected when passing a run directory without bundle.json.

  Both modes support run directories:
    devsh orchestrate view ~/.devsh/orchestrations/local_123 --watch
    devsh orchestrate view ~/.devsh/orchestrations/local_123 --live

Examples:
  devsh orchestrate view ./debug-bundle.json
  devsh orchestrate view ./debug-bundle.json --port 8080
  devsh orchestrate view ./debug-bundle.json --no-browser
  devsh orchestrate view ./debug-bundle.json --watch
  devsh orchestrate view ~/.devsh/orchestrations/local_123 --watch
  devsh orchestrate view ~/.devsh/orchestrations/local_123 --live
  devsh orchestrate view local_abc123 --live
  cat bundle.json | devsh orchestrate view -`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		inputPath := args[0]

		// Resolve bundle path - could be a bundle file or a run directory
		bundlePath, isRunDir := resolveBundlePath(inputPath)

		// If --live mode or no bundle.json found but is a run directory, use live mode
		if orchestrateViewLive || (bundlePath == "" && isRunDir) {
			runDir, err := resolveRunDirForView(inputPath)
			if err != nil {
				return err
			}
			return serveLiveRunDirectory(runDir)
		}

		if bundlePath == "" {
			return fmt.Errorf("could not find bundle.json in path: %s", inputPath)
		}

		// For stdin, read once and serve static
		var staticBundle *ExportBundle
		if inputPath == "-" {
			data, err := io.ReadAll(os.Stdin)
			if err != nil {
				return fmt.Errorf("failed to read from stdin: %w", err)
			}
			var bundle ExportBundle
			if err := json.Unmarshal(data, &bundle); err != nil {
				return fmt.Errorf("failed to parse bundle JSON: %w", err)
			}
			staticBundle = &bundle
			bundlePath = "(stdin)"
		}

		// Initial load to validate and show summary
		var initialBundle ExportBundle
		if staticBundle != nil {
			initialBundle = *staticBundle
		} else {
			data, err := os.ReadFile(bundlePath)
			if err != nil {
				return fmt.Errorf("failed to read bundle file: %w", err)
			}
			if err := json.Unmarshal(data, &initialBundle); err != nil {
				return fmt.Errorf("failed to parse bundle JSON: %w", err)
			}
		}

		// Find available port
		port := orchestrateViewPort
		if port == 0 {
			port = findAvailablePort(3456)
		}

		// Create HTTP server
		mux := http.NewServeMux()

		// Serve the bundle data as JSON
		mux.HandleFunc("/api/bundle", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Access-Control-Allow-Origin", "*")

			// In watch mode, reload from file each time
			if orchestrateViewWatch && staticBundle == nil {
				data, err := os.ReadFile(bundlePath)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				var bundle ExportBundle
				if err := json.Unmarshal(data, &bundle); err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				json.NewEncoder(w).Encode(bundle)
			} else if staticBundle != nil {
				json.NewEncoder(w).Encode(staticBundle)
			} else {
				json.NewEncoder(w).Encode(initialBundle)
			}
		})

		// Serve watch mode indicator
		mux.HandleFunc("/api/watch", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]bool{"watch": orchestrateViewWatch})
		})

		// Serve the HTML viewer
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			tmpl := template.Must(template.ParseFS(viewerHTML, "orchestrate_view.html"))
			tmpl.Execute(w, nil)
		})

		addr := fmt.Sprintf("localhost:%d", port)
		url := fmt.Sprintf("http://%s", addr)

		fmt.Printf("Orchestration Viewer starting at %s\n", url)
		fmt.Printf("Bundle: %s\n", bundlePath)
		if isRunDir {
			fmt.Printf("Run Directory: %s\n", inputPath)
		}
		if orchestrateViewWatch {
			fmt.Printf("Mode: LIVE (auto-refresh every 5s)\n")
		}
		fmt.Printf("Tasks: %d (completed: %d, failed: %d)\n",
			initialBundle.Summary.TotalTasks,
			initialBundle.Summary.CompletedTasks,
			initialBundle.Summary.FailedTasks)
		fmt.Println("Press Ctrl+C to stop")

		// Open browser unless --no-browser
		if !orchestrateViewNoBrowser {
			go func() {
				time.Sleep(500 * time.Millisecond)
				openBrowser(url)
			}()
		}

		server := &http.Server{
			Addr:    addr,
			Handler: mux,
		}

		return server.ListenAndServe()
	},
}

func findAvailablePort(startPort int) int {
	for port := startPort; port < startPort+100; port++ {
		listener, err := net.Listen("tcp", fmt.Sprintf("localhost:%d", port))
		if err == nil {
			listener.Close()
			return port
		}
	}
	return startPort
}

// resolveBundlePath resolves the input path to a bundle.json file.
// If the path is a directory, it looks for bundle.json inside it.
// Returns the resolved bundle path and whether the input was a directory.
func resolveBundlePath(inputPath string) (string, bool) {
	if inputPath == "-" {
		return inputPath, false
	}

	info, err := os.Stat(inputPath)
	if err != nil {
		return "", false
	}

	if info.IsDir() {
		// Look for bundle.json in the directory
		bundlePath := filepath.Join(inputPath, "bundle.json")
		if _, err := os.Stat(bundlePath); err == nil {
			return bundlePath, true
		}
		return "", true
	}

	// It's a file, use it directly
	return inputPath, false
}

// resolveRunDirForView resolves a run-id or path to a run directory for live mode
func resolveRunDirForView(inputPath string) (string, error) {
	// Try as direct path first
	if info, err := os.Stat(inputPath); err == nil && info.IsDir() {
		configPath := filepath.Join(inputPath, "config.json")
		if _, err := os.Stat(configPath); err == nil {
			return inputPath, nil
		}
	}

	// Try resolving as a run ID (uses the same logic as serve-local)
	return resolveLocalRunDir(inputPath)
}

// serveLiveRunDirectory serves a live view of a run directory with 2s refresh
// This provides the same functionality as serve-local but through the unified view command
func serveLiveRunDirectory(runDir string) error {
	configPath := filepath.Join(runDir, "config.json")
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return fmt.Errorf("not a valid run directory (no config.json): %s", runDir)
	}

	port := orchestrateViewPort
	if port == 0 {
		port = findAvailablePort(3456)
	}

	mux := http.NewServeMux()

	// API: Get current state (for live mode)
	mux.HandleFunc("/api/state", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		// Try state.json first (completed runs)
		statePath := filepath.Join(runDir, "state.json")
		if data, err := os.ReadFile(statePath); err == nil {
			w.Write(data)
			return
		}

		// Fall back to config.json (in-progress runs)
		configData, err := os.ReadFile(configPath)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var config LocalRunConfig
		if err := json.Unmarshal(configData, &config); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		state := map[string]any{
			"orchestrationId": config.OrchestrationID,
			"agent":           config.Agent,
			"prompt":          config.Prompt,
			"workspace":       config.Workspace,
			"status":          "running",
			"startedAt":       config.CreatedAt,
		}
		json.NewEncoder(w).Encode(state)
	})

	// API: Get events (for live mode)
	mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		eventsPath := filepath.Join(runDir, "events.jsonl")
		data, err := os.ReadFile(eventsPath)
		if err != nil {
			json.NewEncoder(w).Encode([]any{})
			return
		}

		var events []LocalEvent
		for _, line := range splitLines(string(data)) {
			if line == "" {
				continue
			}
			var event LocalEvent
			if err := json.Unmarshal([]byte(line), &event); err == nil {
				events = append(events, event)
			}
		}
		json.NewEncoder(w).Encode(events)
	})

	// API: Get logs (for live mode)
	mux.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		logs := map[string]string{}
		if stdout, err := os.ReadFile(filepath.Join(runDir, "stdout.log")); err == nil {
			logs["stdout"] = string(stdout)
		}
		if stderr, err := os.ReadFile(filepath.Join(runDir, "stderr.log")); err == nil {
			logs["stderr"] = string(stderr)
		}
		json.NewEncoder(w).Encode(logs)
	})

	// API: Get config
	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		data, err := os.ReadFile(configPath)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(data)
	})

	// API: Bundle endpoint that synthesizes from raw files (for viewer compatibility)
	mux.HandleFunc("/api/bundle", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")

		bundle := synthesizeBundleFromRunDir(runDir)
		json.NewEncoder(w).Encode(bundle)
	})

	// API: Watch mode indicator - always true for live mode
	mux.HandleFunc("/api/watch", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"watch":    true,
			"live":     true,
			"interval": 2000,
		})
	})

	// Serve the HTML viewer (same as bundle mode)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		tmpl := template.Must(template.ParseFS(viewerHTML, "orchestrate_view.html"))
		tmpl.Execute(w, nil)
	})

	addr := fmt.Sprintf("localhost:%d", port)
	url := fmt.Sprintf("http://%s", addr)

	fmt.Printf("Orchestration Viewer (LIVE) starting at %s\n", url)
	fmt.Printf("Run Directory: %s\n", runDir)
	fmt.Printf("Mode: LIVE (reading raw files, 2s auto-refresh)\n")
	fmt.Println("Press Ctrl+C to stop")

	if !orchestrateViewNoBrowser {
		go func() {
			time.Sleep(500 * time.Millisecond)
			openBrowser(url)
		}()
	}

	server := &http.Server{
		Addr:    addr,
		Handler: mux,
	}

	return server.ListenAndServe()
}

// synthesizeBundleFromRunDir creates a bundle from raw run directory files
func synthesizeBundleFromRunDir(runDir string) ExportBundle {
	bundle := ExportBundle{
		Version:    "1.0",
		ExportedAt: time.Now().Format(time.RFC3339),
	}

	// Read config
	if data, err := os.ReadFile(filepath.Join(runDir, "config.json")); err == nil {
		var config LocalRunConfig
		if json.Unmarshal(data, &config) == nil {
			bundle.Orchestration.ID = config.OrchestrationID
			bundle.Orchestration.CreatedAt = config.CreatedAt
			bundle.Orchestration.Prompt = config.Prompt

			// Populate metadata from config
			bundle.Metadata = &ExportMetadata{
				Workspace:    config.Workspace,
				DevshVersion: config.DevshVersion,
				AgentCLI:     config.Agent,
				Source:       "local",
				GitBranch:    getGitBranch(config.Workspace),
				GitCommit:    getGitCommit(config.Workspace),
			}
		}
	}

	// Read state if available
	if data, err := os.ReadFile(filepath.Join(runDir, "state.json")); err == nil {
		var state LocalState
		if json.Unmarshal(data, &state) == nil {
			bundle.Orchestration.Status = state.Status

			// Create single task from state
			agentName := state.Agent
			task := TaskExportInfo{
				TaskID:    state.OrchestrationID + "_task",
				Prompt:    state.Prompt,
				Status:    state.Status,
				AgentName: &agentName,
			}
			if state.Result != nil {
				task.Result = state.Result
			}
			if state.Error != nil {
				task.ErrorMessage = state.Error
			}
			bundle.Tasks = []TaskExportInfo{task}
		}
	} else {
		// In-progress run - set status to running
		bundle.Orchestration.Status = "running"
		bundle.Summary.RunningTasks = 1
	}

	// Read events
	if data, err := os.ReadFile(filepath.Join(runDir, "events.jsonl")); err == nil {
		for _, line := range splitLines(string(data)) {
			if line == "" {
				continue
			}
			var event LocalEvent
			if json.Unmarshal([]byte(line), &event) == nil {
				bundle.Events = append(bundle.Events, EventExportInfo{
					Timestamp: event.Timestamp,
					Type:      event.Type,
					Message:   event.Message,
				})
			}
		}
	}

	// Read logs
	if stdout, err := os.ReadFile(filepath.Join(runDir, "stdout.log")); err == nil {
		if bundle.Logs == nil {
			bundle.Logs = &ExportLogs{}
		}
		bundle.Logs.Stdout = string(stdout)
	}
	if stderr, err := os.ReadFile(filepath.Join(runDir, "stderr.log")); err == nil {
		if bundle.Logs == nil {
			bundle.Logs = &ExportLogs{}
		}
		bundle.Logs.Stderr = string(stderr)
	}

	// Update summary
	bundle.Summary.TotalTasks = len(bundle.Tasks)
	for _, task := range bundle.Tasks {
		switch task.Status {
		case "completed":
			bundle.Summary.CompletedTasks++
		case "failed":
			bundle.Summary.FailedTasks++
		case "running":
			bundle.Summary.RunningTasks++
		case "pending":
			bundle.Summary.PendingTasks++
		}
	}

	return bundle
}

// getGitBranch returns the current git branch name in the given directory
func getGitBranch(dir string) string {
	cmd := exec.Command("git", "rev-parse", "--abbrev-ref", "HEAD")
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// getGitCommit returns the current HEAD commit SHA in the given directory
func getGitCommit(dir string) string {
	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Dir = dir
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func init() {
	orchestrateViewCmd.Flags().IntVar(&orchestrateViewPort, "port", 0, "Port to serve on (default: auto-select starting at 3456)")
	orchestrateViewCmd.Flags().BoolVar(&orchestrateViewNoBrowser, "no-browser", false, "Don't automatically open browser")
	orchestrateViewCmd.Flags().BoolVar(&orchestrateViewWatch, "watch", false, "Enable watch mode - reload bundle on each refresh, auto-refresh every 5s")
	orchestrateViewCmd.Flags().BoolVar(&orchestrateViewLive, "live", false, "Enable live mode - read raw run files (config/state/events/logs), 2s auto-refresh")
	orchestrateCmd.AddCommand(orchestrateViewCmd)
}
