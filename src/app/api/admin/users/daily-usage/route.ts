import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, hasAdminPermission } from "@/lib/auth";
import { getUserDailyUsageForTodayByAdmin, logAdminPermissionDenied } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  userId: z.coerce.number().int().positive(),
});

export async function GET(request: NextRequest) {
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

  const url = new URL(request.url);
  const parsed = schema.safeParse({ userId: url.searchParams.get("userId") ?? undefined });

  if (!parsed.success) {
    return NextResponse.json({ error: "Parametros invalidos" }, { status: 400 });
  }

  const usage = getUserDailyUsageForTodayByAdmin({ userId: parsed.data.userId });

  if (!usage) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    usage,
  });
}
