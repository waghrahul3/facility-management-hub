import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "./jwt.js";

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
 * For facility-scoped routes: ensures a FACILITY_ADMIN can only access
 * their own facility (Super Admin may pass any facility id).
 */
export function requireFacilityAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: "Not authenticated" });
  const raw = req.params.facilityId;
  const facilityId = Array.isArray(raw) ? raw[0] : raw;
  if (!facilityId) return res.status(400).json({ error: "Missing facility id" });
  if (req.auth.role === "SUPER_ADMIN") return next();
  if (req.auth.role === "FACILITY_ADMIN" && req.auth.facilityId === facilityId) {
    return next();
  }
  return res.status(403).json({ error: "Access to this facility is not allowed" });
}
