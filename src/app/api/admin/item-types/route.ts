import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createItemTypeFromAdmin,
  deactivateItemTypeFromAdmin,
  listItemTypes,
  logAdminPermissionDenied,
  renameItemTypeFromAdmin,
  updateItemTypeDailyLimitFromAdmin,
  updateItemTypeImageFromAdmin,
} from "@/lib/db";
import { enforceSameOrigin, getSessionFromRequest, hasAdminPermission } from "@/lib/auth";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().trim().min(2).max(40),
  initialQuantity: z.coerce.number().int().min(0).max(1000).default(0),
  dailyScanLimit: z.coerce.number().int().min(0).max(1000).nullable().optional(),
  imageUrl: z.string().trim().max(2048).nullable().optional(),
});

const updateSchema = z
  .object({
    itemTypeId: z.coerce.number().int().positive(),
    name: z.string().trim().min(2).max(40).optional(),
    dailyScanLimit: z.coerce.number().int().min(0).max(1000).nullable().optional(),
    imageUrl: z.string().trim().max(2048).nullable().optional(),
  })
  .refine((value) => value.name !== undefined || value.dailyScanLimit !== undefined || value.imageUrl !== undefined, {
    message: "name_or_daily_limit_required",
  });

const deactivateSchema = z.object({
  itemTypeId: z.coerce.number().int().positive(),
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

  return NextResponse.json({
    ok: true,
    itemTypes: listItemTypes().map((item) => ({ id: item.id, name: item.name, imageUrl: item.imageUrl, dailyScanLimit: item.dailyScanLimit })),
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

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const created = createItemTypeFromAdmin({
    actorId: session.userId,
    name: parsed.data.name,
    initialQuantity: parsed.data.initialQuantity,
    imageUrl: parsed.data.imageUrl ?? null,
  });

  if (!created) {
    return NextResponse.json({ error: "No se pudo crear el tipo" }, { status: 400 });
  }

  let resolvedItem = created;
  if (parsed.data.dailyScanLimit !== undefined) {
    const updatedLimit = updateItemTypeDailyLimitFromAdmin({
      actorId: session.userId,
      itemTypeId: created.id,
      dailyScanLimit: parsed.data.dailyScanLimit,
    });

    if (updatedLimit) {
      resolvedItem = updatedLimit;
    }
  }

  return NextResponse.json({
    ok: true,
    itemType: { id: resolvedItem.id, name: resolvedItem.name, imageUrl: resolvedItem.imageUrl, dailyScanLimit: resolvedItem.dailyScanLimit },
    itemTypes: listItemTypes().map((item) => ({ id: item.id, name: item.name, imageUrl: item.imageUrl, dailyScanLimit: item.dailyScanLimit })),
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

  let updated = listItemTypes().find((item) => item.id === parsed.data.itemTypeId) ?? null;

  if (parsed.data.name !== undefined) {
    updated = renameItemTypeFromAdmin({
      actorId: session.userId,
      itemTypeId: parsed.data.itemTypeId,
      name: parsed.data.name,
      imageUrl: parsed.data.imageUrl,
    });
  }

  if (updated && parsed.data.name === undefined && parsed.data.imageUrl !== undefined) {
    updated = updateItemTypeImageFromAdmin({
      actorId: session.userId,
      itemTypeId: parsed.data.itemTypeId,
      imageUrl: parsed.data.imageUrl,
    });
  }

  if (updated && parsed.data.dailyScanLimit !== undefined) {
    updated = updateItemTypeDailyLimitFromAdmin({
      actorId: session.userId,
      itemTypeId: parsed.data.itemTypeId,
      dailyScanLimit: parsed.data.dailyScanLimit,
    });
  }

  if (!updated) {
    return NextResponse.json({ error: "No se pudo actualizar el componente" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    itemType: { id: updated.id, name: updated.name, imageUrl: updated.imageUrl, dailyScanLimit: updated.dailyScanLimit },
    itemTypes: listItemTypes().map((item) => ({ id: item.id, name: item.name, imageUrl: item.imageUrl, dailyScanLimit: item.dailyScanLimit })),
  });
}

export async function DELETE(request: NextRequest) {
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
  const parsed = deactivateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const result = deactivateItemTypeFromAdmin({
    actorId: session.userId,
    itemTypeId: parsed.data.itemTypeId,
  });

  if (!result.ok) {
    if (result.reason === "cannot_deactivate_last_item") {
      return NextResponse.json({ error: "Debe quedar al menos un componente activo" }, { status: 400 });
    }

    return NextResponse.json({ error: "Componente no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    itemTypes: listItemTypes().map((item) => ({ id: item.id, name: item.name, imageUrl: item.imageUrl, dailyScanLimit: item.dailyScanLimit })),
  });
}
