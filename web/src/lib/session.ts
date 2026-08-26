/**
 * Auth mínima de un solo usuario (ver plan Fase 0: "Password única →
 * cookie httpOnly firmada"). Sin tabla de usuarios: la contraseña vive
 * en `VITACORA_PASSWORD`, la cookie de sesión es un token firmado con
 * HMAC-SHA256 verificado en `proxy.ts`, nunca en el cliente.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "vitacora_session";
export const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 días

function secret(): string {
  const value = process.env.VITACORA_SESSION_SECRET;
  if (!value) {
    throw new Error("VITACORA_SESSION_SECRET no está configurado.");
  }
  return value;
}

function hmac(payload: string): Buffer {
  return createHmac("sha256", secret()).update(payload).digest();
}

export function createSessionToken(): string {
  const payload = `v1.${Date.now()}`;
  return `${payload}.${hmac(payload).toString("base64url")}`;
}

export function isValidSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const lastDot = token.lastIndexOf(".");
  if (lastDot === -1) return false;

  const payload = token.slice(0, lastDot);
  const signature = Buffer.from(token.slice(lastDot + 1), "base64url");
  const expected = hmac(payload);

  // Firmas de largo distinto ya son inválidas -- comparar length es
  // seguro (no depende del contenido secreto), solo el contenido en sí
  // se compara con timingSafeEqual.
  return signature.length === expected.length && timingSafeEqual(signature, expected);
}

/** Compara dos strings en tiempo constante hasheándolas primero: evita
 * filtrar tanto el contenido como el LARGO de la contraseña vía timing,
 * que una comparación con `!==`/`timingSafeEqual` directo sí filtra. */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  return timingSafeEqual(hmac(a), hmac(b));
}
