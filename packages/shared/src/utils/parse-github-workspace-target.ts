const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

export type GithubWorkspaceTarget =
  | {
      type: "repo";
      owner: string;
      repo: string;
      fullName: string;
      url: string;
    }
  | {
      type: "branch";
      owner: string;
      repo: string;
      fullName: string;
      branch: string;
      url: string;
    }
  | {
      type: "pull-request";
      owner: string;
      repo: string;
      fullName: string;
      prNumber: number;
      url: string;
    };

const normalizeGithubInput = (input: string): URL | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const hasProtocol = /^[a-zA-Z]+:\/\//.test(trimmed);
  const prefixed = hasProtocol
    ? trimmed
    : trimmed.startsWith("github.com/") || trimmed.startsWith("www.github.com/")
      ? `https://${trimmed}`
      : trimmed;

  try {
    const url = new URL(prefixed);
    if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) return null;
    return url;
  } catch {
    return null;
  }
};

const cleanRepoSegment = (segment: string): string =>
  segment.replace(/\.git$/i, "");

const decodePathSegments = (segments: string[]): string =>
  segments.map((segment) => decodeURIComponent(segment)).join("/");

export const parseGithubWorkspaceTarget = (
  input: string
): GithubWorkspaceTarget | null => {
  const url = normalizeGithubInput(input);
  if (!url) return null;

  const pathSegments = url.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (pathSegments.length < 2) {
    return null;
  }

  const [owner, rawRepo, ...rest] = pathSegments;
  if (!owner || !rawRepo) {
    return null;
  }

  const repo = cleanRepoSegment(rawRepo);
  const fullName = `${owner}/${repo}`;
  const baseUrl = `https://github.com/${fullName}`;

  if (rest.length === 0) {
    return {
      type: "repo",
      owner,
      repo,
      fullName,
      url: baseUrl,
    };
  }

  const directiveSegment = rest[0];
  if (!directiveSegment) {
    return null;
  }
  const directive = directiveSegment.toLowerCase();

  if (directive === "tree" && rest.length >= 2) {
    const branchPath = decodePathSegments(rest.slice(1)).trim();
    if (!branchPath) {
      return null;
    }
    return {
      type: "branch",
      owner,
      repo,
      fullName,
      branch: branchPath,
      url: baseUrl,
    };
  }

  if ((directive === "pull" || directive === "pulls") && rest.length >= 2) {
    const numberSegmentRaw = rest[1];
    if (!numberSegmentRaw) {
      return null;
    }
    const numberSegment = numberSegmentRaw.replace(/[^0-9].*$/, "");
    const prNumber = Number.parseInt(numberSegment, 10);
    if (!Number.isFinite(prNumber) || prNumber <= 0) {
      return null;
    }
    return {
      type: "pull-request",
      owner,
      repo,
      fullName,
      prNumber,
      url: `${baseUrl}/pull/${prNumber}`,
    };
  }

  return null;
};
