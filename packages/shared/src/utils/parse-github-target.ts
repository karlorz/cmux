export type GitHubWorkspaceTarget =
  | {
      type: "pull-request";
      owner: string;
      repo: string;
      fullName: string;
      number: number;
      url: string;
      label: string;
      source: string;
    }
  | {
      type: "branch";
      owner: string;
      repo: string;
      fullName: string;
      branch: string;
      url: string;
      label: string;
      source: string;
    }
  | {
      type: "repo";
      owner: string;
      repo: string;
      fullName: string;
      url: string;
      label: string;
      source: string;
    };

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

const normalizeGithubInput = (input: string): string => {
  let trimmed = input.trim();
  if (!trimmed) return "";

  if (/^github\.com\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  } else if (/^www\.github\.com\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  } else if (/^git@github\.com:/i.test(trimmed)) {
    trimmed = `https://${trimmed.replace(/^git@github\.com:/i, "github.com/")}`;
  }

  return trimmed;
};

const stripGitSuffix = (value: string): string =>
  value.toLowerCase().endsWith(".git") ? value.slice(0, -4) : value;

const parseGithubUrl = (value: string): URL | null => {
  try {
    const candidate = new URL(value);
    if (!GITHUB_HOSTS.has(candidate.hostname.toLowerCase())) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
};

export const parseGithubWorkspaceTarget = (
  input: string
): GitHubWorkspaceTarget | null => {
  if (!input) {
    return null;
  }

  const normalized = normalizeGithubInput(input);
  if (!normalized) {
    return null;
  }

  const url = parseGithubUrl(normalized);
  if (!url) {
    return null;
  }

  const segments = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (segments.length < 2) {
    return null;
  }

  const owner = decodeURIComponent(segments[0] ?? "");
  const repoSegment = segments[1] ?? "";
  const repo = stripGitSuffix(decodeURIComponent(repoSegment));
  if (!owner || !repo) {
    return null;
  }

  const fullName = `${owner}/${repo}`;
  const canonicalRepoUrl = `https://github.com/${fullName}`;
  const baseTarget = {
    owner,
    repo,
    fullName,
    source: input.trim(),
  };

  const actionSegment = segments[2]?.toLowerCase();

  if (actionSegment === "pull" && segments[3]) {
    const prNumber = Number(segments[3]);
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      return null;
    }
    const prUrl = `${canonicalRepoUrl}/pull/${prNumber}`;
    return {
      type: "pull-request",
      ...baseTarget,
      number: prNumber,
      url: prUrl,
      label: `PR #${prNumber}`,
    };
  }

  if (actionSegment === "tree" && segments.length >= 4) {
    const branchPath = segments.slice(3).map(decodeURIComponent).join("/");
    if (branchPath.length === 0) {
      return null;
    }
    return {
      type: "branch",
      ...baseTarget,
      branch: branchPath,
      url: `${canonicalRepoUrl}/tree/${encodeURIComponent(branchPath).replace(
        /%2F/gi,
        "/"
      )}`,
      label: branchPath,
    };
  }

  return {
    type: "repo",
    ...baseTarget,
    url: canonicalRepoUrl,
    label: fullName,
  };
};
