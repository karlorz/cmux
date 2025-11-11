export type GithubUrlTarget =
  | {
      type: "pull-request";
      owner: string;
      repo: string;
      projectFullName: string;
      pullNumber: number;
      url: string;
    }
  | {
      type: "branch";
      owner: string;
      repo: string;
      projectFullName: string;
      branch: string;
      url: string;
    };

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

export function parseGithubUrlTarget(
  rawInput: string | null | undefined
): GithubUrlTarget | null {
  if (!rawInput) return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (!GITHUB_HOSTS.has(hostname)) {
    return null;
  }

  const segments = url.pathname.split("/").filter((segment) => segment.length);
  if (segments.length < 3) {
    return null;
  }

  const [owner, repo, kind, ...rest] = segments;
  if (!owner || !repo || !kind) {
    return null;
  }

  const projectFullName = `${owner}/${repo}`;

  if (kind === "pull" || kind === "pulls") {
    const numberSegment = rest[0];
    if (!numberSegment) return null;
    const pullNumber = Number.parseInt(numberSegment, 10);
    if (!Number.isFinite(pullNumber) || pullNumber <= 0) {
      return null;
    }
    return {
      type: "pull-request",
      owner,
      repo,
      projectFullName,
      pullNumber,
      url: trimmed,
    };
  }

  if (kind === "tree") {
    if (rest.length === 0) return null;
    const branchPath = rest.join("/");
    try {
      const decoded = decodeURIComponent(branchPath);
      const branch = decoded.trim();
      if (!branch) {
        return null;
      }
      return {
        type: "branch",
        owner,
        repo,
        projectFullName,
        branch,
        url: trimmed,
      };
    } catch {
      return null;
    }
  }

  return null;
}
