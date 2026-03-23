import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createScanModeFromAdmin, listItemTypes, listScanModes, logAdminPermissionDenied, updateScanModeFromAdmin } from "@/lib/db";
import { enforceSameOrigin, getSessionFromRequest, hasAdminPermission } from "@/lib/auth";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  items: z.array(
    z.object({
      itemTypeId: z.coerce.number().int().positive(),
      operation: z.enum(["add", "remove"]),
      quantity: z.coerce.number().int().min(0).max(1000),
    })
  ),
});

const updateSchema = z.object({
  modeId: z.coerce.number().int().positive(),
  name: z.string().trim().min(2).max(60),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  items: z.array(
    z.object({
      itemTypeId: z.coerce.number().int().positive(),
      operation: z.enum(["add", "remove"]),
      quantity: z.coerce.number().int().min(0).max(1000),
    })
  ),
});

export async function GET(request: NextRequest) {
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

  return NextResponse.json({ ok: true, modes: listScanModes() });
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

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const nonZeroItems = parsed.data.items.filter((item) => item.quantity > 0);
  const activeItemTypeIds = new Set(listItemTypes().map((item) => item.id));

  if (nonZeroItems.some((item) => !activeItemTypeIds.has(item.itemTypeId))) {
    return NextResponse.json({ error: "El modo incluye componentes no validos o inactivos" }, { status: 400 });
  }

  if (nonZeroItems.length === 0) {
    return NextResponse.json({ error: "Debes definir al menos una cantidad mayor que 0" }, { status: 400 });
  }

  const created = createScanModeFromAdmin({
    actorId: session.userId,
    name: parsed.data.name,
    startTime: parsed.data.startTime ?? null,
    endTime: parsed.data.endTime ?? null,
    items: nonZeroItems,
  });

  if (!created) {
    return NextResponse.json({ error: "No se pudo crear el modo" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    mode: created,
    modes: listScanModes(),
  });
}

export async function PATCH(request: NextRequest) {
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
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const nonZeroItems = parsed.data.items.filter((item) => item.quantity > 0);
  const activeItemTypeIds = new Set(listItemTypes().map((item) => item.id));

  if (nonZeroItems.some((item) => !activeItemTypeIds.has(item.itemTypeId))) {
    return NextResponse.json({ error: "El modo incluye componentes no validos o inactivos" }, { status: 400 });
  }

  if (nonZeroItems.length === 0) {
    return NextResponse.json({ error: "Debes definir al menos una cantidad mayor que 0" }, { status: 400 });
  }

  const updated = updateScanModeFromAdmin({
    actorId: session.userId,
    modeId: parsed.data.modeId,
    name: parsed.data.name,
    startTime: parsed.data.startTime ?? null,
    endTime: parsed.data.endTime ?? null,
    items: nonZeroItems,
  });

  if (!updated) {
    return NextResponse.json({ error: "No se pudo modificar el modo" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    mode: updated,
    modes: listScanModes(),
  });
}
