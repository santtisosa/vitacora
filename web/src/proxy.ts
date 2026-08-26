// En Next.js 16 el middleware pasó a llamarse "proxy" (archivo y export
// renombrados) -- ver AGENTS.md del propio proyecto. Corre en runtime
// Node por defecto acá, así que `node:crypto` en session.ts funciona sin
// nada especial.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { COOKIE_NAME, isValidSessionToken } from "@/lib/session";

export function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (isValidSessionToken(token)) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!api/login|login|_next/static|_next/image|favicon.ico).*)"],
};
