import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, clearSession, getStoredUser, setSession } from "./api";
import type { AuthUser, TokenPair } from "./api";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (emailOrPhone: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [loading] = useState(false);

  const login = useCallback(async (emailOrPhone: string, password: string) => {
    const data = await api<{ accessToken: string; refreshToken: string; user: AuthUser }>(
      "/auth/login",
      { method: "POST", body: { emailOrPhone, password }, retry: false }
    );
    setSession(data as TokenPair, data.user);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST", body: {}, retry: false });
    } catch {
      /* ignore */
    }
    clearSession();
    setUser(null);
    window.location.href = "/login";
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
