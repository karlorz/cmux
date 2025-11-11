export type GitHubReference =
  | {
      type: "pull";
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

const GITHUB_HOST_SUFFIX = "github.com";

export function parseGithubReference(input: string | null | undefined): GitHubReference | null {
  if (!input) {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname.endsWith(GITHUB_HOST_SUFFIX)) {
    return null;
  }

  const segments = url.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment));

  if (segments.length < 3) {
    return null;
  }

  const [owner, repo, kind, ...rest] = segments;
  if (!owner || !repo || !kind) {
    return null;
  }

  const fullName = `${owner}/${repo}`;
  if (kind === "pull" || kind === "pulls") {
    if (rest.length === 0) {
      return null;
    }
    const prNumber = Number.parseInt(rest[0], 10);
    if (!Number.isFinite(prNumber) || prNumber <= 0) {
      return null;
    }
    return {
      type: "pull",
      owner,
      repo,
      fullName,
      prNumber,
      url: trimmed,
    };
  }

  if (kind === "tree") {
    if (rest.length === 0) {
      return null;
    }

    const branch = rest.join("/");
    if (!branch) {
      return null;
    }

    return {
      type: "branch",
      owner,
      repo,
      fullName,
      branch,
      url: trimmed,
    };
  }

  return null;
}
