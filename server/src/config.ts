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
  // Auto-seed demo data on an empty database. Disable (SEED_DEMO=false) in
  // production so no default credentials are ever created on a hosted DB.
  seedDemo: (process.env.SEED_DEMO ?? "true").toLowerCase() !== "false",
} as const;
