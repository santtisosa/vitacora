import { NextResponse } from "next/server";
import { z } from "zod";

import { saveInsight } from "@/lib/db";

// El browser genera el insight (llama a Anthropic directo, ver plan
// Fase 6) y lo manda acá para cachearlo por contextHash -- así una
// segunda visita el mismo día no vuelve a gastar tokens del usuario si
// el contexto no cambió.
const bodySchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contextHash: z.string().min(1),
  text: z.string().min(1),
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error inesperado";
}

export async function POST(request: Request): Promise<NextResponse> {
  const json: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await saveInsight(parsed.data.localDate, parsed.data.contextHash, { text: parsed.data.text });
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
