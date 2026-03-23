import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clearRateLimit, checkRateLimit } from "@/lib/rate-limit";
import { createUser, getUserByUsername, verifyPassword } from "@/lib/db";
import { enforceSameOrigin, setSessionCookie, signSessionToken } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z
  .object({
    email: z.string().trim().toLowerCase().min(3).max(120).optional(),
    username: z.string().trim().toLowerCase().min(3).max(120).optional(),
    password: z.string().min(8).max(128),
  })
  .refine((value) => Boolean(value.email || value.username), {
    message: "email_or_username_required",
  });

function getIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }
  return "unknown";
}

export async function POST(request: NextRequest) {
  if (!enforceSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos de acceso inválidos" }, { status: 400 });
  }

  const identity = (parsed.data.email ?? parsed.data.username ?? "").toLowerCase();
  const key = `${getIp(request)}:${identity}`;
  const limit = checkRateLimit(key);

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Intenta más tarde." },
      { status: 429 },
    );
  }

  const user = getUserByUsername(identity);

  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
  }

  clearRateLimit(key);

  const token = await signSessionToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    adminScope:
      user.role === "admin" && (user.admin_scope === "admin" || user.admin_scope === "operator")
        ? user.admin_scope
        : null,
  });

  const response = NextResponse.json({
    ok: true,
    role: user.role,
    adminScope:
      user.role === "admin" && (user.admin_scope === "admin" || user.admin_scope === "operator")
        ? user.admin_scope
        : null,
  });
  setSessionCookie(response, token);

  return response;
}

// Small helper used in development to quickly seed users if needed.
export async function PUT(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  const identity = (parsed.data.email ?? parsed.data.username ?? "").toLowerCase();
  if (!identity) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  try {
    const user = createUser({
      email: identity,
      password: parsed.data.password,
      assignments: [],
    });

    return NextResponse.json({ ok: true, user });
  } catch {
    return NextResponse.json({ error: "No se pudo crear usuario" }, { status: 400 });
  }
}
