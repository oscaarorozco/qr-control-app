import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, hasAdminPermission } from "@/lib/auth";
import { getAdminPermissionDeniedMetrics, logAdminPermissionDenied } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  days: z.coerce.number().int().min(1).max(30).optional(),
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
  const parsed = schema.safeParse({
    days: url.searchParams.get("days") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Parametros invalidos" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    metrics: getAdminPermissionDeniedMetrics(parsed.data.days ?? 7),
  });
}
