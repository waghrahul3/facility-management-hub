import "dotenv/config";
import { config as loadLocalEnv } from "dotenv";
// Load Freebuff-managed local secrets (.env.local) on top of .env.
// dotenv never overrides already-set process.env vars, so injected vars (PORT) win.
loadLocalEnv({ path: ".env.local" });

/**
 * Central configuration. Reads environment variables with sensible
 * development fallbacks. The Freebuff sandbox injects PORT at runtime;
 * DATABASE_URL falls back to the local PostgreSQL instance.
 */
export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://onion:onionpass@127.0.0.1:5432/onionfacility",
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-me",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-change-me",
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? "1h",
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL ?? "7d",
  nodeEnv: process.env.NODE_ENV ?? "development",
  // Public base URL used to build password-reset links. In production, set
  // APP_BASE_URL to the real origin; dev falls back to the local Vite origin.
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  // Transactional email (Resend). Without RESEND_API_KEY the app logs the
  // email contents instead, so reset links stay reachable in dev/demo.
  resend: {
    apiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.RESEND_EMAIL_FROM ?? "Onion Facility Center <no-reply@onionfacility.com>",
  },
  // Auto-seed demo data on an empty database. Disable (SEED_DEMO=false) in
  // production so no default credentials are ever created on a hosted DB.
  seedDemo: (process.env.SEED_DEMO ?? "true").toLowerCase() !== "false",
  // GitHub integration (Super Admin push-to-repo). The token is set via the
  // project's Keys/API keys tab (env var GITHUB_TOKEN). Target repo defaults
  // to the project's GitHub home but can be overridden per-request in the UI.
  github: {
    token: process.env.GITHUB_TOKEN ?? "",
    owner: process.env.GITHUB_REPO_OWNER ?? "waghrahul3",
    repo: process.env.GITHUB_REPO_NAME ?? "facility-management-hub",
  },
} as const;
