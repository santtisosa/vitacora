import { NextResponse } from "next/server";
import { z } from "zod";

import { COOKIE_NAME, MAX_AGE_SECONDS, createSessionToken, timingSafeEqualStrings } from "@/lib/session";

const bodySchema = z.object({ password: z.string().min(1) });

export async function POST(request: Request): Promise<NextResponse> {
  const json: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Falta la contraseña." }, { status: 400 });
  }

  const expected = process.env.VITACORA_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "VITACORA_PASSWORD no está configurado en el server." }, { status: 500 });
  }

  if (!timingSafeEqualStrings(parsed.data.password, expected)) {
    return NextResponse.json({ error: "Contraseña incorrecta." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return response;
}
