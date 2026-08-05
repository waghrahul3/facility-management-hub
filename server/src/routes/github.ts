import { Router } from "express";
import { config } from "../config.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { asyncHandler, badRequest, HttpError } from "../lib/errors.js";
import { logger, reqLogger } from "../lib/logger.js";
import { audit } from "../lib/audit.js";
import {
  GitHubError,
  createRepo,
  getLocalRepoInfo,
  getRepo,
  getTokenUser,
  pushToGitHub,
} from "../lib/github.js";

const router = Router();
router.use(requireAuth, requireRole("SUPER_ADMIN"));

/** Map GitHub API errors to user-facing HTTP errors. */
async function ghCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof GitHubError) {
      throw new HttpError(err.status, `GitHub: ${err.message}`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Connection status: token validity, target repo state, local git state
// ---------------------------------------------------------------------------

router.get(
  "/github/status",
  asyncHandler(async (_req, res) => {
    const log = reqLogger({ method: "GET", path: "/github/status" });
    const token = config.github.token;

    let local: Awaited<ReturnType<typeof getLocalRepoInfo>> | null = null;
    try {
      local = await getLocalRepoInfo();
    } catch (err) {
      log.error("GitHub status: local git check failed", { error: err instanceof Error ? err.message : String(err) });
    }

    const status: Record<string, unknown> = {
      configured: !!token,
      tokenValid: false,
      user: null,
      tokenError: null,
      targetOwner: config.github.owner,
      targetRepo: config.github.repo,
      repo: null,
      local,
    };

    if (!token) {
      return res.json(status);
    }

    try {
      const user = await ghCall(() => getTokenUser(token));
      status.user = user;
      status.tokenValid = true;
      status.repo = await ghCall(() => getRepo(token, config.github.owner, config.github.repo));
    } catch (err) {
      status.tokenError = err instanceof Error ? err.message : "Unknown GitHub error";
    }

    return res.json(status);
  })
);

// ---------------------------------------------------------------------------
// Create the target repository (under the token's account)
// ---------------------------------------------------------------------------

router.post(
  "/github/create-repo",
  asyncHandler(async (req, res) => {
    const token = config.github.token;
    if (!token) throw badRequest("GITHUB_TOKEN is not configured — add it in the Keys tab.");

    const { name = config.github.repo, description, private: isPrivate = true } = req.body ?? {};
    if (!name || typeof name !== "string") throw badRequest("name is required");

    const repo = await ghCall(() =>
      createRepo(token, { name, description: description ?? "", private: isPrivate })
    );

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "GITHUB_REPO",
      entityId: repo.full_name,
      newValues: { full_name: repo.full_name, html_url: repo.html_url },
    });

    return res.status(201).json({ repo });
  })
);

// ---------------------------------------------------------------------------
// Push the local repository (tracked files + latest local commit) to GitHub
// ---------------------------------------------------------------------------

router.post(
  "/github/push",
  asyncHandler(async (req, res) => {
    const token = config.github.token;
    if (!token) throw badRequest("GITHUB_TOKEN is not configured — add it in the Keys tab.");

    const { owner = config.github.owner, repo = config.github.repo, message } = req.body ?? {};
    if (!owner || !repo) throw badRequest("owner and repo are required");

    const commitMessage =
      message ??
      `chore: sync Onion Facility Center to GitHub

Automatic push from the app — ${new Date().toISOString()}`;

    const result = await ghCall(() => pushToGitHub(token, String(owner), String(repo), commitMessage));

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "CREATE",
      entityType: "GITHUB_PUSH",
      entityId: `${owner}/${repo}`,
      newValues: result,
    });

    return res.json({ ok: true, ...result });
  })
);

export default router;
