import { db } from "../db/index.js";
import { auditLogs } from "../db/schema.js";
import type { Request } from "express";
import { logger } from "./logger.js";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "APPROVE"
  | "REJECT"
  | "COLLECT"
  | "DISTRIBUTE"
  | "LOGIN"
  | "LOGOUT";

interface AuditInput {
  req?: Request;
  userId?: string | null;
  role?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    const ip = input.req?.ip ?? input.req?.socket?.remoteAddress ?? null;
    await db.insert(auditLogs).values({
      user_id: input.userId ?? null,
      user_role: input.role ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      old_values: input.oldValues ? JSON.parse(JSON.stringify(input.oldValues)) : null,
      new_values: input.newValues ? JSON.parse(JSON.stringify(input.newValues)) : null,
      ip_address: ip,
    });
  } catch (err) {
    // Audit must never break the main flow
    logger.error("Audit log failed", { action: input.action, entityType: input.entityType, entityId: input.entityId, error: err instanceof Error ? err.message : String(err) });
  }
}
