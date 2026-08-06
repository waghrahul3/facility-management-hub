import type { Request } from "express";
import { unauthorized } from "../../lib/errors.js";

// Supplier id is guaranteed by the role check (SUPER_ADMIN has no supplier_id,
// so we also require it explicitly).
export function mySupplierId(req: Request): string {
  if (!req.auth?.supplierId) throw unauthorized("No supplier account linked");
  return req.auth.supplierId;
}
