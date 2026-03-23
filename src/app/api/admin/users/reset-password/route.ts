import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceSameOrigin, getSessionFromRequest, hasAdminPermission } from "@/lib/auth";
import { randomBytes } from "node:crypto";
import {
  createPasswordSetupTokenFromAdmin,
  getUserById,
  logAdminPermissionDenied,
  resetUserPasswordFromAdmin,
} from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({
  userId: z.coerce.number().int().positive(),
  whatsappPhone: z.string().trim().max(30).optional(),
});

function normalizeWhatsappPhone(input: string) {
  return input.replace(/\D/g, "");
}

function buildWhatsappLink(phone: string, email: string, setupLink: string, expiresAt: string | null) {
  const text = [
    "Hola,",
    "Se ha regenerado tu acceso al sistema.",
    `Correo: ${email}`,
    "Define tu nueva contrasena desde este enlace:",
    setupLink,
    expiresAt ? `Caduca: ${expiresAt}` : "",
  ].join("\n");

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function buildMailtoLink(email: string, setupLink: string, expiresAt: string | null) {
  const subject = "Restablece tu acceso del sistema";
  const body = [
    "Hola,",
    "",
    "Se ha regenerado tu acceso al sistema.",
    `Correo: ${email}`,
    "Abre este enlace para crear una nueva contrasena:",
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

  const user = getUserById(parsed.data.userId);

  if (!user || user.role !== "user") {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const randomPassword = randomBytes(32).toString("hex");

  const updatedUser = resetUserPasswordFromAdmin({
    actorId: session.userId,
    targetUserId: parsed.data.userId,
    newPassword: randomPassword,
  });

  if (!updatedUser) {
    return NextResponse.json({ error: "No se pudo resetear la contrasena" }, { status: 400 });
  }

  const tokenResult = createPasswordSetupTokenFromAdmin({
    actorId: session.userId,
    targetUserId: parsed.data.userId,
    reason: "user_reset",
    expiresHours: 24,
  });

  if (!tokenResult.ok) {
    return NextResponse.json({ error: "No se pudo generar el enlace de restablecimiento" }, { status: 400 });
  }

  const setupLink = buildSetupLink(request.nextUrl.origin, tokenResult.token);

  return NextResponse.json({
    ok: true,
    user: updatedUser,
    onboarding: {
      setupLink,
      expiresAt: tokenResult.expiresAt,
      mailtoLink: buildMailtoLink(user.username, setupLink, tokenResult.expiresAt),
      whatsappLink: parsed.data.whatsappPhone
        ? buildWhatsappLink(
            normalizeWhatsappPhone(parsed.data.whatsappPhone),
            user.username,
            setupLink,
            tokenResult.expiresAt,
          )
        : undefined,
    },
  });
}
