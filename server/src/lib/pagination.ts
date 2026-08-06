export interface PageParams {
  /** 1-based page number. */
  page: number;
  pageSize: number;
  limit: number;
  offset: number;
}

/**
 * Parse `page` / `pageSize` query params into a safe limit/offset pair.
 * Defaults to 50 rows per page, capped at `maxPageSize`.
 */
export function parsePage(
  q: Record<string, unknown>,
  defaultPageSize = 50,
  maxPageSize = 200
): PageParams {
  const rawPage = Math.floor(Number(q.page));
  const rawSize = Math.floor(Number(q.pageSize));
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Number.isFinite(rawSize) && rawSize > 0 ? Math.min(rawSize, maxPageSize) : defaultPageSize;
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

/** Response meta added to every paginated list response. */
export function pageMeta(total: number, p: PageParams) {
  return {
    total,
    page: p.page,
    pageSize: p.pageSize,
    totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}
