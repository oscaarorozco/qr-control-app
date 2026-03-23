import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import {
  createPasswordSetupTokenFromAdmin,
  createUser,
  getAdminSummary,
  listItemTypes,
  listManagedUsers,
  logAdminPermissionDenied,
} from "@/lib/db";
import { enforceSameOrigin, getSessionFromRequest, hasAdminPermission } from "@/lib/auth";

export const runtime = "nodejs";

function buildMailtoLink(email: string, setupLink: string, expiresAt: string | null) {
  const subject = "Acceso inicial al sistema";
  const body = [
    "Hola,",
    "",
    "Se ha creado tu acceso al sistema.",
    `Correo: ${email}`,
    "Abre este enlace para definir tu contrasena:",
    setupLink,
    expiresAt ? `Caduca: ${expiresAt}` : "",
    "",
    "Cuando termines, inicia sesion en la app.",
  ].join("\n");

  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function normalizeWhatsappPhone(input: string) {
  return input.replace(/\D/g, "");
}

function buildWhatsappLink(phone: string, email: string, setupLink: string, expiresAt: string | null) {
  const text = [
    "Hola,",
    "Se ha creado tu acceso al sistema.",
    `Correo: ${email}`,
    "Define tu contrasena desde este enlace:",
    setupLink,
    expiresAt ? `Caduca: ${expiresAt}` : "",
  ].join("\n");

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function buildSetupLink(origin: string, token: string) {
  const url = new URL("/setup-password", origin);
  url.searchParams.set("token", token);
  return url.toString();
}

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(120),
  whatsappPhone: z.string().trim().max(30).optional(),
  assignments: z
    .array(
      z.object({
        itemTypeId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().min(0).max(1000),
      })
    )
    .optional(),
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
    users: listManagedUsers(),
    summary: getAdminSummary(),
    itemTypes: listItemTypes().map((item) => ({
      id: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      dailyScanLimit: item.dailyScanLimit,
    })),
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
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const activeItemTypeIds = new Set(listItemTypes().map((item) => item.id));
  const hasInvalidAssignment = (parsed.data.assignments ?? []).some((assignment) => !activeItemTypeIds.has(assignment.itemTypeId));

  if (hasInvalidAssignment) {
    return NextResponse.json({ error: "Hay componentes no validos o inactivos en el alta" }, { status: 400 });
  }

  try {
    const randomPassword = randomBytes(32).toString("hex");

    const user = createUser({
      email: parsed.data.email,
      password: randomPassword,
      assignments: parsed.data.assignments,
    });

    if (!user) {
      return NextResponse.json({ error: "No se pudo crear el usuario" }, { status: 400 });
    }

    const tokenResult = createPasswordSetupTokenFromAdmin({
      actorId: session.userId,
      targetUserId: user.id,
      reason: "user_create",
      expiresHours: 48,
    });

    if (!tokenResult.ok) {
      return NextResponse.json({ error: "No se pudo generar el enlace de acceso" }, { status: 400 });
    }

    const setupLink = buildSetupLink(request.nextUrl.origin, tokenResult.token);

    return NextResponse.json({
      ok: true,
      user,
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
  } catch {
    return NextResponse.json({ error: "No se pudo crear el usuario" }, { status: 400 });
  }
}
