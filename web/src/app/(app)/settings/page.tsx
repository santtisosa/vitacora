"use client";

import { useEffect, useState, type ChangeEvent } from "react";

import { testApiKey } from "@/lib/anthropic-client";
import { clearApiKey, loadApiKey, maskApiKey, saveApiKey } from "@/lib/secure-key-store";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TestState = "idle" | "testing" | "ok" | "error";

const KEY_PREFIX = "sk-ant-";

export default function SettingsPage() {
  const [savedMask, setSavedMask] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [testState, setTestState] = useState<TestState>("idle");
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadApiKey().then((key) => setSavedMask(key ? maskApiKey(key) : null));
  }, []);

  const looksValid = input.startsWith(KEY_PREFIX) && input.length > KEY_PREFIX.length + 8;

  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    setInput(event.target.value);
    setTestState("idle");
  }

  async function handleTest(): Promise<void> {
    setTestState("testing");
    setTestMessage(null);
    const result = await testApiKey(input);
    if (result.ok) {
      setTestState("ok");
    } else {
      setTestState("error");
      setTestMessage(result.message);
    }
  }

  async function handleSave(): Promise<void> {
    await saveApiKey(input);
    setSavedMask(maskApiKey(input));
    setInput("");
    setTestState("idle");
  }

  async function handleClear(): Promise<void> {
    await clearApiKey();
    setSavedMask(null);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">Configuración</h1>
        <p className="text-muted-foreground text-sm">Tu API key de Anthropic para las recomendaciones de IA.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">API key de Anthropic</CardTitle>
          <CardDescription>
            Se guarda cifrada solo en este navegador (IndexedDB) y se usa para llamar a Anthropic directo desde
            acá -- el servidor de Vitácora nunca la ve. Conseguí una en{" "}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              console.anthropic.com
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {savedMask ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>Guardada: {savedMask}</span>
              <Button variant="ghost" size="sm" onClick={handleClear}>
                Quitar
              </Button>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="api-key">{savedMask ? "Reemplazar key" : "API key"}</Label>
            <Input id="api-key" type="password" placeholder="sk-ant-..." value={input} onChange={handleInputChange} />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!looksValid || testState === "testing"}
              onClick={handleTest}
            >
              {testState === "testing" ? "Probando…" : "Probar key"}
            </Button>
            <Button size="sm" disabled={!looksValid} onClick={handleSave}>
              Guardar
            </Button>
          </div>

          {testState === "ok" ? <p className="text-sm text-green-600 dark:text-green-500">Funciona.</p> : null}
          {testState === "error" ? <p className="text-destructive text-sm">{testMessage}</p> : null}

          <p className="text-muted-foreground text-xs">
            Recomendado: creá un Workspace dedicado en la consola de Anthropic con un límite de gasto mensual antes
            de pegar la key acá.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
