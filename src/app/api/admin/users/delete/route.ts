import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteUserFromAdmin, logAdminPermissionDenied } from "@/lib/db";
import { enforceSameOrigin, getSessionFromRequest, hasAdminPermission } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({
  userId: z.coerce.number().int().positive(),
});

export async function POST(request: NextRequest) {
  if (!enforceSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const session = await getSessionFromRequest(request);

  if (!session || !hasAdminPermission(session, "admin.manage")) {
    logAdminPermissionDenied({
      actorId: session?.userId ?? null,
      actorRole: session?.role ?? null,
      actorScope: session?.adminScope ?? null,
      requiredPermission: "admin.manage",
      pathname: request.nextUrl.pathname,
      method: request.method,
      reason: session ? "insufficient_scope" : "missing_session",
    });
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const deleted = deleteUserFromAdmin({
    actorId: session.userId,
    targetUserId: parsed.data.userId,
  });

  if (!deleted) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
