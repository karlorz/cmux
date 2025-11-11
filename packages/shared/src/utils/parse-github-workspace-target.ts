export type GithubWorkspaceTarget =
  | {
      type: "pull-request";
      owner: string;
      repo: string;
      fullName: string;
      prNumber: number;
      url: string;
    }
  | {
      type: "branch";
      owner: string;
      repo: string;
      fullName: string;
      branch: string;
      url: string;
    };

const GITHUB_HOST_PATTERN = /(^|\.)github\.com$/i;

const ensureGithubUrl = (value: string): URL | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed);
  const normalized = hasScheme ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(normalized);
    if (!GITHUB_HOST_PATTERN.test(url.hostname)) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
};

const sanitizeRepoSegment = (segment: string): string => {
  const withoutSuffix = segment.replace(/\.git$/i, "");
  return withoutSuffix;
};

export const parseGithubWorkspaceTarget = (
  input: string,
): GithubWorkspaceTarget | null => {
  const url = ensureGithubUrl(input);
  if (!url) return null;

  const segments = url.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length < 2) {
    return null;
  }

  const [owner, repoSegment, ...rest] = segments;
  if (!owner || !repoSegment) return null;

  const repo = sanitizeRepoSegment(repoSegment);
  const fullName = `${owner}/${repo}`;

  if (rest.length < 2) {
    return null;
  }

  const mode = rest[0]?.toLowerCase();
  const identifier = rest[1];
  if (!identifier) {
    return null;
  }

  if (mode === "pull" || mode === "pulls") {
    const numericMatch = identifier.match(/^\d+/);
    if (!numericMatch) {
      return null;
    }
    const prNumber = Number.parseInt(numericMatch[0]!, 10);
    if (!Number.isFinite(prNumber)) {
      return null;
    }
    return {
      type: "pull-request",
      owner,
      repo,
      fullName,
      prNumber,
      url: `https://github.com/${fullName}/pull/${prNumber}`,
    };
  }

  if (mode === "tree") {
    const branchSegment = identifier;
    try {
      const branch = decodeURIComponent(branchSegment);
      if (!branch) {
        return null;
      }
      return {
        type: "branch",
        owner,
        repo,
        fullName,
        branch,
        url: `https://github.com/${fullName}/tree/${encodeURIComponent(branch)}`,
      };
    } catch {
      return null;
    }
  }

  return null;
};

export const normalizeGithubPullRequestUrl = (input: string): string | null => {
  const target = parseGithubWorkspaceTarget(input);
  if (target?.type !== "pull-request") {
    return null;
  }
  return target.url;
};
