import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyScanModeByQrToken, logAdminPermissionDenied } from "@/lib/db";
import { enforceSameOrigin, getSessionFromRequest, hasAdminPermission } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().trim().min(20).max(200),
  modeId: z.coerce.number().int().positive(),
});

function normalizeToken(input: string) {
  if (input.startsWith("QRCAPP:")) {
    return input.slice(7);
  }
  return input;
}

export async function POST(request: NextRequest) {
  if (!enforceSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const session = await getSessionFromRequest(request);

  if (!session || !hasAdminPermission(session, "admin.mode.execute")) {
    logAdminPermissionDenied({
      actorId: session?.userId ?? null,
      actorRole: session?.role ?? null,
      actorScope: session?.adminScope ?? null,
      requiredPermission: "admin.mode.execute",
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

  const result = applyScanModeByQrToken({
    actorId: session.userId,
    token: normalizeToken(parsed.data.token),
    modeId: parsed.data.modeId,
  });

  if (!result?.ok || !result.user) {
    if (result?.reason === "outside_schedule") {
      return NextResponse.json(
        {
          error: `Modo fuera de horario. Franja permitida: ${result.startTime} - ${result.endTime}.`,
        },
        { status: 400 },
      );
    }

    if (result?.reason === "daily_limit_exceeded") {
      const available = Math.max(0, result.dailyLimit - result.currentUsed);
      return NextResponse.json(
        {
          error: `Límite diario alcanzado para ${result.itemName}. Límite: ${result.dailyLimit}, usado hoy: ${result.currentUsed}, disponible: ${available}.`,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: "No se pudo aplicar el modo al usuario" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    user: result.user,
    mode: result.mode,
    undoAvailableUntil: result.undoAvailableUntil,
  });
}
