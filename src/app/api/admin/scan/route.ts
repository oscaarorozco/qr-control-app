import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, hasAdminPermission } from "@/lib/auth";
import { getUserByQrToken, logAdminPermissionDenied } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().trim().min(20).max(200),
});

function normalizeToken(input: string) {
  if (input.startsWith("QRCAPP:")) {
    return input.slice(7);
  }
  return input;
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);

  if (!session || !hasAdminPermission(session, "admin.read")) {
    logAdminPermissionDenied({
      actorId: session?.userId ?? null,
      actorRole: session?.role ?? null,
      actorScope: session?.adminScope ?? null,
      requiredPermission: "admin.read",
      pathname: request.nextUrl.pathname,
      method: request.method,
      reason: session ? "insufficient_scope" : "missing_session",
    });
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Token QR inválido" }, { status: 400 });
  }

  const token = normalizeToken(parsed.data.token);
  const user = getUserByQrToken(token);

  if (!user || user.role !== "user") {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, user });
}
