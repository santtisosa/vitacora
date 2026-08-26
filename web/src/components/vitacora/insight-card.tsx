"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { findUnverifiedNumbers, generateInsight } from "@/lib/anthropic-client";
import { loadApiKey } from "@/lib/secure-key-store";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Ver plan Fase 6: "El dashboard tiene que ser completamente útil sin
 * key. Los insights son un tile descartable, nunca un portón" -- por
 * eso este componente vive solo, aparte del resto de la página, y su
 * estado "no-key" nunca bloquea nada.
 */

interface BriefResponse {
  today: string;
  systemPrompt: string;
  brief: string;
  contextHash: string;
  cachedInsight: { text?: string } | null;
}

type State =
  | { status: "loading" }
  | { status: "no-key" }
  | { status: "generating" }
  | { status: "ready"; text: string }
  | { status: "error"; message: string };

export function InsightCard() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      const briefResponse = await fetch("/api/brief");
      const brief: BriefResponse = await briefResponse.json();
      if (cancelled) return;

      if (brief.cachedInsight?.text) {
        setState({ status: "ready", text: brief.cachedInsight.text });
        return;
      }

      const apiKey = await loadApiKey();
      if (!apiKey) {
        setState({ status: "no-key" });
        return;
      }

      setState({ status: "generating" });
      try {
        const text = await generateInsight(apiKey, brief.systemPrompt, brief.brief);
        if (cancelled) return;

        const unverified = findUnverifiedNumbers(text, brief.brief);
        if (unverified.length > 0) {
          setState({
            status: "error",
            message: `El modelo mencionó números que no están en tus datos (${unverified.join(", ")}). No se muestra -- probá de nuevo más tarde.`,
          });
          return;
        }

        setState({ status: "ready", text });
        await fetch("/api/insight", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ localDate: brief.today, contextHash: brief.contextHash, text }),
        });
      } catch (error: unknown) {
        if (!cancelled) {
          setState({ status: "error", message: error instanceof Error ? error.message : "Error inesperado." });
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recomendación de hoy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {state.status === "loading" || state.status === "generating" ? (
          <p className="text-muted-foreground">Pensando…</p>
        ) : null}

        {state.status === "no-key" ? (
          <div className="space-y-2">
            <p className="text-muted-foreground">
              Cargá tu API key de Anthropic para tener recomendaciones. Es opcional -- el resto del dashboard
              funciona igual sin ella.
            </p>
            <Link href="/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Cargar API key
            </Link>
          </div>
        ) : null}

        {state.status === "ready" ? <p className="whitespace-pre-line">{state.text}</p> : null}
        {state.status === "error" ? <p className="text-destructive">{state.message}</p> : null}

        <p className="text-muted-foreground text-xs">
          No es un consejo médico. Ante una señal de alarma real, consultá a un profesional de la salud.
        </p>
      </CardContent>
    </Card>
  );
}
