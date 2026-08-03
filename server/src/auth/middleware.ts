import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { verifyAccessToken } from "./jwt.js";
import { db } from "../db/index.js";
import { facilities } from "../db/schema.js";

export type Role =
  | "SUPER_ADMIN"
  | "COMPANY_ADMIN"
  | "FACILITY_ADMIN"
  | "TOLI_LEADER"
  | "SUPPLIER";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: Role;
        companyId: string | null;
        facilityId: string | null;
        supplierId: string | null;
        toliId: string | null;
      };
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  const token = header.slice("Bearer ".length);
  const payload = verifyAccessToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  req.auth = {
    userId: payload.sub,
    role: payload.role as Role,
    companyId: payload.companyId ?? null,
    facilityId: payload.facilityId,
    supplierId: payload.supplierId,
    toliId: payload.toliId,
  };
  next();
}

/** Restrict route to one or more roles. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

/**
 * For company-scoped routes: ensures a COMPANY_ADMIN can only access
 * their own company (Super Admin may pass any company id).
 */
export function requireCompanyAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: "Not authenticated" });
  const raw = req.params.companyId;
  const companyId = Array.isArray(raw) ? raw[0] : raw;
  if (!companyId) return res.status(400).json({ error: "Missing company id" });
  if (req.auth.role === "SUPER_ADMIN") return next();
  if (req.auth.role === "COMPANY_ADMIN" && req.auth.companyId === companyId) {
    return next();
  }
  return res.status(403).json({ error: "Access to this company is not allowed" });
}

/**
 * For facility-scoped routes. Authorizes:
 *  - SUPER_ADMIN: any facility
 *  - FACILITY_ADMIN: their own facility
 *  - COMPANY_ADMIN: any facility owned by their company
 */
export async function requireFacilityAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: "Not authenticated" });
  const raw = req.params.facilityId;
  const facilityId = Array.isArray(raw) ? raw[0] : raw;
  if (!facilityId) return res.status(400).json({ error: "Missing facility id" });

  const deny = () => res.status(403).json({ error: "Access to this facility is not allowed" });

  if (req.auth.role === "SUPER_ADMIN") return next();
  if (req.auth.role === "FACILITY_ADMIN") {
    return req.auth.facilityId === facilityId ? next() : deny();
  }
  if (req.auth.role === "COMPANY_ADMIN" && req.auth.companyId) {
    try {
      const [facility] = await db
        .select({ company_id: facilities.company_id })
        .from(facilities)
        .where(eq(facilities.id, facilityId))
        .limit(1);
      if (facility && facility.company_id === req.auth.companyId) return next();
    } catch (err) {
      return next(err);
    }
    return deny();
  }
  return deny();
}
