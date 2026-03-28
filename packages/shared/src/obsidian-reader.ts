/**
 * Obsidian Vault Reader Utility
 *
 * Provides utilities for reading and parsing Obsidian vault notes:
 * - Local filesystem reading (for desktop users)
 * - GitHub repository reading (for web users)
 * - TODO extraction from markdown
 * - Frontmatter parsing
 * - Recommendation generation
 *
 * This module is designed to work in both Node.js and browser environments
 * when using the GitHub reader path.
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ============================================================================
// Types
// ============================================================================

export interface ObsidianTodo {
  text: string;
  completed: boolean;
  line: number;
}

export interface ObsidianNote {
  path: string;
  title: string;
  content: string;
  modifiedAt: Date;
  frontmatter: Record<string, unknown>;
  todos: ObsidianTodo[];
  status?: "active" | "archive" | "stale";
}

export interface RecommendedAction {
  type: "todo" | "stale_note" | "missing_docs" | "broken_link";
  source: string;
  description: string;
  priority: "high" | "medium" | "low";
  suggestedPrompt?: string;
}

export interface GitHubVaultOptions {
  owner: string;
  repo: string;
  path: string;
  token: string;
  branch?: string;
}

// ============================================================================
// Frontmatter Parsing
// ============================================================================

/**
 * Parse YAML frontmatter from markdown content.
 * Returns the frontmatter as a Record and the content without frontmatter.
 */
export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterStr = match[1];
  const body = content.slice(match[0].length);
  const frontmatter: Record<string, unknown> = {};

  // Simple YAML key: value parsing
  const lines = frontmatterStr.split("\n");
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      let value: unknown = line.slice(colonIndex + 1).trim();

      // Parse common YAML types
      if (value === "true") value = true;
      else if (value === "false") value = false;
      else if (value === "null" || value === "") value = null;
      else if (!isNaN(Number(value)) && value !== "") value = Number(value);
      // Handle arrays (basic support)
      else if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
        try {
          value = JSON.parse(value);
        } catch {
          // Keep as string if not valid JSON array
        }
      }

      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

// ============================================================================
// TODO Extraction
// ============================================================================

/**
 * Extract TODOs from markdown content.
 * Supports both - [ ] and - [x] patterns.
 */
export function extractTodos(content: string): ObsidianTodo[] {
  const todos: ObsidianTodo[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match - [ ] or - [x] patterns (with optional spaces)
    const uncheckedMatch = line.match(/^[\s]*-\s*\[\s*\]\s*(.+)/);
    const checkedMatch = line.match(/^[\s]*-\s*\[x\]\s*(.+)/i);

    if (uncheckedMatch) {
      todos.push({
        text: uncheckedMatch[1].trim(),
        completed: false,
        line: i + 1,
      });
    } else if (checkedMatch) {
      todos.push({
        text: checkedMatch[1].trim(),
        completed: true,
        line: i + 1,
      });
    }
  }

  return todos;
}

// ============================================================================
// Local Vault Reader
// ============================================================================

/**
 * Check if a path is an Obsidian vault (has .obsidian directory).
 */
export function isObsidianVault(vaultPath: string): boolean {
  const obsidianDir = path.join(vaultPath, ".obsidian");
  return fs.existsSync(obsidianDir);
}

/**
 * Determine note status based on frontmatter and modification time.
 */
function getNoteStatus(
  frontmatter: Record<string, unknown>,
  modifiedAt: Date,
  filePath: string
): "active" | "archive" | "stale" | undefined {
  // Check frontmatter status
  if (frontmatter.status === "archive" || frontmatter.archived === true) {
    return "archive";
  }

  // Check if in archive folder
  const normalizedPath = filePath.toLowerCase();
  if (normalizedPath.includes("/archive/") || normalizedPath.includes("\\archive\\")) {
    return "archive";
  }

  // Check if stale (not modified in 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  if (modifiedAt < thirtyDaysAgo) {
    return "stale";
  }

  return "active";
}

/**
 * Read all markdown notes from a local Obsidian vault.
 * Returns array of parsed notes with frontmatter and TODOs.
 */
export async function readVaultLocal(vaultPath: string): Promise<ObsidianNote[]> {
  if (!fs.existsSync(vaultPath)) {
    throw new Error(`Vault path does not exist: ${vaultPath}`);
  }

  const notes: ObsidianNote[] = [];

  function walkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip hidden directories and .obsidian
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        walkDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const stats = fs.statSync(fullPath);
          const { frontmatter, body } = parseFrontmatter(content);
          const todos = extractTodos(body);
          const relativePath = path.relative(vaultPath, fullPath);
          const modifiedAt = stats.mtime;

          notes.push({
            path: relativePath,
            title: entry.name.replace(/\.md$/, ""),
            content: body,
            modifiedAt,
            frontmatter,
            todos,
            status: getNoteStatus(frontmatter, modifiedAt, relativePath),
          });
        } catch (error) {
          console.error(`[obsidian-reader] Error reading ${fullPath}:`, error);
          // Continue processing other files
        }
      }
    }
  }

  walkDir(vaultPath);
  return notes;
}

// ============================================================================
// GitHub Vault Reader
// ============================================================================

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  url: string;
}

interface GitHubBlobResponse {
  content: string;
  encoding: "base64" | "utf-8";
}

function normalizeVaultPath(vaultPath: string): string {
  return vaultPath.replace(/^\/+|\/+$/g, "");
}

function isWithinVaultPath(filePath: string, vaultPath: string): boolean {
  const normalizedVaultPath = normalizeVaultPath(vaultPath);
  if (!normalizedVaultPath) {
    return true;
  }

  return (
    filePath === normalizedVaultPath ||
    filePath.startsWith(`${normalizedVaultPath}/`)
  );
}

function getRelativeGitHubPath(filePath: string, vaultPath: string): string {
  const normalizedVaultPath = normalizeVaultPath(vaultPath);
  if (!normalizedVaultPath) {
    return filePath;
  }

  return filePath.slice(normalizedVaultPath.length + 1);
}

function normalizeNoteLookupPath(notePath: string): string {
  return notePath
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.md$/i, "");
}

function pickBestResolvedPath(
  candidates: Array<{ path: string; normalizedPath: string }>
): string | null {
  if (candidates.length === 0) {
    return null;
  }

  const [bestCandidate] = [...candidates].sort((left, right) => {
    const leftSegments = left.normalizedPath.split("/").length;
    const rightSegments = right.normalizedPath.split("/").length;
    if (leftSegments !== rightSegments) {
      return leftSegments - rightSegments;
    }

    if (left.path.length !== right.path.length) {
      return left.path.length - right.path.length;
    }

    return left.path.localeCompare(right.path);
  });

  return bestCandidate?.path ?? null;
}

async function fetchGitHubMarkdownFiles(
  options: GitHubVaultOptions
): Promise<GitHubTreeItem[]> {
  const { owner, repo, path: vaultPath, token, branch = "main" } = options;

  const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const treeResponse = await fetch(treeUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
    },
  });

  if (!treeResponse.ok) {
    throw new Error(
      `Failed to fetch GitHub tree: ${treeResponse.status} ${treeResponse.statusText}`
    );
  }

  const treeData = (await treeResponse.json()) as { tree: GitHubTreeItem[] };

  return treeData.tree.filter(
    (item) =>
      item.type === "blob" &&
      item.path.endsWith(".md") &&
      !item.path.includes("/.") &&
      isWithinVaultPath(item.path, vaultPath)
  );
}

export async function listGitHubNotePaths(
  options: GitHubVaultOptions
): Promise<string[]> {
  const markdownFiles = await fetchGitHubMarkdownFiles(options);
  return markdownFiles.map((file) => getRelativeGitHubPath(file.path, options.path));
}

export function resolveGitHubNotePath(
  requestedPath: string,
  notePaths: string[]
): string | null {
  const normalizedRequestedPath = normalizeNoteLookupPath(requestedPath).toLowerCase();
  if (!normalizedRequestedPath) {
    return null;
  }

  const requestedBaseName =
    normalizedRequestedPath.split("/").pop() ?? normalizedRequestedPath;
  const candidates = notePaths.map((notePath) => ({
    path: notePath,
    normalizedPath: normalizeNoteLookupPath(notePath).toLowerCase(),
  }));

  const exactMatch = pickBestResolvedPath(
    candidates.filter(
      (candidate) => candidate.normalizedPath === normalizedRequestedPath
    )
  );
  if (exactMatch) {
    return exactMatch;
  }

  const suffixMatch = pickBestResolvedPath(
    candidates.filter((candidate) =>
      candidate.normalizedPath.endsWith(`/${normalizedRequestedPath}`)
    )
  );
  if (suffixMatch) {
    return suffixMatch;
  }

  return pickBestResolvedPath(
    candidates.filter((candidate) => {
      const candidateBaseName =
        candidate.normalizedPath.split("/").pop() ?? candidate.normalizedPath;
      return candidateBaseName === requestedBaseName;
    })
  );
}

/**
 * Read Obsidian vault notes from a GitHub repository.
 * Useful for web users who store their vault in Git.
 */
export async function readVaultGitHub(options: GitHubVaultOptions): Promise<ObsidianNote[]> {
  const { owner, repo, path: vaultPath, token, branch = "main" } = options;
  const notes: ObsidianNote[] = [];
  const mdFiles = await fetchGitHubMarkdownFiles(options);

  // Fetch content for each file (in parallel with rate limiting)
  const batchSize = 10;
  for (let i = 0; i < mdFiles.length; i += batchSize) {
    const batch = mdFiles.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (file) => {
        try {
          const blobUrl = `https://api.github.com/repos/${owner}/${repo}/git/blobs/${file.sha}`;
          const blobResponse = await fetch(blobUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github.v3+json",
            },
          });

          if (!blobResponse.ok) {
            console.error(`[obsidian-reader] Failed to fetch ${file.path}`);
            return null;
          }

          const blobData = (await blobResponse.json()) as GitHubBlobResponse;
          const content = blobData.encoding === "base64"
            ? Buffer.from(blobData.content, "base64").toString("utf-8")
            : blobData.content;

          const { frontmatter, body } = parseFrontmatter(content);
          const todos = extractTodos(body);
          const relativePath = getRelativeGitHubPath(file.path, vaultPath);
          const fileName = path.basename(file.path);

          // GitHub doesn't give us modification time easily, use current time
          const modifiedAt = new Date();

          return {
            path: relativePath,
            title: fileName.replace(/\.md$/, ""),
            content: body,
            modifiedAt,
            frontmatter,
            todos,
            status: getNoteStatus(frontmatter, modifiedAt, relativePath),
          };
        } catch (error) {
          console.error(`[obsidian-reader] Error fetching ${file.path}:`, error);
          return null;
        }
      })
    );

    notes.push(...batchResults.filter((n): n is NonNullable<typeof n> => n !== null));
  }

  return notes;
}

// ============================================================================
// Recommendation Generation
// ============================================================================

/**
 * Generate recommended actions from analyzed notes.
 * Identifies incomplete TODOs, stale notes, and other actionable items.
 */
export function generateRecommendations(notes: ObsidianNote[]): RecommendedAction[] {
  const recommendations: RecommendedAction[] = [];

  for (const note of notes) {
    // Skip archived notes
    if (note.status === "archive") continue;

    // Extract incomplete TODOs
    const incompleteTodos = note.todos.filter((t) => !t.completed);
    for (const todo of incompleteTodos) {
      // Determine priority based on keywords
      let priority: "high" | "medium" | "low" = "medium";
      const lowerText = todo.text.toLowerCase();
      if (lowerText.includes("urgent") || lowerText.includes("asap") || lowerText.includes("critical")) {
        priority = "high";
      } else if (lowerText.includes("maybe") || lowerText.includes("later") || lowerText.includes("someday")) {
        priority = "low";
      }

      recommendations.push({
        type: "todo",
        source: note.path,
        description: todo.text,
        priority,
        suggestedPrompt: `Complete the following task from ${note.title}: ${todo.text}`,
      });
    }

    // Flag stale notes
    if (note.status === "stale") {
      recommendations.push({
        type: "stale_note",
        source: note.path,
        description: `Note "${note.title}" hasn't been updated in over 30 days`,
        priority: "low",
        suggestedPrompt: `Review and update the note "${note.title}" or archive it if no longer relevant`,
      });
    }

    // Check for broken internal links (basic detection)
    const linkRegex = /\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = linkRegex.exec(note.content)) !== null) {
      const linkedNote = match[1].split("|")[0].trim(); // Handle aliases like [[note|alias]]
      const linkedNotePath = `${linkedNote}.md`;
      const exists = notes.some(
        (n) => n.path === linkedNotePath || n.title.toLowerCase() === linkedNote.toLowerCase()
      );

      if (!exists) {
        recommendations.push({
          type: "broken_link",
          source: note.path,
          description: `Broken link to "${linkedNote}" in ${note.title}`,
          priority: "medium",
          suggestedPrompt: `Fix the broken link to "${linkedNote}" in ${note.title} - either create the note or update the link`,
        });
      }
    }

    // Check for missing documentation patterns
    const frontmatter = note.frontmatter;
    if (
      frontmatter.type === "project" &&
      !frontmatter.status &&
      !note.content.includes("## Status")
    ) {
      recommendations.push({
        type: "missing_docs",
        source: note.path,
        description: `Project note "${note.title}" is missing status information`,
        priority: "medium",
        suggestedPrompt: `Add status tracking to the project note "${note.title}"`,
      });
    }
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return recommendations;
}

// ============================================================================
// Single Note Reader (GitHub)
// ============================================================================

/**
 * Read a single note from a GitHub repository by path.
 * More efficient than reading the entire vault when you only need one note.
 */
export async function readNoteGitHub(
  options: GitHubVaultOptions & { notePath: string }
): Promise<ObsidianNote | null> {
  const { owner, repo, path: vaultPath, token, branch = "main", notePath } = options;

  // Construct full path to the note
  const fullPath = vaultPath ? `${vaultPath}/${notePath}` : notePath;

  // Fetch file content directly using GitHub Contents API
  const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(fullPath)}?ref=${branch}`;

  try {
    const response = await fetch(contentsUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch note: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      content: string;
      encoding: string;
      name: string;
      path: string;
    };

    // Decode content (GitHub returns base64)
    const content =
      data.encoding === "base64"
        ? Buffer.from(data.content, "base64").toString("utf-8")
        : data.content;

    const { frontmatter, body } = parseFrontmatter(content);
    const todos = extractTodos(body);
    const fileName = path.basename(data.name);
    const modifiedAt = new Date(); // GitHub Contents API doesn't easily give modification time

    return {
      path: notePath,
      title: fileName.replace(/\.md$/, ""),
      content: body,
      modifiedAt,
      frontmatter,
      todos,
      status: getNoteStatus(frontmatter, modifiedAt, notePath),
    };
  } catch (error) {
    console.error(`[obsidian-reader] Error fetching note ${notePath}:`, error);
    throw error;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Filter notes by folder path.
 */
export function filterNotesByPath(notes: ObsidianNote[], folderPath: string): ObsidianNote[] {
  const normalizedPath = folderPath.replace(/^\/|\/$/g, "");
  return notes.filter((note) => note.path.startsWith(normalizedPath));
}

/**
 * Get all unique tags from notes.
 */
export function extractAllTags(notes: ObsidianNote[]): string[] {
  const tags = new Set<string>();

  for (const note of notes) {
    // Check frontmatter tags
    const fmTags = note.frontmatter.tags;
    if (Array.isArray(fmTags)) {
      fmTags.forEach((t) => tags.add(String(t)));
    } else if (typeof fmTags === "string") {
      tags.add(fmTags);
    }

    // Check inline tags
    const tagRegex = /#([a-zA-Z0-9_-]+)/g;
    let match;
    while ((match = tagRegex.exec(note.content)) !== null) {
      tags.add(match[1]);
    }
  }

  return Array.from(tags).sort();
}

/**
 * Search notes by content or title.
 */
export function searchNotes(notes: ObsidianNote[], query: string): ObsidianNote[] {
  const lowerQuery = query.toLowerCase();
  return notes.filter(
    (note) =>
      note.title.toLowerCase().includes(lowerQuery) ||
      note.content.toLowerCase().includes(lowerQuery)
  );
}
