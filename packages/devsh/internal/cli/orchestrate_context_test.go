// internal/cli/orchestrate_context_test.go
package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestGatherGitInfo(t *testing.T) {
	// Use current workspace which should be a git repo
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Failed to get current directory: %v", err)
	}

	// Find git root
	gitRoot := cwd
	for {
		if _, err := os.Stat(filepath.Join(gitRoot, ".git")); err == nil {
			break
		}
		parent := filepath.Dir(gitRoot)
		if parent == gitRoot {
			t.Skip("Not in a git repository")
		}
		gitRoot = parent
	}

	info := gatherGitInfo(gitRoot)

	if info.Branch == "" {
		t.Error("Expected non-empty branch name")
	}

	if info.Commit == "" {
		t.Error("Expected non-empty commit hash")
	}
}

func TestScanRepoStructure(t *testing.T) {
	// Create temp directory with structure
	tmpDir := t.TempDir()

	// Create subdirectories
	os.MkdirAll(filepath.Join(tmpDir, "src"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "tests"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "docs"), 0755)

	// Create files
	os.WriteFile(filepath.Join(tmpDir, "README.md"), []byte("# Test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "src", "main.ts"), []byte("console.log('hi')"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "src", "utils.ts"), []byte("export {}"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "tests", "main.test.ts"), []byte("test()"), 0644)

	structure := scanRepoStructure(tmpDir, 4, false)

	if structure.TotalFiles != 4 {
		t.Errorf("Expected 4 files, got %d", structure.TotalFiles)
	}

	// 4 dirs: root + src + tests + docs
	if structure.TotalDirs < 3 {
		t.Errorf("Expected at least 3 directories, got %d", structure.TotalDirs)
	}

	if len(structure.TopLevelDirs) != 3 {
		t.Errorf("Expected 3 top-level dirs, got %d", len(structure.TopLevelDirs))
	}
}

func TestFindKeyFiles(t *testing.T) {
	tmpDir := t.TempDir()

	// Create key files
	os.WriteFile(filepath.Join(tmpDir, "README.md"), []byte("# Test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "CLAUDE.md"), []byte("Agent instructions"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "package.json"), []byte("{}"), 0644)

	keyFiles := findKeyFiles(tmpDir)

	if len(keyFiles) != 3 {
		t.Errorf("Expected 3 key files, got %d", len(keyFiles))
	}

	// Check that CLAUDE.md is marked as agent type
	found := false
	for _, kf := range keyFiles {
		if kf.Path == "CLAUDE.md" {
			if kf.Type != "agent" {
				t.Errorf("Expected CLAUDE.md to be type 'agent', got '%s'", kf.Type)
			}
			found = true
		}
	}
	if !found {
		t.Error("CLAUDE.md not found in key files")
	}
}

func TestCountLanguages(t *testing.T) {
	tmpDir := t.TempDir()

	// Create files with different extensions
	os.WriteFile(filepath.Join(tmpDir, "main.ts"), []byte("code"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "utils.ts"), []byte("code"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "app.go"), []byte("package main"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "styles.css"), []byte("body{}"), 0644)

	languages := countLanguages(tmpDir, 4)

	if languages["TypeScript"] != 2 {
		t.Errorf("Expected 2 TypeScript files, got %d", languages["TypeScript"])
	}

	if languages["Go"] != 1 {
		t.Errorf("Expected 1 Go file, got %d", languages["Go"])
	}

	if languages["CSS"] != 1 {
		t.Errorf("Expected 1 CSS file, got %d", languages["CSS"])
	}
}

func TestDetectDependencies(t *testing.T) {
	tmpDir := t.TempDir()

	// Create package.json
	pkgJSON := `{
		"name": "test",
		"dependencies": {
			"react": "^18.0.0",
			"typescript": "^5.0.0"
		}
	}`
	os.WriteFile(filepath.Join(tmpDir, "package.json"), []byte(pkgJSON), 0644)

	deps := detectDependencies(tmpDir)

	if len(deps) != 2 {
		t.Errorf("Expected 2 dependencies, got %d", len(deps))
	}
}

func TestGenerateTree(t *testing.T) {
	tmpDir := t.TempDir()

	// Create structure
	os.MkdirAll(filepath.Join(tmpDir, "src"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "README.md"), []byte("# Test"), 0644)
	os.WriteFile(filepath.Join(tmpDir, "src", "main.ts"), []byte("code"), 0644)

	tree := generateTree(tmpDir, 2)

	if tree == "" {
		t.Error("Expected non-empty tree")
	}

	if !contains(tree, "src/") {
		t.Error("Expected tree to contain 'src/'")
	}

	if !contains(tree, "README.md") {
		t.Error("Expected tree to contain 'README.md'")
	}
}

func TestRepoContextJSON(t *testing.T) {
	ctx := &RepoContext{
		Workspace: "/test/workspace",
		GitInfo: &GitInfo{
			Branch: "main",
			Commit: "abc123",
		},
		Structure: &RepoStructure{
			TotalFiles:   10,
			TotalDirs:    3,
			TopLevelDirs: []string{"src", "tests"},
			FilesByType:  map[string]int{".ts": 5, ".go": 2},
		},
		KeyFiles: []KeyFile{
			{Path: "README.md", Type: "readme", SizeBytes: 100},
		},
		Languages:     map[string]int{"TypeScript": 5, "Go": 2},
		TokenEstimate: 500,
	}

	data, err := json.Marshal(ctx)
	if err != nil {
		t.Fatalf("Failed to marshal context: %v", err)
	}

	var decoded RepoContext
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("Failed to unmarshal context: %v", err)
	}

	if decoded.Workspace != ctx.Workspace {
		t.Errorf("Workspace mismatch: got %s, want %s", decoded.Workspace, ctx.Workspace)
	}

	if decoded.GitInfo.Branch != ctx.GitInfo.Branch {
		t.Errorf("Branch mismatch: got %s, want %s", decoded.GitInfo.Branch, ctx.GitInfo.Branch)
	}
}

// contains is defined in agent_setup.go
