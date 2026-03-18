// internal/cli/orchestrate_view.go
package cli

import (
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/spf13/cobra"
)

var (
	orchestrateViewPort    int
	orchestrateViewNoBrowser bool
)

//go:embed orchestrate_view.html
var viewerHTML embed.FS

var orchestrateViewCmd = &cobra.Command{
	Use:   "view <bundle.json>",
	Short: "View an exported orchestration bundle in a local browser",
	Long: `Open a local HTTP server to view an exported orchestration bundle.

This provides an offline, read-only replay viewer for debugging orchestrations
without requiring Convex, server, or client services running.

The viewer shows the 3-surface split (Operator/Supervisor/Worker) from the
exported bundle data.

Examples:
  devsh orchestrate view ./debug-bundle.json
  devsh orchestrate view ./debug-bundle.json --port 8080
  devsh orchestrate view ./debug-bundle.json --no-browser`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		bundlePath := args[0]

		// Read and validate bundle
		data, err := os.ReadFile(bundlePath)
		if err != nil {
			return fmt.Errorf("failed to read bundle file: %w", err)
		}

		var bundle ExportBundle
		if err := json.Unmarshal(data, &bundle); err != nil {
			return fmt.Errorf("failed to parse bundle JSON: %w", err)
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
			json.NewEncoder(w).Encode(bundle)
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
		fmt.Printf("Tasks: %d (completed: %d, failed: %d)\n",
			bundle.Summary.TotalTasks,
			bundle.Summary.CompletedTasks,
			bundle.Summary.FailedTasks)
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

func init() {
	orchestrateViewCmd.Flags().IntVarP(&orchestrateViewPort, "port", "p", 0, "Port to serve on (default: auto-select starting at 3456)")
	orchestrateViewCmd.Flags().BoolVar(&orchestrateViewNoBrowser, "no-browser", false, "Don't automatically open browser")
	orchestrateCmd.AddCommand(orchestrateViewCmd)
}
