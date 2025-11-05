export type ParsedGithubRepo = {
  repoFullName: string;
  repoUrl: string;
};

const OWNER_SEGMENT_REGEX = /^[A-Za-z0-9_.-]+$/;
const REPO_SEGMENT_REGEX = /^[A-Za-z0-9_.-]+$/;

const GITHUB_HOST_SUFFIX = "github.com";

const SSH_PREFIX = "git@github.com:";

const normalizeSegment = (segment: string | undefined): string | null => {
  if (!segment) {
    return null;
  }
  const stripped = segment.replace(/\.git$/i, "").trim();
  if (!stripped) {
    return null;
  }
  return stripped;
};

const sanitizeOwner = (input: string | null): string | null => {
  if (!input) {
    return null;
  }
  const normalized = normalizeSegment(input);
  if (!normalized) {
    return null;
  }
  return OWNER_SEGMENT_REGEX.test(normalized) ? normalized : null;
};

const sanitizeRepo = (input: string | null): string | null => {
  if (!input) {
    return null;
  }
  const normalized = normalizeSegment(input);
  if (!normalized) {
    return null;
  }
  const repoCandidate = normalized.replace(/[#?].*$/, "");
  return REPO_SEGMENT_REGEX.test(repoCandidate) ? repoCandidate : null;
};

function extractOwnerRepoFromUrl(input: string): { owner: string; repo: string } | null {
  let working = input.trim();
  if (!working) {
    return null;
  }

  if (working.startsWith(SSH_PREFIX)) {
    working = `https://${GITHUB_HOST_SUFFIX}/${working.slice(SSH_PREFIX.length)}`;
  }

  if (working.startsWith("github.com/")) {
    working = `https://${working}`;
  }

  if (working.startsWith("http://") || working.startsWith("https://")) {
    try {
      const url = new URL(working);
      if (!url.hostname.toLowerCase().endsWith(GITHUB_HOST_SUFFIX)) {
        return null;
      }
      const segments = url.pathname.replace(/^\/+/, "").split("/");
      const owner = sanitizeOwner(segments[0]);
      const repo = sanitizeRepo(segments[1]);
      if (!owner || !repo) {
        return null;
      }
      return { owner, repo };
    } catch {
      return null;
    }
  }

  const parts = working.replace(/^\/+/, "").split("/");
  if (parts.length < 2) {
    return null;
  }
  const owner = sanitizeOwner(parts[0]);
  const repo = sanitizeRepo(parts[1]);
  if (!owner || !repo) {
    return null;
  }
  return { owner, repo };
}

export function parseGithubRepoInput(input: string): ParsedGithubRepo | null {
  const result = extractOwnerRepoFromUrl(input);
  if (!result) {
    return null;
  }
  const repoFullName = `${result.owner}/${result.repo}`;
  return {
    repoFullName,
    repoUrl: `https://${GITHUB_HOST_SUFFIX}/${repoFullName}.git`,
  };
}
