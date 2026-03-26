// internal/cli/orchestrate_context.go
package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/spf13/cobra"
)

// RepoContext represents a summarized view of a repository for agent context
type RepoContext struct {
	Workspace     string            `json:"workspace"`
	GitInfo       *GitInfo          `json:"gitInfo,omitempty"`
	Structure     *RepoStructure    `json:"structure"`
	KeyFiles      []KeyFile         `json:"keyFiles"`
	Languages     map[string]int    `json:"languages"`
	Dependencies  []string          `json:"dependencies,omitempty"`
	Summary       string            `json:"summary"`
	TokenEstimate int               `json:"tokenEstimate"`
}

// GitInfo contains git repository information
type GitInfo struct {
	Branch        string `json:"branch"`
	Commit        string `json:"commit"`
	Remote        string `json:"remote,omitempty"`
	HasUncommitted bool   `json:"hasUncommitted"`
}

// RepoStructure represents the directory structure summary
type RepoStructure struct {
	TotalFiles   int               `json:"totalFiles"`
	TotalDirs    int               `json:"totalDirs"`
	TopLevelDirs []string          `json:"topLevelDirs"`
	FilesByType  map[string]int    `json:"filesByType"`
	Tree         string            `json:"tree,omitempty"`
}

// KeyFile represents an important file in the repository
type KeyFile struct {
	Path        string `json:"path"`
	Type        string `json:"type"` // "config", "entry", "readme", "agent", "test", "schema"
	Description string `json:"description,omitempty"`
	SizeBytes   int64  `json:"sizeBytes"`
}

var (
	contextWorkspace  string
	contextMaxDepth   int
	contextIncludeTree bool
	contextOutput     string
)

var orchestrateContextCmd = &cobra.Command{
	Use:   "context-pack",
	Short: "Generate repository context for agent consumption",
	Long: `Generate a summarized view of the repository structure and key files.

This command creates a bounded context package that agents can use to understand
the codebase without loading excessive content into their context window.

Output includes:
  - Git status (branch, commit, remote)
  - Directory structure summary
  - Key files (configs, entry points, READMEs, agent instructions)
  - Language breakdown by file count
  - Detected dependencies
  - Token estimate for the context

Examples:
  devsh orchestrate context-pack
  devsh orchestrate context-pack --workspace ./my-repo
  devsh orchestrate context-pack --max-depth 3 --include-tree
  devsh orchestrate context-pack --output context.json`,
	RunE: runContextPack,
}

func init() {
	orchestrateCmd.AddCommand(orchestrateContextCmd)

	orchestrateContextCmd.Flags().StringVarP(&contextWorkspace, "workspace", "w", "", "Workspace directory (default: current directory)")
	orchestrateContextCmd.Flags().IntVar(&contextMaxDepth, "max-depth", 4, "Maximum directory depth to scan")
	orchestrateContextCmd.Flags().BoolVar(&contextIncludeTree, "include-tree", false, "Include ASCII tree representation")
	orchestrateContextCmd.Flags().StringVarP(&contextOutput, "output", "o", "", "Output file path (default: stdout)")
}

func runContextPack(cmd *cobra.Command, args []string) error {
	workspace := contextWorkspace
	if workspace == "" {
		var err error
		workspace, err = os.Getwd()
		if err != nil {
			return fmt.Errorf("failed to get current directory: %w", err)
		}
	}

	absWorkspace, err := filepath.Abs(workspace)
	if err != nil {
		return fmt.Errorf("failed to resolve workspace path: %w", err)
	}

	// Verify workspace exists
	if _, err := os.Stat(absWorkspace); os.IsNotExist(err) {
		return fmt.Errorf("workspace does not exist: %s", absWorkspace)
	}

	ctx := &RepoContext{
		Workspace:  absWorkspace,
		Languages:  make(map[string]int),
		KeyFiles:   []KeyFile{},
	}

	// Gather git info
	ctx.GitInfo = gatherGitInfo(absWorkspace)

	// Scan repository structure
	ctx.Structure = scanRepoStructure(absWorkspace, contextMaxDepth, contextIncludeTree)

	// Find key files
	ctx.KeyFiles = findKeyFiles(absWorkspace)

	// Count languages
	ctx.Languages = countLanguages(absWorkspace, contextMaxDepth)

	// Detect dependencies
	ctx.Dependencies = detectDependencies(absWorkspace)

	// Generate summary
	ctx.Summary = generateContextSummary(ctx)

	// Estimate tokens (rough: ~4 chars per token)
	summaryJSON, _ := json.Marshal(ctx)
	ctx.TokenEstimate = len(summaryJSON) / 4

	// Output
	if flagJSON {
		output, err := json.MarshalIndent(ctx, "", "  ")
		if err != nil {
			return fmt.Errorf("failed to marshal context: %w", err)
		}
		if contextOutput != "" {
			return os.WriteFile(contextOutput, output, 0644)
		}
		fmt.Println(string(output))
	} else {
		printContextSummary(ctx)
		if contextOutput != "" {
			output, _ := json.MarshalIndent(ctx, "", "  ")
			return os.WriteFile(contextOutput, output, 0644)
		}
	}

	return nil
}

func gatherGitInfo(workspace string) *GitInfo {
	info := &GitInfo{}

	// Get current branch
	if out, err := runGitCommand(workspace, "rev-parse", "--abbrev-ref", "HEAD"); err == nil {
		info.Branch = strings.TrimSpace(out)
	}

	// Get current commit
	if out, err := runGitCommand(workspace, "rev-parse", "--short", "HEAD"); err == nil {
		info.Commit = strings.TrimSpace(out)
	}

	// Get remote URL
	if out, err := runGitCommand(workspace, "remote", "get-url", "origin"); err == nil {
		info.Remote = strings.TrimSpace(out)
	}

	// Check for uncommitted changes
	if out, err := runGitCommand(workspace, "status", "--porcelain"); err == nil {
		info.HasUncommitted = strings.TrimSpace(out) != ""
	}

	return info
}

func runGitCommand(workspace string, args ...string) (string, error) {
	cmd := exec.Command("git", args...)
	cmd.Dir = workspace
	out, err := cmd.Output()
	return string(out), err
}

func scanRepoStructure(workspace string, maxDepth int, includeTree bool) *RepoStructure {
	structure := &RepoStructure{
		TopLevelDirs: []string{},
		FilesByType:  make(map[string]int),
	}

	// Get top-level directories
	entries, err := os.ReadDir(workspace)
	if err == nil {
		for _, entry := range entries {
			if entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") && entry.Name() != "node_modules" && entry.Name() != "vendor" {
				structure.TopLevelDirs = append(structure.TopLevelDirs, entry.Name())
			}
		}
	}

	// Count files and directories
	filepath.Walk(workspace, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		relPath, _ := filepath.Rel(workspace, path)
		depth := len(strings.Split(relPath, string(filepath.Separator)))

		// Skip hidden, node_modules, vendor, and deep paths
		if strings.HasPrefix(filepath.Base(path), ".") ||
			strings.Contains(path, "node_modules") ||
			strings.Contains(path, "vendor") ||
			strings.Contains(path, ".git") ||
			depth > maxDepth {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		if info.IsDir() {
			structure.TotalDirs++
		} else {
			structure.TotalFiles++
			ext := strings.ToLower(filepath.Ext(path))
			if ext != "" {
				structure.FilesByType[ext]++
			}
		}

		return nil
	})

	// Generate tree if requested
	if includeTree {
		structure.Tree = generateTree(workspace, maxDepth)
	}

	return structure
}

func generateTree(workspace string, maxDepth int) string {
	var sb strings.Builder
	sb.WriteString(filepath.Base(workspace) + "/\n")
	generateTreeRecursive(&sb, workspace, "", 0, maxDepth)
	return sb.String()
}

func generateTreeRecursive(sb *strings.Builder, path, prefix string, depth, maxDepth int) {
	if depth >= maxDepth {
		return
	}

	entries, err := os.ReadDir(path)
	if err != nil {
		return
	}

	// Filter and sort entries
	var filtered []os.DirEntry
	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, ".") || name == "node_modules" || name == "vendor" {
			continue
		}
		filtered = append(filtered, entry)
	}

	for i, entry := range filtered {
		isLast := i == len(filtered)-1
		connector := "├── "
		if isLast {
			connector = "└── "
		}

		sb.WriteString(prefix + connector + entry.Name())
		if entry.IsDir() {
			sb.WriteString("/")
		}
		sb.WriteString("\n")

		if entry.IsDir() {
			newPrefix := prefix + "│   "
			if isLast {
				newPrefix = prefix + "    "
			}
			generateTreeRecursive(sb, filepath.Join(path, entry.Name()), newPrefix, depth+1, maxDepth)
		}
	}
}

func findKeyFiles(workspace string) []KeyFile {
	keyFiles := []KeyFile{}

	// Key file patterns
	patterns := map[string]struct {
		fileType    string
		description string
	}{
		"README.md":        {"readme", "Project documentation"},
		"README":           {"readme", "Project documentation"},
		"CLAUDE.md":        {"agent", "Claude Code agent instructions"},
		"AGENTS.md":        {"agent", "Multi-agent instructions"},
		"CODEX.md":         {"agent", "Codex agent instructions"},
		"package.json":     {"config", "Node.js project configuration"},
		"go.mod":           {"config", "Go module definition"},
		"Cargo.toml":       {"config", "Rust project configuration"},
		"pyproject.toml":   {"config", "Python project configuration"},
		"requirements.txt": {"config", "Python dependencies"},
		"Makefile":         {"config", "Build configuration"},
		"Dockerfile":       {"config", "Container definition"},
		"docker-compose.yml": {"config", "Docker Compose configuration"},
		".env.example":     {"config", "Environment template"},
		"tsconfig.json":    {"config", "TypeScript configuration"},
		"schema.ts":        {"schema", "Schema definition"},
		"schema.prisma":    {"schema", "Prisma schema"},
		"convex/schema.ts": {"schema", "Convex schema"},
	}

	for filename, meta := range patterns {
		fullPath := filepath.Join(workspace, filename)
		if info, err := os.Stat(fullPath); err == nil {
			keyFiles = append(keyFiles, KeyFile{
				Path:        filename,
				Type:        meta.fileType,
				Description: meta.description,
				SizeBytes:   info.Size(),
			})
		}
	}

	// Also check for entry points in common locations
	entryPoints := []string{
		"src/index.ts", "src/index.js", "src/main.ts", "src/main.js",
		"index.ts", "index.js", "main.ts", "main.js", "main.go", "cmd/main.go",
		"app/page.tsx", "pages/index.tsx", "app.ts", "app.js",
	}

	for _, entry := range entryPoints {
		fullPath := filepath.Join(workspace, entry)
		if info, err := os.Stat(fullPath); err == nil {
			keyFiles = append(keyFiles, KeyFile{
				Path:        entry,
				Type:        "entry",
				Description: "Application entry point",
				SizeBytes:   info.Size(),
			})
		}
	}

	// Sort by type then path
	sort.Slice(keyFiles, func(i, j int) bool {
		if keyFiles[i].Type != keyFiles[j].Type {
			return keyFiles[i].Type < keyFiles[j].Type
		}
		return keyFiles[i].Path < keyFiles[j].Path
	})

	return keyFiles
}

func countLanguages(workspace string, maxDepth int) map[string]int {
	languages := make(map[string]int)

	extToLang := map[string]string{
		".ts":    "TypeScript",
		".tsx":   "TypeScript",
		".js":    "JavaScript",
		".jsx":   "JavaScript",
		".go":    "Go",
		".rs":    "Rust",
		".py":    "Python",
		".rb":    "Ruby",
		".java":  "Java",
		".kt":    "Kotlin",
		".swift": "Swift",
		".c":     "C",
		".cpp":   "C++",
		".h":     "C/C++",
		".cs":    "C#",
		".php":   "PHP",
		".sh":    "Shell",
		".bash":  "Shell",
		".zsh":   "Shell",
		".md":    "Markdown",
		".json":  "JSON",
		".yaml":  "YAML",
		".yml":   "YAML",
		".toml":  "TOML",
		".sql":   "SQL",
		".css":   "CSS",
		".scss":  "SCSS",
		".html":  "HTML",
	}

	filepath.Walk(workspace, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		relPath, _ := filepath.Rel(workspace, path)
		depth := len(strings.Split(relPath, string(filepath.Separator)))

		if strings.HasPrefix(filepath.Base(path), ".") ||
			strings.Contains(path, "node_modules") ||
			strings.Contains(path, "vendor") ||
			strings.Contains(path, ".git") ||
			depth > maxDepth {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		if !info.IsDir() {
			ext := strings.ToLower(filepath.Ext(path))
			if lang, ok := extToLang[ext]; ok {
				languages[lang]++
			}
		}

		return nil
	})

	return languages
}

func detectDependencies(workspace string) []string {
	deps := []string{}

	// Check package.json
	if data, err := os.ReadFile(filepath.Join(workspace, "package.json")); err == nil {
		var pkg map[string]interface{}
		if json.Unmarshal(data, &pkg) == nil {
			if d, ok := pkg["dependencies"].(map[string]interface{}); ok {
				for name := range d {
					deps = append(deps, name)
				}
			}
		}
	}

	// Limit to top 20
	sort.Strings(deps)
	if len(deps) > 20 {
		deps = deps[:20]
		deps = append(deps, fmt.Sprintf("... and %d more", len(deps)-20))
	}

	return deps
}

func generateContextSummary(ctx *RepoContext) string {
	var sb strings.Builder

	// Project identification
	if ctx.GitInfo != nil && ctx.GitInfo.Remote != "" {
		sb.WriteString(fmt.Sprintf("Repository: %s\n", ctx.GitInfo.Remote))
	}
	sb.WriteString(fmt.Sprintf("Workspace: %s\n", ctx.Workspace))

	if ctx.GitInfo != nil {
		sb.WriteString(fmt.Sprintf("Branch: %s @ %s", ctx.GitInfo.Branch, ctx.GitInfo.Commit))
		if ctx.GitInfo.HasUncommitted {
			sb.WriteString(" (uncommitted changes)")
		}
		sb.WriteString("\n")
	}

	// Structure summary
	sb.WriteString(fmt.Sprintf("\nStructure: %d files in %d directories\n", ctx.Structure.TotalFiles, ctx.Structure.TotalDirs))
	sb.WriteString(fmt.Sprintf("Top-level: %s\n", strings.Join(ctx.Structure.TopLevelDirs, ", ")))

	// Languages
	if len(ctx.Languages) > 0 {
		sb.WriteString("\nLanguages: ")
		langs := []string{}
		for lang, count := range ctx.Languages {
			langs = append(langs, fmt.Sprintf("%s(%d)", lang, count))
		}
		sort.Slice(langs, func(i, j int) bool {
			return langs[i] > langs[j]
		})
		if len(langs) > 5 {
			langs = langs[:5]
		}
		sb.WriteString(strings.Join(langs, ", "))
		sb.WriteString("\n")
	}

	// Key files
	if len(ctx.KeyFiles) > 0 {
		sb.WriteString("\nKey files:\n")
		for _, kf := range ctx.KeyFiles {
			sb.WriteString(fmt.Sprintf("  - %s (%s)\n", kf.Path, kf.Type))
		}
	}

	return sb.String()
}

func printContextSummary(ctx *RepoContext) {
	fmt.Println("Repository Context Pack")
	fmt.Println("=======================")
	fmt.Println()
	fmt.Print(ctx.Summary)
	fmt.Println()
	fmt.Printf("Token estimate: ~%d tokens\n", ctx.TokenEstimate)
}
