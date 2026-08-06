import { Router } from "express";
import rateLimit from "express-rate-limit";
import { and, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { db } from "../db/index.js";
import { companies, facilities, refreshTokens, suppliers, tolis, users } from "../db/schema.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../auth/jwt.js";
import { verifyPassword } from "../auth/password.js";
import { requireAuth } from "../auth/middleware.js";
import { audit } from "../lib/audit.js";
import { asyncHandler, badRequest, unauthorized } from "../lib/errors.js";
import { logger, reqLogger } from "../lib/logger.js";

const router = Router();

// Brute-force protection: max 5 login attempts per 15 minutes per IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many login attempts. Please try again in 15 minutes.",
  },
});

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function buildUserProfile(user: typeof users.$inferSelect) {
  let companyName: string | null = null;
  let facilityName: string | null = null;
  let supplierName: string | null = null;
  let toliName: string | null = null;

  if (user.company_id) {
    const c = (
      await db.select().from(companies).where(eq(companies.id, user.company_id)).limit(1)
    )[0];
    companyName = c?.name ?? null;
  }
  if (user.facility_id) {
    const f = (
      await db.select().from(facilities).where(eq(facilities.id, user.facility_id)).limit(1)
    )[0];
    facilityName = f?.name ?? null;
  }
  if (user.supplier_id) {
    const s = (
      await db.select().from(suppliers).where(eq(suppliers.id, user.supplier_id)).limit(1)
    )[0];
    supplierName = s?.name ?? null;
  }
  if (user.toli_id) {
    const t = (
      await db.select().from(tolis).where(eq(tolis.id, user.toli_id)).limit(1)
    )[0];
    toliName = t?.leader_name ?? null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    companyId: user.company_id,
    companyName,
    facilityId: user.facility_id,
    facilityName,
    supplierId: user.supplier_id,
    supplierName,
    toliId: user.toli_id,
    toliName,
  };
}

async function issueTokens(user: typeof users.$inferSelect) {
  // Create refresh token row
  const rawRefresh = randomBytes(48).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  const [row] = await db
    .insert(refreshTokens)
    .values({
      user_id: user.id,
      token_hash: hashToken(rawRefresh),
      expires_at: expiresAt,
    })
    .returning();

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    companyId: user.company_id,
    facilityId: user.facility_id,
    supplierId: user.supplier_id,
    toliId: user.toli_id,
  });
  const refreshToken = signRefreshToken({ sub: user.id, jti: row.id });

  return { accessToken, refreshToken };
}

// POST /api/auth/login
router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { emailOrPhone, password } = req.body ?? {};
    const log = reqLogger({ method: req.method, path: req.originalUrl });
    log.info("Login attempt", { emailOrPhone });
    if (!emailOrPhone || !password) {
      throw badRequest("emailOrPhone and password are required");
    }

    const user = (
      await db
        .select()
        .from(users)
        .where(
          // Login with email OR phone
          emailOrPhone.includes("@")
            ? eq(users.email, emailOrPhone.toLowerCase())
            : eq(users.phone ?? "", emailOrPhone)
        )
        .limit(1)
    )[0];

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      log.warn("Login failed: invalid credentials", { emailOrPhone });
      throw unauthorized("Invalid credentials");
    }

    const { accessToken, refreshToken } = await issueTokens(user);
    await audit({
      req,
      userId: user.id,
      role: user.role,
      action: "LOGIN",
      entityType: "USER",
      entityId: user.id,
    });

    log.info("Login successful", { userId: user.id, role: user.role });
    return res.json({
      accessToken,
      refreshToken,
      user: await buildUserProfile(user),
    });
  })
);

// POST /api/auth/refresh-token
router.post(
  "/refresh-token",
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken) throw badRequest("refreshToken is required");

    const log = reqLogger({ method: req.method, path: req.originalUrl });
    log.info("Token refresh attempt");
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      log.warn("Token refresh failed: invalid token");
      throw unauthorized("Invalid refresh token");
    }

    const stored = (
      await db
        .select()
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.id, payload.jti),
            eq(refreshTokens.token_hash, hashToken(refreshToken)),
            isNull(refreshTokens.revoked_at)
          )
        )
        .limit(1)
    )[0];

    if (!stored || stored.expires_at < new Date()) {
      log.warn("Token refresh failed: expired or revoked");
      throw unauthorized("Refresh token expired or revoked");
    }

    const user = (
      await db.select().from(users).where(eq(users.id, stored.user_id)).limit(1)
    )[0];
    if (!user) throw unauthorized("User not found");

    // Revoke old, issue new pair
    await db
      .update(refreshTokens)
      .set({ revoked_at: new Date() })
      .where(eq(refreshTokens.id, stored.id));

    log.info("Token refresh successful", { userId: user.id });
    const tokens = await issueTokens(user);
    return res.json({ ...tokens, user: await buildUserProfile(user) });
  })
);

// POST /api/auth/logout
router.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body ?? {};
    if (refreshToken) {
      const payload = verifyRefreshToken(refreshToken);
      if (payload) {
        await db
          .update(refreshTokens)
          .set({ revoked_at: new Date() })
          .where(eq(refreshTokens.id, payload.jti));
      }
    }
    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "LOGOUT",
      entityType: "USER",
      entityId: req.auth?.userId,
    });
    return res.json({ ok: true });
  })
);

// GET /api/auth/me
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = (
      await db.select().from(users).where(eq(users.id, req.auth!.userId)).limit(1)
    )[0];
    if (!user) throw unauthorized("User not found");
    return res.json({ user: await buildUserProfile(user) });
  })
);

export default router;
