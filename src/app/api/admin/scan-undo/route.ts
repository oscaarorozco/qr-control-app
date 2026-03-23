import { NextRequest, NextResponse } from "next/server";
import { enforceSameOrigin, getSessionFromRequest, hasAdminPermission } from "@/lib/auth";
import { getLatestScanUndoForActor, logAdminPermissionDenied, undoLastScanModeApply } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
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

  const pendingUndo = getLatestScanUndoForActor({ actorId: session.userId });

  return NextResponse.json({
    ok: true,
    pendingUndo,
  });
}

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

  const result = undoLastScanModeApply({ actorId: session.userId });

  if (!result.ok || !result.user) {
    const error = result.reason === "target_not_found"
      ? "No se encontro el usuario del ultimo escaneo"
      : "No hay un escaneo reciente para deshacer";
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    user: result.user,
  });
}
