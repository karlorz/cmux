package cli

import (
	"strings"
	"testing"
)

func TestSanitizeFileName(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "simple filename",
			input:    "image.png",
			expected: "image.png",
		},
		{
			name:     "spaces replaced with underscores",
			input:    "my image file.png",
			expected: "my_image_file.png",
		},
		{
			name:     "special characters stripped",
			input:    "file!@#$%^&().png",
			expected: "file_.png",
		},
		{
			name:     "unicode characters replaced",
			input:    "日本語ファイル.png",
			expected: "_.png",
		},
		{
			name:     "preserves hyphens and underscores",
			input:    "my-file_name.jpg",
			expected: "my-file_name.jpg",
		},
		{
			name:     "collapses multiple underscores",
			input:    "a   b   c.png",
			expected: "a_b_c.png",
		},
		{
			name:     "empty becomes image",
			input:    "",
			expected: "image",
		},
		{
			name:     "dot becomes image",
			input:    ".",
			expected: "image",
		},
		{
			name:     "dotdot becomes image",
			input:    "..",
			expected: "image",
		},
		{
			name:     "only special chars collapses to underscore",
			input:    "!!!",
			expected: "_",
		},
		{
			name:     "long filename gets truncated preserving extension",
			input:    strings.Repeat("a", 200) + ".png",
			expected: strings.Repeat("a", 124) + ".png",
		},
		{
			name:     "long filename without extension",
			input:    strings.Repeat("b", 200),
			expected: strings.Repeat("b", 128),
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := sanitizeFileName(tc.input)
			if result != tc.expected {
				t.Errorf("sanitizeFileName(%q) = %q, expected %q", tc.input, result, tc.expected)
			}
		})
	}
}
