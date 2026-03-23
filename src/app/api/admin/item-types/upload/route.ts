import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { logAdminPermissionDenied } from "@/lib/db";
import { enforceSameOrigin, getSessionFromRequest, hasAdminPermission } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const EXTENSIONS_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

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

  const formData = await request.formData().catch(() => null);
  const fileEntry = formData?.get("image");

  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(fileEntry.type)) {
    return NextResponse.json({ error: "Tipo de imagen no permitido" }, { status: 400 });
  }

  if (fileEntry.size <= 0 || fileEntry.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "La imagen debe pesar entre 1B y 2MB" }, { status: 400 });
  }

  const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());
  const extension = EXTENSIONS_BY_TYPE[fileEntry.type] ?? "bin";
  const safeName = `${Date.now()}-${randomUUID()}.${extension}`;

  const uploadDir = path.join(process.cwd(), "public", "uploads", "components");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, safeName), fileBuffer);

  return NextResponse.json({
    ok: true,
    imageUrl: `/uploads/components/${safeName}`,
  });
}
