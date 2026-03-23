import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumePasswordSetupToken } from "@/lib/db";
import { enforceSameOrigin } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().trim().min(20).max(256),
  password: z.string().min(10).max(128),
});

function isStrongPassword(password: string) {
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  return hasUpper && hasLower && hasNumber;
}

export async function POST(request: NextRequest) {
  if (!enforceSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  if (!isStrongPassword(parsed.data.password)) {
    return NextResponse.json(
      { error: "La contrasena debe incluir mayusculas, minusculas y numeros" },
      { status: 400 },
    );
  }

  const result = consumePasswordSetupToken({
    token: parsed.data.token,
    newPassword: parsed.data.password,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Enlace invalido o expirado" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
  });
}
