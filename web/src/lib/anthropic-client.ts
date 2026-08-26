/**
 * Llamadas directas del browser a api.anthropic.com. El server nunca ve
 * la key (ver plan, Fase 6) -- por eso esto es un fetch de ~30 líneas y
 * no el SDK completo: Anthropic es el único proveedor grande que soporta
 * oficialmente `anthropic-dangerous-direct-browser-access`, así que no
 * hace falta abstraer sobre otros proveedores hoy (YAGNI).
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Modelo más barato disponible -- suficiente para narrar un brief ya
// precomputado (ver plan: el LLM nunca calcula, solo narra) y para el
// smoke test de "Probar key".
const CHEAP_MODEL = "claude-haiku-4-5-20251001";

export class AnthropicKeyError extends Error {}

function headersFor(apiKey: string): HeadersInit {
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body) {
      const err = (body as { error?: { message?: string } }).error;
      if (err?.message) return err.message;
    }
  } catch {
    // el body no era JSON -- se usa el texto de status como fallback
  }
  return response.statusText;
}

/** Llamada mínima de 1 token, para el botón "Probar key" de Settings.
 * Nunca reintenta un 401: una key mala no se arregla reintentando. */
export async function testApiKey(apiKey: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: headersFor(apiKey),
    body: JSON.stringify({
      model: CHEAP_MODEL,
      max_tokens: 1,
      messages: [{ role: "user", content: "hola" }],
    }),
  });

  if (response.ok) return { ok: true };
  const message = await readErrorMessage(response);
  return { ok: false, message: `${response.status}: ${message}` };
}

/** Narra el brief precomputado por /api/brief. Nunca hace la matemática
 * -- ver plan: LLM haciendo la matemática ~22% de precisión, narrando
 * estadísticas precomputadas ~84%. */
export async function generateInsight(apiKey: string, systemPrompt: string, brief: string): Promise<string> {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: headersFor(apiKey),
    body: JSON.stringify({
      model: CHEAP_MODEL,
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: "user", content: brief }],
    }),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new AnthropicKeyError(`${response.status}: ${message}`);
  }

  const data: { content: Array<{ type: string; text?: string }> } = await response.json();
  return data.content.find((block) => block.type === "text")?.text ?? "";
}

/** Verificación anti-alucinación (ver plan, Fase 6): todo número que el
 * modelo menciona tiene que aparecer textual en el brief que se le
 * mandó. Ataca el modo de falla documentado de PH-LLM (confabula un
 * número que no estaba en el contexto). No es criptográficamente
 * perfecto -- es un regex de 3 líneas que atrapa el caso real. */
export function findUnverifiedNumbers(insightText: string, brief: string): string[] {
  const numbersInInsight = insightText.match(/\d+([.,]\d+)?/g) ?? [];
  return [...new Set(numbersInInsight)].filter((n) => !brief.includes(n));
}
