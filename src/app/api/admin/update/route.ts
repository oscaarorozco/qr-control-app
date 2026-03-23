import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceSameOrigin, getSessionFromRequest, hasAdminPermission } from "@/lib/auth";
import { listItemTypes, logAdminPermissionDenied, updateUserFromAdmin } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  userId: z.coerce.number().int().positive(),
  mode: z.enum(["add", "set"]),
  itemQuantities: z.array(
    z.object({
      itemTypeId: z.coerce.number().int().positive(),
      quantity: z.coerce.number().int().min(0).max(1000),
    })
  ),
  note: z.string().trim().max(300).optional(),
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

  const activeItemTypeIds = new Set(listItemTypes().map((item) => item.id));
  const hasInvalidItemType = parsed.data.itemQuantities.some((entry) => !activeItemTypeIds.has(entry.itemTypeId));

  if (hasInvalidItemType) {
    return NextResponse.json({ error: "Hay componentes no validos o inactivos en la solicitud" }, { status: 400 });
  }

  const user = updateUserFromAdmin({
    actorId: session.userId,
    targetUserId: parsed.data.userId,
    mode: parsed.data.mode,
    itemQuantities: parsed.data.itemQuantities,
    note: parsed.data.note,
  });

  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado o no editable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, user });
}
