import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionFromRequest, hasAdminPermission } from "@/lib/auth";
import { listRecentAdminActivity, logAdminPermissionDenied } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional(),
  action: z.string().trim().min(1).max(80).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
    limit: url.searchParams.get("limit") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    dateFrom: url.searchParams.get("dateFrom") ?? undefined,
    dateTo: url.searchParams.get("dateTo") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Parametros invalidos" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    items: listRecentAdminActivity({
      limit: parsed.data.limit ?? 8,
      action: parsed.data.action ?? null,
      dateFrom: parsed.data.dateFrom ?? null,
      dateTo: parsed.data.dateTo ?? null,
    }),
  });
}
