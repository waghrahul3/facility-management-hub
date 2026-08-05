export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "FACILITY_ADMIN" | "TOLI_LEADER" | "SUPPLIER";
  companyId: string | null;
  companyName: string | null;
  facilityId: string | null;
  facilityName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  toliId: string | null;
  toliName: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const ACCESS_KEY = "ofc_access";
const REFRESH_KEY = "ofc_refresh";
const USER_KEY = "ofc_user";

let accessToken: string | null = localStorage.getItem(ACCESS_KEY);
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY);
let user: AuthUser | null = readUser();

function readUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function getAccessToken() {
  return accessToken;
}

export function getStoredUser(): AuthUser | null {
  return user;
}

export function setSession(pair: TokenPair, u: AuthUser) {
  accessToken = pair.accessToken;
  refreshToken = pair.refreshToken;
  user = u;
  localStorage.setItem(ACCESS_KEY, pair.accessToken);
  localStorage.setItem(REFRESH_KEY, pair.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(u));
}

export function clearSession() {
  accessToken = null;
  refreshToken = null;
  user = null;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch("/api/auth/refresh-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setSession(data, data.user as AuthUser);
    return true;
  } catch {
    return false;
  }
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; retry?: boolean } = {}
): Promise<T> {
  const { method = "GET", body, retry = true } = options;

  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch();

  if (res.status === 401 && retry) {
    const ok = await refreshAccessToken();
    if (ok) {
      res = await doFetch();
    } else {
      clearSession();
      window.location.href = "/login";
      throw new ApiError(401, "Session expired");
    }
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const post = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body });
export const put = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "PUT", body });
export const del = <T = unknown>(path: string) => api<T>(path, { method: "DELETE" });

// --- Report download helpers ---

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadReport(type: string, format: "excel" | "pdf", filters?: Record<string, string>) {
  const params = new URLSearchParams();
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v);
    }
  }
  const qs = params.toString();
  const path = `/reports/${type}/${format}${qs ? "?" + qs : ""}`;
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { headers });
  if (!res.ok) throw new ApiError(res.status, `Download failed (${res.status})`);
  const blob = await res.blob();
  const ext = format === "excel" ? "xlsx" : "pdf";
  downloadBlob(blob, `${type}-report.${ext}`);
}
