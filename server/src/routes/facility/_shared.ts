import { endOfWeek, startOfWeek } from "../../lib/date.js";

/** Week params from query/body (weekStart optional; defaults to current week). */
export function weekParams(q: Record<string, unknown>) {
  const weekStart = q.weekStart ? new Date(String(q.weekStart)) : startOfWeek(new Date());
  return { weekStart, weekEnd: endOfWeek(weekStart) };
}
