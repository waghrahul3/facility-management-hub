import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface AccessTokenPayload {
  sub: string; // user id
  role: string;
  companyId: string | null;
  facilityId: string | null;
  supplierId: string | null;
  toliId: string | null;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string; // refresh token row id
  type: "refresh";
}

export function signAccessToken(payload: Omit<AccessTokenPayload, "type">): string {
  return jwt.sign({ ...payload, type: "access" }, config.jwtAccessSecret, {
    expiresIn: config.accessTokenTtl as jwt.SignOptions["expiresIn"],
  });
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, "type">): string {
  return jwt.sign({ ...payload, type: "refresh" }, config.jwtRefreshSecret, {
    expiresIn: config.refreshTokenTtl as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtAccessSecret) as AccessTokenPayload;
    return decoded.type === "access" ? decoded : null;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtRefreshSecret) as RefreshTokenPayload;
    return decoded.type === "refresh" ? decoded : null;
  } catch {
    return null;
  }
}
