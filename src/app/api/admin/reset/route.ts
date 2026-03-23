import { NextRequest, NextResponse } from "next/server";
import { enforceSameOrigin, getSessionFromRequest, hasAdminPermission } from "@/lib/auth";
import { logAdminPermissionDenied, resetManagedDataFromAdmin } from "@/lib/db";

export const runtime = "nodejs";

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

  const result = resetManagedDataFromAdmin();

  return NextResponse.json({
    ok: true,
    result,
  });
}