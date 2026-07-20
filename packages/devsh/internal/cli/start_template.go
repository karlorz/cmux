package cli

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// StartTemplate is a local YAML recipe expanded into start flags.
// Path: ~/.cmux/templates/<name>.yaml (or absolute path).
type StartTemplate struct {
	Name     string `yaml:"name"`
	Provider string `yaml:"provider"`
	Snapshot string `yaml:"snapshot"`
	Clean    *bool  `yaml:"clean"`
	// MirrorLocal can be bool true or a map with options.
	MirrorLocal any `yaml:"mirror_local"`
	NoAuth      *bool `yaml:"no_auth"`
}

// StartTemplateFlags is the resolved flag state after template + CLI merge.
type StartTemplateFlags struct {
	Provider    string
	Snapshot    string
	Clean       bool
	MirrorLocal bool
	NoAuth      bool
}

// LoadStartTemplate loads a template by name (under ~/.cmux/templates/) or absolute path.
func LoadStartTemplate(nameOrPath string) (*StartTemplate, error) {
	path, err := ResolveTemplatePath(nameOrPath)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read template %s: %w", path, err)
	}
	var tmpl StartTemplate
	if err := yaml.Unmarshal(data, &tmpl); err != nil {
		return nil, fmt.Errorf("parse template %s: %w", path, err)
	}
	return &tmpl, nil
}

// ResolveTemplatePath maps a template name or path to an absolute file path.
func ResolveTemplatePath(nameOrPath string) (string, error) {
	nameOrPath = strings.TrimSpace(nameOrPath)
	if nameOrPath == "" {
		return "", fmt.Errorf("template name is empty")
	}
	// Absolute or explicit relative path with separator / extension.
	if strings.HasPrefix(nameOrPath, "/") ||
		strings.HasPrefix(nameOrPath, "./") ||
		strings.HasPrefix(nameOrPath, "../") ||
		strings.HasSuffix(nameOrPath, ".yaml") ||
		strings.HasSuffix(nameOrPath, ".yml") {
		abs, err := filepath.Abs(nameOrPath)
		if err != nil {
			return "", err
		}
		if _, err := os.Stat(abs); err != nil {
			return "", fmt.Errorf("template file not found: %s", abs)
		}
		return abs, nil
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home for templates: %w", err)
	}
	base := filepath.Join(home, ".cmux", "templates")
	candidates := []string{
		filepath.Join(base, nameOrPath+".yaml"),
		filepath.Join(base, nameOrPath+".yml"),
		filepath.Join(base, nameOrPath),
	}
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c, nil
		}
	}
	return "", fmt.Errorf("template %q not found under %s (tried .yaml/.yml)", nameOrPath, base)
}

// ExpandStartTemplate applies template defaults then lets explicit CLI flags win.
// cliSet maps flag name → whether the user explicitly set it on the command line.
func ExpandStartTemplate(tmpl *StartTemplate, cli StartTemplateFlags, cliSet map[string]bool) StartTemplateFlags {
	out := cli
	if tmpl == nil {
		return out
	}

	if !cliSet["provider"] && tmpl.Provider != "" {
		out.Provider = tmpl.Provider
	}
	if !cliSet["snapshot"] && tmpl.Snapshot != "" {
		out.Snapshot = tmpl.Snapshot
	}
	if !cliSet["clean"] && tmpl.Clean != nil {
		out.Clean = *tmpl.Clean
	}
	if !cliSet["no-auth"] && tmpl.NoAuth != nil {
		out.NoAuth = *tmpl.NoAuth
	}
	if !cliSet["mirror-local"] {
		out.MirrorLocal = templateMirrorLocalEnabled(tmpl.MirrorLocal)
	}
	return out
}

func templateMirrorLocalEnabled(v any) bool {
	switch t := v.(type) {
	case nil:
		return false
	case bool:
		return t
	case map[string]any:
		// Presence of a map means mirror-local is enabled; secrets: false is default.
		return true
	case map[any]any:
		return true
	default:
		// yaml may decode as map[string]interface{} already handled;
		// also accept non-empty string "true"
		if s, ok := v.(string); ok {
			return strings.EqualFold(s, "true") || s == "1"
		}
		return false
	}
}

// TemplatesDir returns ~/.cmux/templates (for docs/tests).
func TemplatesDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".cmux", "templates"), nil
}
