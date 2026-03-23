import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, enforceSameOrigin } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!enforceSameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
