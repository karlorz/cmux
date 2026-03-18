// internal/cli/orchestrate_local_serve.go
package cli

import (
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/spf13/cobra"
)

var (
	serveLocalPort      int
	serveLocalNoBrowser bool
)

var orchestrateServeLocalCmd = &cobra.Command{
	Use:   "serve-local <run-id>",
	Short: "Serve a local run dashboard with live updates (deprecated: use 'view --live')",
	Long: `Start a local HTTP server to monitor a local orchestration run.

DEPRECATED: This command is deprecated. Use 'devsh orchestrate view <run-id> --live' instead,
which provides the same functionality plus the full 3-surface viewer (Operator/Tasks/Events/Logs).

This provides a browser-based dashboard for monitoring local runs created
with 'devsh orchestrate run-local --persist'. The dashboard auto-refreshes
to show the latest state, events, and logs.

Unlike 'view', which works with static bundle files, 'serve-local' monitors
the live run directory and shows real-time updates.

API Endpoints:
  GET /           - Dashboard HTML page
  GET /api/state  - Current run state (state.json or config.json)
  GET /api/events - Event timeline (events.jsonl)
  GET /api/logs   - Stdout and stderr logs
  GET /api/config - Run configuration

Examples:
  devsh orchestrate serve-local local_abc123
  devsh orchestrate serve-local local_abc123 --port 8080
  devsh orchestrate serve-local local_abc123 --no-browser
  devsh orchestrate serve-local ~/.devsh/orchestrations/local_abc123`,
	Args: cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		// Show deprecation warning
		fmt.Fprintln(os.Stderr, "DEPRECATED: serve-local is deprecated. Use 'devsh orchestrate view <run-id> --live' instead.")
		fmt.Fprintln(os.Stderr, "")

		runID := args[0]

		// Resolve run directory
		runDir, err := resolveLocalRunDir(runID)
		if err != nil {
			return err
		}

		// Verify it's a valid run directory
		configPath := filepath.Join(runDir, "config.json")
		if _, err := os.Stat(configPath); os.IsNotExist(err) {
			return fmt.Errorf("not a valid run directory (no config.json): %s", runDir)
		}

		// Find available port
		port := serveLocalPort
		if port == 0 {
			port = findAvailablePort(3457)
		}

		// Create HTTP server
		mux := http.NewServeMux()

		// API: Get current state
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

			// Return as partial state
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

		// API: Get events
		mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Access-Control-Allow-Origin", "*")

			eventsPath := filepath.Join(runDir, "events.jsonl")
			data, err := os.ReadFile(eventsPath)
			if err != nil {
				json.NewEncoder(w).Encode([]any{})
				return
			}

			// Parse JSONL
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

		// API: Get logs
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

		// Serve dashboard HTML
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			tmpl := template.Must(template.New("dashboard").Parse(serveDashboardHTML))
			tmpl.Execute(w, map[string]string{
				"RunDir": runDir,
				"RunID":  filepath.Base(runDir),
			})
		})

		addr := fmt.Sprintf("localhost:%d", port)
		url := fmt.Sprintf("http://%s", addr)

		fmt.Printf("Local Run Dashboard starting at %s\n", url)
		fmt.Printf("Run Directory: %s\n", runDir)
		fmt.Println("Auto-refreshes every 2 seconds")
		fmt.Println("Press Ctrl+C to stop")

		// Open browser unless --no-browser
		if !serveLocalNoBrowser {
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

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}

const serveDashboardHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Local Run: {{.RunID}}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      min-height: 100vh;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid #262626;
    }
    h1 { font-size: 20px; font-weight: 600; }
    .badge {
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge-completed { background: #166534; color: #bbf7d0; }
    .badge-failed { background: #991b1b; color: #fecaca; }
    .badge-running { background: #1e40af; color: #bfdbfe; }
    .live-indicator {
      display: inline-block;
      background: #1e40af;
      color: #bfdbfe;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      margin-left: 12px;
    }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .panel {
      background: #171717;
      border: 1px solid #262626;
      border-radius: 8px;
      padding: 16px;
    }
    .panel-title { font-size: 12px; color: #737373; margin-bottom: 12px; text-transform: uppercase; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #262626; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #a3a3a3; }
    .info-value { font-family: monospace; }
    .prompt-box {
      background: #0a0a0a;
      border: 1px solid #262626;
      border-radius: 6px;
      padding: 12px;
      font-family: monospace;
      font-size: 13px;
      white-space: pre-wrap;
      max-height: 150px;
      overflow-y: auto;
    }
    .events-list { max-height: 300px; overflow-y: auto; }
    .event-item {
      display: flex;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid #262626;
      font-size: 13px;
    }
    .event-time { font-family: monospace; color: #737373; white-space: nowrap; }
    .event-type { color: #60a5fa; }
    .logs-panel { grid-column: span 2; }
    .logs-content {
      background: #0a0a0a;
      border: 1px solid #262626;
      border-radius: 6px;
      padding: 12px;
      font-family: monospace;
      font-size: 12px;
      white-space: pre-wrap;
      max-height: 400px;
      overflow-y: auto;
    }
    .tabs { display: flex; gap: 8px; margin-bottom: 12px; }
    .tab {
      padding: 8px 16px;
      background: none;
      border: 1px solid #262626;
      border-radius: 6px;
      color: #a3a3a3;
      cursor: pointer;
      font-size: 13px;
    }
    .tab.active { background: #262626; color: #e5e5e5; }
    @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } .logs-panel { grid-column: span 1; } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>{{.RunID}}<span class="live-indicator" id="live-indicator">LIVE</span></h1>
        <p style="font-family: monospace; font-size: 11px; color: #737373; margin-top: 4px;">{{.RunDir}}</p>
      </div>
      <span id="status-badge" class="badge badge-running">loading...</span>
    </header>

    <div class="grid">
      <div class="panel">
        <div class="panel-title">Run Info</div>
        <div class="info-row"><span class="info-label">Agent</span><span class="info-value" id="agent">-</span></div>
        <div class="info-row"><span class="info-label">Started</span><span class="info-value" id="started">-</span></div>
        <div class="info-row"><span class="info-label">Status</span><span class="info-value" id="status">-</span></div>
        <div class="info-row"><span class="info-label">Duration</span><span class="info-value" id="duration">-</span></div>
      </div>
      <div class="panel">
        <div class="panel-title">Prompt</div>
        <div class="prompt-box" id="prompt">-</div>
      </div>
    </div>

    <div class="grid">
      <div class="panel">
        <div class="panel-title">Events</div>
        <div class="events-list" id="events-list"></div>
      </div>
      <div class="panel logs-panel">
        <div class="panel-title">Logs</div>
        <div class="tabs">
          <button class="tab active" id="tab-stdout" onclick="showLogs('stdout')">stdout</button>
          <button class="tab" id="tab-stderr" onclick="showLogs('stderr')">stderr</button>
        </div>
        <div class="logs-content" id="logs-content"></div>
      </div>
    </div>
  </div>

  <script>
    let currentLogTab = 'stdout';
    let logs = { stdout: '', stderr: '' };

    async function refresh() {
      try {
        const [stateRes, eventsRes, logsRes] = await Promise.all([
          fetch('/api/state'),
          fetch('/api/events'),
          fetch('/api/logs')
        ]);

        const state = await stateRes.json();
        const events = await eventsRes.json();
        logs = await logsRes.json();

        // Update state
        document.getElementById('agent').textContent = state.agent || '-';
        document.getElementById('started').textContent = state.startedAt ? new Date(state.startedAt).toLocaleString() : '-';
        document.getElementById('status').textContent = state.status || '-';
        document.getElementById('prompt').textContent = state.prompt || '-';

        // Update duration
        if (state.durationMs) {
          const d = state.durationMs;
          document.getElementById('duration').textContent = Math.floor(d/60000) + 'm ' + Math.floor((d%60000)/1000) + 's';
        } else if (state.startedAt) {
          const elapsed = Date.now() - new Date(state.startedAt).getTime();
          document.getElementById('duration').textContent = Math.floor(elapsed/60000) + 'm ' + Math.floor((elapsed%60000)/1000) + 's (running)';
        }

        // Update badge
        const badge = document.getElementById('status-badge');
        badge.textContent = state.status || 'unknown';
        badge.className = 'badge badge-' + (state.status || 'running');

        // Update events
        const eventsList = document.getElementById('events-list');
        if (events.length === 0) {
          eventsList.innerHTML = '<div style="color: #737373; padding: 16px;">No events yet</div>';
        } else {
          eventsList.innerHTML = events.slice(-20).reverse().map(e =>
            '<div class="event-item"><span class="event-time">' + new Date(e.timestamp).toLocaleTimeString() + '</span><span class="event-type">' + e.type + '</span><span>' + escapeHtml(e.message) + '</span></div>'
          ).join('');
        }

        // Update logs
        showLogs(currentLogTab);

        // Flash indicator
        const indicator = document.getElementById('live-indicator');
        indicator.style.background = '#22c55e';
        setTimeout(() => indicator.style.background = '#1e40af', 200);

      } catch (err) {
        console.error('Refresh failed:', err);
      }
    }

    function showLogs(tab) {
      currentLogTab = tab;
      document.getElementById('tab-stdout').className = 'tab' + (tab === 'stdout' ? ' active' : '');
      document.getElementById('tab-stderr').className = 'tab' + (tab === 'stderr' ? ' active' : '');
      document.getElementById('logs-content').textContent = logs[tab] || '(empty)';
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    refresh();
    setInterval(refresh, 2000);
  </script>
</body>
</html>`

func init() {
	orchestrateServeLocalCmd.Flags().IntVar(&serveLocalPort, "port", 0, "Port to serve on (default: auto-select starting at 3457)")
	orchestrateServeLocalCmd.Flags().BoolVar(&serveLocalNoBrowser, "no-browser", false, "Don't automatically open browser")
	orchestrateCmd.AddCommand(orchestrateServeLocalCmd)
}
