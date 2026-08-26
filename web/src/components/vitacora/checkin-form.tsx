"use client";

import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Check-in diario opcional (ver plan, Fase 5): índice Hooper-Mackinnon
 * -- sueño, estrés, fatiga, dolor muscular en 1-7, instrumento validado
 * de monitoreo de atletas, no cuatro sliders inventados -- más agua. Un
 * tap por ítem, se guarda solo, se puede saltear cualquiera. */

type ScaleKey = "sleepQuality" | "stress" | "fatigue" | "soreness";

const SCALE_ITEMS: { key: ScaleKey; label: string }[] = [
  { key: "sleepQuality", label: "Calidad de sueño" },
  { key: "stress", label: "Estrés" },
  { key: "fatigue", label: "Fatiga" },
  { key: "soreness", label: "Dolor muscular" },
];

const WATER_STEPS_ML = [250, 500, 750, 1000, 1500, 2000];

interface CheckinFormProps {
  localDate: string;
  initial?: Partial<Record<ScaleKey, number>> & { waterMl?: number };
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function CheckinForm({ localDate, initial }: CheckinFormProps) {
  const [values, setValues] = useState<Partial<Record<ScaleKey, number>> & { waterMl?: number }>(initial ?? {});
  const [status, setStatus] = useState<SaveStatus>("idle");

  async function save(partial: Partial<Record<ScaleKey, number>> & { waterMl?: number }): Promise<void> {
    const next = { ...values, ...partial };
    setValues(next);
    setStatus("saving");
    try {
      const response = await fetch("/api/checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ localDate, ...next }),
      });
      setStatus(response.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Check-in de hoy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {SCALE_ITEMS.map((item) => (
          <div key={item.key} className="space-y-1">
            <p className="text-sm">{item.label}</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => save({ [item.key]: n })}
                  className={cn(
                    "h-8 w-8 rounded-md border text-sm transition-colors",
                    values[item.key] === n ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="space-y-1">
          <p className="text-sm">Agua (ml)</p>
          <div className="flex flex-wrap gap-1">
            {WATER_STEPS_ML.map((ml) => (
              <button
                key={ml}
                type="button"
                onClick={() => save({ waterMl: ml })}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs transition-colors",
                  values.waterMl === ml ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                {ml}
              </button>
            ))}
          </div>
        </div>

        <p className="text-muted-foreground text-xs">
          {status === "saving" && "Guardando…"}
          {status === "saved" && "Guardado."}
          {status === "error" && "No se pudo guardar -- probá de nuevo."}
          {status === "idle" && "Opcional -- podés saltear cualquier ítem."}
        </p>
      </CardContent>
    </Card>
  );
}
