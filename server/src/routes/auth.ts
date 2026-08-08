import { Router } from "express";
import type { Request } from "express";
import rateLimit from "express-rate-limit";
import { and, eq, isNull, ne } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { db } from "../db/index.js";
import {
  companies,
  facilities,
  passwordResetTokens,
  refreshTokens,
  suppliers,
  tolis,
  users,
} from "../db/schema.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../auth/jwt.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { audit } from "../lib/audit.js";
import { asyncHandler, badRequest, forbidden, notFound, unauthorized } from "../lib/errors.js";
import { logger, reqLogger } from "../lib/logger.js";
import { config } from "../config.js";
import { passwordResetEmailHtml, sendEmail } from "../services/email.js";

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

// Password-reset request spam: max 3 requests per 10 minutes per IP.
const resetLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: "Too many reset requests. Please try again in 10 minutes.",
  },
});

function validatePassword(password: unknown) {
  if (typeof password !== "string" || password.length < 8) {
    throw badRequest("Password must be at least 8 characters");
  }
}

/**
 * Scope guard for admin-initiated password resets:
 *  - SUPER_ADMIN: any user
 *  - COMPANY_ADMIN: users in their company (directly, or via facility/supplier)
 *  - FACILITY_ADMIN: users in their facility (directly, or via toli/supplier)
 */
async function assertAdminCanReset(
  req: Request,
  target: typeof users.$inferSelect
): Promise<void> {
  const actor = req.auth!;
  if (actor.role === "SUPER_ADMIN") return;

  let targetFacilityId = target.facility_id;
  if (target.toli_id) {
    const [toli] = await db
      .select({ facility_id: tolis.facility_id })
      .from(tolis)
      .where(eq(tolis.id, target.toli_id))
      .limit(1);
    targetFacilityId = toli?.facility_id ?? targetFacilityId;
  } else if (target.supplier_id) {
    const [supplier] = await db
      .select({ facility_id: suppliers.facility_id })
      .from(suppliers)
      .where(eq(suppliers.id, target.supplier_id))
      .limit(1);
    targetFacilityId = supplier?.facility_id ?? targetFacilityId;
  }

  if (actor.role === "FACILITY_ADMIN") {
    if (targetFacilityId && targetFacilityId === actor.facilityId) return;
    throw forbidden("You can only reset passwords for users in your facility");
  }

  // COMPANY_ADMIN
  if (target.company_id && target.company_id === actor.companyId) return;
  if (targetFacilityId) {
    const [facility] = await db
      .select({ company_id: facilities.company_id })
      .from(facilities)
      .where(eq(facilities.id, targetFacilityId))
      .limit(1);
    if (facility?.company_id && facility.company_id === actor.companyId) return;
  }
  throw forbidden("You can only reset passwords for users in your company");
}

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

// PUT /api/auth/profile — a signed-in user edits their own profile.
// name/phone/email live on the users row; suppliers additionally keep
// contact_person/address/city on their supplier record, which is synced here.
router.put(
  "/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = (
      await db.select().from(users).where(eq(users.id, req.auth!.userId)).limit(1)
    )[0];
    if (!user) throw unauthorized("User not found");

    const { name, phone, email, contact_person, address, city } = req.body ?? {};

    // Email changes must stay globally unique (login emails are unique).
    let newEmail: string | null = null;
    if (email !== undefined && email !== null && String(email).toLowerCase() !== user.email) {
      newEmail = String(email).toLowerCase().trim();
      const [existing] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, newEmail), ne(users.id, user.id)))
        .limit(1);
      if (existing) throw badRequest("A user with this email already exists");
    }

    const [updated] = await db
      .update(users)
      .set({
        name: name !== undefined && name !== null && String(name).trim() !== "" ? String(name).trim() : user.name,
        phone: phone !== undefined ? phone : user.phone,
        email: newEmail ?? user.email,
        updated_at: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    // Suppliers: keep the linked supplier record (name/email/phone + extras) in sync.
    if (user.role === "SUPPLIER" && user.supplier_id) {
      await db
        .update(suppliers)
        .set({
          name: updated.name,
          email: newEmail ?? user.email,
          phone: phone !== undefined ? phone : user.phone,
          contact_person: contact_person !== undefined ? contact_person : undefined,
          address: address !== undefined ? address : undefined,
          city: city !== undefined ? city : undefined,
          updated_at: new Date(),
        })
        .where(eq(suppliers.id, user.supplier_id));
    }

    await audit({
      req,
      userId: user.id,
      role: user.role,
      action: "UPDATE",
      entityType: "USER_PROFILE",
      entityId: user.id,
      oldValues: { name: user.name, email: user.email, phone: user.phone },
      newValues: { name: updated.name, email: updated.email, phone: updated.phone },
    });

    return res.json({ user: await buildUserProfile(updated) });
  })
);

// ---------------------------------------------------------------------------
// Password reset & change
// ---------------------------------------------------------------------------

// POST /api/auth/forgot-password — emails a one-time reset link.
// Always responds ok:true so the endpoint can't be used to enumerate accounts.
router.post(
  "/forgot-password",
  resetLimiter,
  asyncHandler(async (req, res) => {
    const { email } = req.body ?? {};
    if (!email || typeof email !== "string") throw badRequest("email is required");
    const log = reqLogger({ method: req.method, path: req.originalUrl });

    const user = (
      await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1)
    )[0];

    if (user) {
      const raw = randomBytes(48).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await db.insert(passwordResetTokens).values({
        user_id: user.id,
        token_hash: hashToken(raw),
        expires_at: expiresAt,
      });
      const link = `${config.appBaseUrl}/reset-password?token=${encodeURIComponent(raw)}`;
      await sendEmail({
        to: user.email,
        subject: "Reset your Onion Facility Center password",
        html: passwordResetEmailHtml(link, user.name),
      });
      log.info("Password reset requested", { userId: user.id });
    } else {
      log.info("Password reset requested for unknown email", { email });
    }

    return res.json({ ok: true });
  })
);

// POST /api/auth/reset-password — exchanges a token for a new password.
router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const { token, password } = req.body ?? {};
    if (!token || typeof token !== "string") throw badRequest("token is required");
    validatePassword(password);

    const row = (
      await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.token_hash, hashToken(token)))
        .limit(1)
    )[0];
    if (!row || row.used_at || row.expires_at < new Date()) {
      throw badRequest("This reset link is invalid or has expired. Please request a new one.");
    }

    const [user] = await db.select().from(users).where(eq(users.id, row.user_id)).limit(1);
    if (!user) throw unauthorized("User not found");

    // Mark token consumed, set the new password, and revoke every session so
    // the user must sign in again with the new password.
    await db
      .update(passwordResetTokens)
      .set({ used_at: new Date() })
      .where(eq(passwordResetTokens.id, row.id));
    await db
      .update(users)
      .set({ password_hash: await hashPassword(password), updated_at: new Date() })
      .where(eq(users.id, user.id));
    await db
      .update(refreshTokens)
      .set({ revoked_at: new Date() })
      .where(eq(refreshTokens.user_id, user.id));

    return res.json({ ok: true });
  })
);

// POST /api/auth/change-password — signed-in user changes their own password.
router.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || typeof currentPassword !== "string") {
      throw badRequest("currentPassword is required");
    }
    validatePassword(newPassword);

    const user = (
      await db.select().from(users).where(eq(users.id, req.auth!.userId)).limit(1)
    )[0];
    if (!user) throw unauthorized("User not found");
    if (!(await verifyPassword(currentPassword, user.password_hash))) {
      throw badRequest("Current password is incorrect");
    }

    await db
      .update(users)
      .set({ password_hash: await hashPassword(newPassword), updated_at: new Date() })
      .where(eq(users.id, user.id));
    // Revoke other sessions — the user stays signed in until their access
    // token expires, then signs in again with the new password.
    await db
      .update(refreshTokens)
      .set({ revoked_at: new Date() })
      .where(and(eq(refreshTokens.user_id, user.id), isNull(refreshTokens.revoked_at)));

    await audit({
      req,
      userId: user.id,
      role: user.role,
      action: "UPDATE",
      entityType: "USER_PASSWORD",
      entityId: user.id,
    });
    return res.json({ ok: true });
  })
);

// POST /api/auth/admin-reset-password — admins reset another user's password.
router.post(
  "/admin-reset-password",
  requireAuth,
  requireRole("SUPER_ADMIN", "COMPANY_ADMIN", "FACILITY_ADMIN"),
  asyncHandler(async (req, res) => {
    const { userId, newPassword } = req.body ?? {};
    if (!userId || typeof userId !== "string") throw badRequest("userId is required");
    validatePassword(newPassword);

    const target = (
      await db.select().from(users).where(eq(users.id, userId)).limit(1)
    )[0];
    if (!target) throw notFound("User not found");

    await assertAdminCanReset(req, target);

    await db
      .update(users)
      .set({ password_hash: await hashPassword(newPassword), updated_at: new Date() })
      .where(eq(users.id, target.id));
    // Force sign-out everywhere: the target must log in with the new password.
    await db
      .update(refreshTokens)
      .set({ revoked_at: new Date() })
      .where(and(eq(refreshTokens.user_id, target.id), isNull(refreshTokens.revoked_at)));

    await audit({
      req,
      userId: req.auth?.userId,
      role: req.auth?.role,
      action: "UPDATE",
      entityType: "USER_PASSWORD",
      entityId: target.id,
      newValues: { targetRole: target.role, resetBy: req.auth?.userId },
    });
    return res.json({ ok: true });
  })
);

export default router;
