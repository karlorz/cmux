import { parseGithubRepoUrl } from "./parse-github-repo-url";

type BaseTarget = {
  owner: string;
  repo: string;
  fullName: string;
  url: string;
  gitUrl: string;
};

export type ParsedGithubTarget =
  | (BaseTarget & { type: "repo" })
  | (BaseTarget & { type: "branch"; branch: string })
  | (BaseTarget & {
      type: "pull";
      pullRequestNumber: number;
      pullRequestUrl: string;
    });

const buildBaseTarget = (owner: string, repo: string): BaseTarget => {
  const cleanRepo = repo.replace(/\.git$/i, "");
  const fullName = `${owner}/${cleanRepo}`;
  const baseUrl = `https://github.com/${fullName}`;
  return {
    owner,
    repo: cleanRepo,
    fullName,
    url: baseUrl,
    gitUrl: `${baseUrl}.git`,
  };
};

const normalizeGithubUrl = (input: string): URL | null => {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const hasProtocol = /^[a-z]+:\/\//i.test(trimmed);
  const candidate = hasProtocol ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (hostname !== "github.com") {
      return null;
    }
    return url;
  } catch {
    return null;
  }
};

export const parseGithubTarget = (
  input: string
): ParsedGithubTarget | null => {
  if (!input) return null;

  const repoOnly = parseGithubRepoUrl(input);
  if (repoOnly) {
    return {
      ...repoOnly,
      type: "repo",
    };
  }

  const url = normalizeGithubUrl(input);
  if (!url) {
    return null;
  }

  const pathnameSegments = url.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });

  if (pathnameSegments.length < 2) {
    return null;
  }

  const owner = pathnameSegments[0]!;
  const repoSegment = pathnameSegments[1]!;

  if (
    !/^[A-Za-z0-9._-]+$/.test(owner) ||
    !/^[A-Za-z0-9._-]+(?:\.git)?$/i.test(repoSegment)
  ) {
    return null;
  }

  const baseTarget = buildBaseTarget(owner, repoSegment);

  if (pathnameSegments.length >= 4) {
    const indicator = pathnameSegments[2]!.toLowerCase();
    if (indicator === "pull" || indicator === "pulls") {
      const prSegment = pathnameSegments[3]!;
      const pullRequestNumber = Number(prSegment);
      if (Number.isFinite(pullRequestNumber) && pullRequestNumber > 0) {
        return {
          ...baseTarget,
          type: "pull",
          pullRequestNumber,
          pullRequestUrl: `${baseTarget.url}/pull/${pullRequestNumber}`,
        };
      }
    }
    if (indicator === "tree") {
      const branchSegments = pathnameSegments.slice(3);
      if (branchSegments.length > 0) {
        const branch = branchSegments.join("/");
        if (branch.trim().length > 0) {
          return {
            ...baseTarget,
            type: "branch",
            branch,
          };
        }
      }
    }
  }

  return {
    ...baseTarget,
    type: "repo",
  };
};
