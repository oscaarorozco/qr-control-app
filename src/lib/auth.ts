import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export const SESSION_COOKIE = "qr_control_session";

export type SessionRole = "admin" | "user";
export type AdminScope = "admin" | "operator";
export type AdminPermission = "admin.read" | "admin.scan" | "admin.manage" | "admin.mode.execute";

export type SessionData = {
  userId: number;
  username: string;
  role: SessionRole;
  adminScope?: AdminScope | null;
};

type SessionPayload = JWTPayload & {
  uid: number;
  username: string;
  role: SessionRole;
  adminScope?: AdminScope | null;
};

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (secret && secret.length >= 32) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    console.warn("JWT_SECRET is missing or weak. Configure a secret with at least 32 characters.");
  }

  return randomBytes(48).toString("hex");
}

const secretKey = new TextEncoder().encode(getJwtSecret());

export async function signSessionToken(data: SessionData) {
  return new SignJWT({
    uid: data.userId,
    username: data.username,
    role: data.role,
    adminScope: data.adminScope ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secretKey);
}

export async function verifySessionToken(token?: string | null): Promise<SessionData | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, secretKey);
    const parsed = payload as SessionPayload;

    if (
      typeof parsed.uid !== "number" ||
      typeof parsed.username !== "string" ||
      (parsed.role !== "admin" && parsed.role !== "user")
    ) {
      return null;
    }

    const rawScope = parsed.adminScope ?? null;
    const adminScope = rawScope === "admin" || rawScope === "operator"
      ? rawScope
      : null;

    return {
      userId: parsed.uid,
      username: parsed.username,
      role: parsed.role,
      adminScope: parsed.role === "admin" ? adminScope ?? "admin" : null,
    };
  } catch {
    return null;
  }
}

export function hasAdminPermission(session: SessionData | null, permission: AdminPermission) {
  if (!session || session.role !== "admin") {
    return false;
  }

  const scope: AdminScope = session.adminScope ?? "admin";
  if (scope === "admin") {
    return true;
  }

  if (scope === "operator") {
    return permission === "admin.mode.execute";
  }

  return false;
}

export async function getSessionFromCookies() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export async function getSessionFromRequest(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function enforceSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  return origin === request.nextUrl.origin;
}
