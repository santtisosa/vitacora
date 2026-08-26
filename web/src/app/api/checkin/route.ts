import { NextResponse } from "next/server";
import { z } from "zod";

import { saveCheckin } from "@/lib/db";

// Escala Hooper-Mackinnon 1-7 (ver plan, Fase 5): instrumento validado
// de monitoreo de atletas, no cuatro sliders inventados.
const scaleField = z.number().int().min(1).max(7).optional();

const bodySchema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sleepQuality: scaleField,
  stress: scaleField,
  fatigue: scaleField,
  soreness: scaleField,
  waterMl: z.number().int().min(0).max(10_000).optional(),
  note: z.string().max(500).optional(),
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
    await saveCheckin(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
