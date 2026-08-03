import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

const API = "https://api.github.com";

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function buildHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "onion-facility-center",
    "Content-Type": "application/json",
  };
}

async function gh<T>(
  apiPath: string,
  token: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`${API}${apiPath}`, {
    method: options.method ?? "GET",
    headers: buildHeaders(token),
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text ? text.slice(0, 300) : res.statusText;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed?.message) message = parsed.message;
    } catch {
      /* non-JSON error body */
    }
    throw new GitHubError(res.status, message);
  }
  if (res.status === 204 || !text) return undefined as T;
  return JSON.parse(text) as T;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url?: string | null;
}

export interface GitHubRepoInfo {
  full_name: string;
  default_branch: string;
  private: boolean;
  html_url: string;
  description: string | null;
  pushed_at: string | null;
}

export interface LocalRepoInfo {
  root: string;
  fileCount: number;
  commit: { hash: string; subject: string; date: string } | null;
}

/** Verify the token and return the authenticated GitHub user. */
export async function getTokenUser(token: string): Promise<GitHubUser> {
  return gh<GitHubUser>("/user", token);
}

/** Fetch repo metadata; returns null when the repo does not exist (404). */
export async function getRepo(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubRepoInfo | null> {
  try {
    return await gh<GitHubRepoInfo>(`/repos/${owner}/${repo}`, token);
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return null;
    throw err;
  }
}

/** Create a new repository under the token's account. */
export async function createRepo(
  token: string,
  opts: { name: string; description?: string; private?: boolean }
): Promise<GitHubRepoInfo> {
  return gh<GitHubRepoInfo>("/user/repos", token, {
    method: "POST",
    body: {
      name: opts.name,
      description: opts.description ?? "",
      private: opts.private ?? true,
      auto_init: false,
    },
  });
}

/** Get the ref for a branch, or null when the branch does not exist. */
async function getBranchRef(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<{ ref: string; object: { sha: string } } | null> {
  try {
    return await gh(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, token);
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return null;
    throw err;
  }
}

/** Local git state: tracked files + last commit. Uses local git commands only. */
export async function getLocalRepoInfo(): Promise<LocalRepoInfo> {
  const root = process.cwd();
  const [lsRes, logRes] = await Promise.all([
    execFileAsync("git", ["ls-files", "-c", "-z"], { cwd: root, maxBuffer: 32 * 1024 * 1024 }),
    execFileAsync("git", ["log", "-1", "--format=%H%n%s%n%aI"], {
      cwd: root,
      maxBuffer: 1024 * 1024,
    }).catch(() => null),
  ]);
  const files = lsRes.stdout.split("\0").filter(Boolean);
  let commit: LocalRepoInfo["commit"] = null;
  if (logRes) {
    const [hash, subject, date] = logRes.stdout.trim().split("\n");
    commit = { hash: hash ?? "", subject: subject ?? "", date: date ?? "" };
  }
  return { root, fileCount: files.length, commit };
}

export interface PushResult {
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
  fileCount: number;
  localCommit: string | null;
  repoUrl: string;
}

/**
 * Push the local tracked files to a GitHub repo using the Git Data API.
 * Creates the initial commit if the branch does not exist yet, otherwise
 * appends a commit on top of the remote branch head.
 */
export async function pushToGitHub(
  token: string,
  owner: string,
  repo: string,
  message: string
): Promise<PushResult> {
  const root = process.cwd();

  const [lsRes, logRes] = await Promise.all([
    execFileAsync("git", ["ls-files", "-c", "-z"], { cwd: root, maxBuffer: 32 * 1024 * 1024 }),
    execFileAsync("git", ["log", "-1", "--format=%H%n%s%n%aI"], {
      cwd: root,
      maxBuffer: 1024 * 1024,
    }).catch(() => null),
  ]);
  const files = lsRes.stdout.split("\0").filter(Boolean);
  if (files.length === 0) {
    throw new GitHubError(400, "No tracked files found to push — commit something first.");
  }
  const localCommit = logRes ? logRes.stdout.trim().split("\n")[0] : null;

  const repoInfo = await getRepo(token, owner, repo);
  if (!repoInfo) {
    throw new GitHubError(404, "Repository does not exist on GitHub — create it first.");
  }

  // Upload every tracked file as a blob.
  const blobs: { path: string; mode: string; sha: string }[] = [];
  for (const file of files) {
    const absolute = path.join(root, file);
    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) continue; // empty dirs aren't tracked by git anyway
    const mode = (stat.mode & 0o111) !== 0 ? "100755" : "100644";
    const content = fs.readFileSync(absolute);
    const blob = await gh<{ sha: string }>(`/repos/${owner}/${repo}/git/blobs`, token, {
      method: "POST",
      body: { content: content.toString("base64"), encoding: "base64" },
    });
    blobs.push({ path: file, mode, sha: blob.sha });
  }

  // Decide branch: use the remote default branch when it has commits, else "master".
  let branch = "master";
  let parentCommitSha: string | null = null;
  let baseTreeSha: string | null = null;
  const existingBranch = await getBranchRef(token, owner, repo, repoInfo.default_branch);
  if (existingBranch) {
    branch = repoInfo.default_branch;
    parentCommitSha = existingBranch.object.sha;
    const parentCommit = await gh<{ tree: { sha: string } }>(
      `/repos/${owner}/${repo}/git/commits/${parentCommitSha}`,
      token
    );
    baseTreeSha = parentCommit.tree.sha;
  }

  const tree = await gh<{ sha: string }>(`/repos/${owner}/${repo}/git/trees`, token, {
    method: "POST",
    body: {
      base_tree: baseTreeSha ?? undefined,
      tree: blobs.map((b) => ({ path: b.path, mode: b.mode, type: "blob", sha: b.sha })),
    },
  });

  const newCommit = await gh<{ sha: string }>(`/repos/${owner}/${repo}/git/commits`, token, {
    method: "POST",
    body: {
      message,
      tree: tree.sha,
      parents: parentCommitSha ? [parentCommitSha] : [],
    },
  });

  if (parentCommitSha) {
    await gh(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, {
      method: "PATCH",
      body: { sha: newCommit.sha, force: true },
    });
  } else {
    await gh(`/repos/${owner}/${repo}/git/refs`, token, {
      method: "POST",
      body: { ref: `refs/heads/${branch}`, sha: newCommit.sha },
    });
    // Empty repo defaulting to "main" — make the branch we pushed the default.
    if (repoInfo.default_branch !== branch) {
      await gh(`/repos/${owner}/${repo}`, token, {
        method: "PATCH",
        body: { default_branch: branch },
      }).catch(() => undefined);
    }
  }

  return {
    owner,
    repo,
    branch,
    commitSha: newCommit.sha,
    fileCount: files.length,
    localCommit,
    repoUrl: repoInfo.html_url,
  };
}
