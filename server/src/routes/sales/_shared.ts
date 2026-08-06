import { badRequest, forbidden } from "../../lib/errors.js";

/** Company id the caller is scoped to (null for super admin = all). */
export function myCompanyId(req: any): string | null {
  if (req.auth.role === "SUPER_ADMIN") return null;
  return req.auth.companyId;
}

export async function resolveCompanyId(req: any): Promise<string> {
  if (req.auth.role === "SUPER_ADMIN") {
    const cid = req.body?.company_id || req.query.companyId;
    if (!cid) throw badRequest("company_id is required for this operation");
    return cid;
  }
  if (!req.auth.companyId) throw forbidden("No company linked to this account");
  return req.auth.companyId;
}
