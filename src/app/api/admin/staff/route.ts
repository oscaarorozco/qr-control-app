import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceSameOrigin, getSessionFromRequest, hasAdminPermission } from "@/lib/auth";
import { randomBytes } from "node:crypto";
import {
  createPasswordSetupTokenFromAdmin,
  createAdminStaffFromAdmin,
  deleteAdminStaffFromAdmin,
  listAdminStaff,
  logAdminPermissionDenied,
  updateAdminScopeFromAdmin,
} from "@/lib/db";

export const runtime = "nodejs";

const updateSchema = z.object({
  targetAdminId: z.coerce.number().int().positive(),
  scope: z.enum(["admin", "operator"]),
});

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  whatsappPhone: z.string().trim().max(30).optional(),
  scope: z.enum(["admin", "operator"]).default("operator"),
});

const deleteSchema = z.object({
  targetAdminId: z.coerce.number().int().positive(),
});

function normalizeWhatsappPhone(input: string) {
  return input.replace(/\D/g, "");
}

function buildWhatsappLink(phone: string, email: string, setupLink: string, expiresAt: string | null) {
  const text = [
    "Hola,",
    "Se ha creado tu acceso de staff al sistema.",
    `Correo: ${email}`,
    "Define tu contrasena desde este enlace:",
    setupLink,
    expiresAt ? `Caduca: ${expiresAt}` : "",
  ].join("\n");

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function buildMailtoLink(email: string, setupLink: string, expiresAt: string | null) {
  const subject = "Acceso staff al sistema";
  const body = [
    "Hola,",
    "",
    "Se ha creado tu acceso de staff al sistema.",
    `Correo: ${email}`,
    "Abre este enlace para definir tu contrasena:",
    setupLink,
    expiresAt ? `Caduca: ${expiresAt}` : "",
    "",
    "Cuando termines, inicia sesion en la app.",
  ].join("\n");

  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildSetupLink(origin: string, token: string) {
  const url = new URL("/setup-password", origin);
  url.searchParams.set("token", token);
  return url.toString();
}

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

  return NextResponse.json({
    ok: true,
    staff: listAdminStaff(),
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
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const result = updateAdminScopeFromAdmin({
    actorId: session.userId,
    targetAdminId: parsed.data.targetAdminId,
    scope: parsed.data.scope,
  });

  if (!result.ok) {
    if (result.reason === "cannot_change_self") {
      return NextResponse.json({ error: "No puedes cambiar tu propio scope" }, { status: 400 });
    }

    return NextResponse.json({ error: "No se pudo actualizar el scope" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    member: result.member,
    staff: listAdminStaff(),
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
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const randomPassword = randomBytes(32).toString("hex");
  const created = createAdminStaffFromAdmin({
    actorId: session.userId,
    email: parsed.data.email,
    password: randomPassword,
    scope: parsed.data.scope,
  });

  if (!created.ok || !created.member) {
    if (created.reason === "email_exists") {
      return NextResponse.json({ error: "Ya existe una cuenta con ese correo" }, { status: 400 });
    }

    return NextResponse.json({ error: "No se pudo crear la cuenta staff" }, { status: 400 });
  }

  const tokenResult = createPasswordSetupTokenFromAdmin({
    actorId: session.userId,
    targetUserId: created.member.id,
    reason: "staff_create",
    expiresHours: 48,
  });

  if (!tokenResult.ok) {
    return NextResponse.json({ error: "No se pudo generar el enlace de acceso" }, { status: 400 });
  }

  const setupLink = buildSetupLink(request.nextUrl.origin, tokenResult.token);

  return NextResponse.json({
    ok: true,
    member: created.member,
    staff: listAdminStaff(),
    onboarding: {
      setupLink,
      expiresAt: tokenResult.expiresAt,
      mailtoLink: buildMailtoLink(parsed.data.email, setupLink, tokenResult.expiresAt),
      whatsappLink: parsed.data.whatsappPhone
        ? buildWhatsappLink(
            normalizeWhatsappPhone(parsed.data.whatsappPhone),
            parsed.data.email,
            setupLink,
            tokenResult.expiresAt,
          )
        : undefined,
    },
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
  const parsed = deleteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  const result = deleteAdminStaffFromAdmin({
    actorId: session.userId,
    targetAdminId: parsed.data.targetAdminId,
  });

  if (!result.ok) {
    if (result.reason === "cannot_delete_self") {
      return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 400 });
    }
    if (result.reason === "cannot_delete_last_admin") {
      return NextResponse.json({ error: "Debe quedar al menos una cuenta admin" }, { status: 400 });
    }

    return NextResponse.json({ error: "No se pudo eliminar la cuenta staff" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    staff: listAdminStaff(),
  });
}
