import type { Request } from "express";

/**
 * Express 5 types route params as `string | string[] | undefined`.
 * This helper safely extracts a single string value.
 */
export function param(req: Request, name: string): string {
  const v = req.params[name];
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}
