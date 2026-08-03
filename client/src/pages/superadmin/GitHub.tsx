import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../../lib/api";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  LoadingScreen,
  Modal,
  PageHeader,
  StatCard,
  Textarea,
} from "../../components/ui";
import { fmtDateTime } from "../../lib/format";

interface GitHubStatus {
  configured: boolean;
  tokenValid: boolean;
  user: { login: string; name: string | null; avatar_url?: string | null } | null;
  tokenError: string | null;
  targetOwner: string;
  targetRepo: string;
  repo: {
    full_name: string;
    default_branch: string;
    private: boolean;
    html_url: string;
    description: string | null;
    pushed_at: string | null;
  } | null;
  local: { root: string; fileCount: number; commit: { hash: string; subject: string; date: string } | null } | null;
}

interface PushResult {
  ok: boolean;
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
  fileCount: number;
  localCommit: string | null;
  repoUrl: string;
}

function Banner({ tone, children }: { tone: "success" | "error"; children: ReactNode }) {
  return (
    <div
      className={`mb-5 rounded-xl border px-4 py-3 text-sm font-medium ${
        tone === "success"
          ? "border-onion-200 bg-onion-50 text-onion-800"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {children}
    </div>
  );
}

export default function GitHubPage() {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Create-repo form
  const [showCreate, setShowCreate] = useState(false);
  const [repoName, setRepoName] = useState("");
  const [repoDesc, setRepoDesc] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);

  // Push form
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<PushResult | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api<GitHubStatus>("/super-admin/github/status");
      setStatus(data);
      setResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load GitHub status");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createRepo = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      await api("/super-admin/github/create-repo", {
        method: "POST",
        body: { name: repoName.trim(), description: repoDesc.trim(), private: isPrivate },
      });
      setShowCreate(false);
      setRepoName("");
      setRepoDesc("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create repository");
    } finally {
      setBusy(false);
    }
  };

  const push = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api<PushResult>("/super-admin/github/push", {
        method: "POST",
        body: { message: message.trim() },
      });
      setResult(r);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Push failed");
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return <LoadingScreen label="Checking GitHub connection…" />;
  }

  const repoUrl = status.repo?.html_url ?? null;
  const target = `${status.targetOwner}/${status.targetRepo}`;

  return (
    <div>
      <PageHeader
        title="GitHub"
        subtitle="Connect your project to GitHub — create the repository and push this codebase with one click."
        action={
          <Button variant="secondary" onClick={load} disabled={busy}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Refresh
          </Button>
        }
      />

      {error && <Banner tone="error">{error}</Banner>}
      {result && (
        <Banner tone="success">
          Pushed {result.fileCount} files to {result.branch} @ {result.commitSha.slice(0, 7)} —{" "}
          <a href={result.repoUrl} target="_blank" rel="noreferrer" className="underline">
            open on GitHub
          </a>
        </Banner>
      )}

      {!status.configured ? (
        <Card title="Connect your GitHub account" subtitle="One-time setup — add an API key, then come back here.">
          <div className="space-y-4">
            <p className="text-sm text-field-600">
              This integration pushes the repository to <span className="font-semibold text-field-800">{target}</span>{" "}
              using a GitHub personal access token. Add it in the project's{" "}
              <span className="font-semibold text-field-800">Keys / API keys</span> tab, then hit Refresh.
            </p>
            <div className="rounded-xl border border-field-200 bg-field-50/60 p-4 font-mono text-xs text-field-700">
              <p className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-wide text-field-400">
                Required key
              </p>
              <p className="mb-3">GITHUB_TOKEN</p>
              <p className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-wide text-field-400">
                Optional overrides
              </p>
              <p className="mb-3">
                GITHUB_REPO_OWNER (default {status.targetOwner}) · GITHUB_REPO_NAME (default {status.targetRepo})
              </p>
              <p className="text-field-500">
                Create it at github.com/settings/tokens — needs <span className="font-semibold">repo</span> scope
                (full control of private repositories) to push.
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Summary stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Connection"
              value={status.tokenValid ? "Connected" : "Invalid token"}
              tone={status.tokenValid ? "green" : "red"}
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              }
            />
            <StatCard
              label="GitHub user"
              value={status.user?.login ?? "—"}
              tone="slate"
              icon={
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49v-1.7c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.57 2.36 1.12 2.94.85.09-.66.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.36 9.36 0 015 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.31.68.93.68 1.88v2.79c0 .27.18.6.69.49A10.26 10.26 0 0022 12.25C22 6.58 17.52 2 12 2z" />
                </svg>
              }
            />
            <StatCard
              label="Target repo"
              value={target}
              tone={status.repo ? "blue" : "amber"}
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                </svg>
              }
            />
            <StatCard
              label="Local files"
              value={status.local?.fileCount ?? "—"}
              tone="violet"
              icon={
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              }
            />
          </div>

          {status.tokenError && <Banner tone="error">{status.tokenError}</Banner>}

          {/* Repository status + actions */}
          <Card
            title="Repository"
            subtitle={`Target: ${target}`}
            action={
              status.repo ? (
                <a
                  href={status.repo.html_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-field-300 bg-white px-3 py-1.5 text-xs font-semibold text-field-700 transition-colors hover:border-field-400 hover:bg-field-50"
                >
                  Open on GitHub
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              ) : undefined
            }
          >
            {status.repo ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="green">exists</Badge>
                  <span className="font-mono text-xs text-field-600">{status.repo.full_name}</span>
                  <Badge tone={status.repo.private ? "slate" : "blue"}>
                    {status.repo.private ? "private" : "public"}
                  </Badge>
                  <span className="text-xs text-field-400">
                    default branch: <span className="font-mono">{status.repo.default_branch}</span>
                  </span>
                  {status.repo.description && (
                    <span className="text-xs italic text-field-400">“{status.repo.description}”</span>
                  )}
                </div>

                <div className="border-t border-field-100 pt-4">
                  <Field label="Commit message">
                    <Textarea
                      rows={3}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={`chore: sync Onion Facility Center to GitHub — ${new Date().toISOString()}`}
                    />
                  </Field>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button onClick={push} loading={busy}>
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49v-1.7c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.57 2.36 1.12 2.94.85.09-.66.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.28 2.75 1.05a9.36 9.36 0 015 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.31.68.93.68 1.88v2.79c0 .27.18.6.69.49A10.26 10.26 0 0022 12.25C22 6.58 17.52 2 12 2z" />
                      </svg>
                      Push to GitHub
                    </Button>
                    <span className="text-xs text-field-400">
                      Pushes all {status.local?.fileCount ?? 0} tracked files. If the branch already exists, this
                      appends a new commit on top of the remote.
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-field-600">
                  This repository doesn't exist on GitHub yet. Create it now, then push the codebase.
                </p>
                <Button onClick={() => setShowCreate(true)}>Create repository</Button>
              </div>
            )}
          </Card>

          {/* Local state */}
          <Card title="Local codebase" subtitle="What will be pushed">
            {status.local?.commit ? (
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="slate">latest commit</Badge>
                  <span className="font-mono text-xs text-field-700">{status.local.commit.hash.slice(0, 7)}</span>
                  <span className="font-medium text-field-800">{status.local.commit.subject}</span>
                </div>
                <p className="text-xs text-field-400">
                  Committed {fmtDateTime(status.local.commit.date)} · {status.local.fileCount} tracked files
                </p>
              </div>
            ) : (
              <p className="text-sm text-field-500">
                No local commits found yet. Commit your work in the terminal before pushing.
              </p>
            )}
          </Card>
        </div>
      )}

      {/* Create repo modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create GitHub repository">
        <div className="space-y-4">
          <Field label="Repository name" hint={`Will be created under ${status.user?.login ?? "your account"}`}>
            <Input
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder={status.targetRepo}
            />
          </Field>
          <Field label="Description">
            <Input value={repoDesc} onChange={(e) => setRepoDesc(e.target.value)} placeholder="Onion Facility Center" />
          </Field>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-field-700">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="h-4 w-4 rounded border-field-300 text-onion-700 focus:ring-onion-600/20"
            />
            Private repository
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button onClick={createRepo} loading={busy} disabled={!repoName.trim()}>
              Create repository
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
