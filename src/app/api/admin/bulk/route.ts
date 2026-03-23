import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceSameOrigin, getSessionFromRequest, hasAdminPermission } from "@/lib/auth";
import { applyGlobalTicketDelta, listItemTypes, logAdminPermissionDenied } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  itemTypeId: z.coerce.number().int().positive(),
  mode: z.enum(["add", "set"]),
  quantity: z.coerce.number().int().min(0).max(1000).default(0),
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
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  if (parsed.data.mode === "add" && parsed.data.quantity === 0) {
    return NextResponse.json({ error: "Debes indicar una cantidad mayor que 0 para sumar" }, { status: 400 });
  }

  const activeItemTypeIds = new Set(listItemTypes().map((item) => item.id));
  if (!activeItemTypeIds.has(parsed.data.itemTypeId)) {
    return NextResponse.json({ error: "El componente seleccionado no existe o ya no esta activo" }, { status: 400 });
  }

  const result = applyGlobalTicketDelta({
    actorId: session.userId,
    itemTypeId: parsed.data.itemTypeId,
    mode: parsed.data.mode,
    quantity: parsed.data.quantity,
  });

  if (!result) {
    return NextResponse.json({ error: "No se pudo aplicar el ajuste global" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, updatedUsers: result.updatedUsers });
}
