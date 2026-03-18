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
	"path/filepath"
	"time"

	"github.com/spf13/cobra"
)

var (
	orchestrateViewPort      int
	orchestrateViewNoBrowser bool
	orchestrateViewWatch     bool
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

Live Mode (--watch):
  With --watch, the viewer reloads the bundle file on each browser refresh.
  This enables live monitoring of in-progress runs created with --persist.
  The browser auto-refreshes every 5 seconds when watching.

  You can also pass a run directory path instead of a bundle file:
    devsh orchestrate view ~/.devsh/orchestrations/local_123 --watch

Examples:
  devsh orchestrate view ./debug-bundle.json
  devsh orchestrate view ./debug-bundle.json --port 8080
  devsh orchestrate view ./debug-bundle.json --no-browser
  devsh orchestrate view ./debug-bundle.json --watch
  devsh orchestrate view ~/.devsh/orchestrations/local_123 --watch
  cat bundle.json | devsh orchestrate view -`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		inputPath := args[0]

		// Resolve bundle path - could be a bundle file or a run directory
		bundlePath, isRunDir := resolveBundlePath(inputPath)
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

func init() {
	orchestrateViewCmd.Flags().IntVar(&orchestrateViewPort, "port", 0, "Port to serve on (default: auto-select starting at 3456)")
	orchestrateViewCmd.Flags().BoolVar(&orchestrateViewNoBrowser, "no-browser", false, "Don't automatically open browser")
	orchestrateViewCmd.Flags().BoolVar(&orchestrateViewWatch, "watch", false, "Enable live mode - reload bundle on each refresh, auto-refresh every 5s")
	orchestrateCmd.AddCommand(orchestrateViewCmd)
}
