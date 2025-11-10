export type ParsedGithubPullRequestUrl = {
  owner: string;
  repo: string;
  fullName: string;
  number: number;
  url: string;
};

const GITHUB_HOST_PATTERN = /(^|\.)github\.com$/i;
const GITHUB_PULL_PATH_PATTERN =
  /^\/?([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/i;

const ensureUrlHasProtocol = (value: string): string => {
  if (/^[a-z]+:\/\//i.test(value)) {
    return value;
  }
  return `https://${value}`;
};

const sanitizeRepoSegment = (segment: string): string => {
  return segment.replace(/\.git$/i, "");
};

export const parseGithubPullRequestUrl = (
  value: string,
): ParsedGithubPullRequestUrl | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(ensureUrlHasProtocol(trimmed));
  } catch {
    return null;
  }

  if (!GITHUB_HOST_PATTERN.test(url.hostname)) {
    return null;
  }

  const match = GITHUB_PULL_PATH_PATTERN.exec(url.pathname);
  if (!match) {
    return null;
  }

  const [, owner, repoSegment, prNumber] = match;
  if (!owner || !repoSegment || !prNumber) {
    return null;
  }

  const repo = sanitizeRepoSegment(repoSegment);
  const number = Number.parseInt(prNumber, 10);

  if (!owner || !repo || !Number.isFinite(number)) {
    return null;
  }

  const fullName = `${owner}/${repo}`;
  const normalizedUrl = `https://github.com/${fullName}/pull/${number}`;

  return {
    owner,
    repo,
    fullName,
    number,
    url: normalizedUrl,
  };
};
