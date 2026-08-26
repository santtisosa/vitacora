/**
 * Guarda la API key de Anthropic SOLO en el navegador -- el server nunca
 * la ve (ver plan, Fase 6). La key se cifra con AES-GCM bajo una
 * CryptoKey NO exportable guardada en IndexedDB: un XSS podría llegar a
 * *usar* la key (pedirle a esta función que descifre y llame a
 * Anthropic), pero no puede *exfiltrarla* porque `crypto.subtle` nunca
 * expone el material de la clave. La mitigación real sigue siendo el
 * CSP (`connect-src 'self' https://api.anthropic.com`, sin scripts de
 * terceros) -- esto es una segunda capa, no un reemplazo.
 */

const DB_NAME = "vitacora-keystore";
const DB_VERSION = 1;
const STORE = "secrets";
const CRYPTO_KEY_ID = "anthropic-wrap-key";
const CIPHERTEXT_ID = "anthropic-api-key";

interface StoredSecret {
  id: string;
  value: unknown;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(db: IDBDatabase, id: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as StoredSecret | undefined)?.value as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(db: IDBDatabase, id: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id, value } satisfies StoredSecret);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getOrCreateWrapKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await idbGet<CryptoKey>(db, CRYPTO_KEY_ID);
  if (existing) return existing;

  // extractable: false -- ni siquiera este código puede sacar el
  // material de la clave, solo pedirle a subtle.encrypt/decrypt que la
  // use.
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await idbPut(db, CRYPTO_KEY_ID, key);
  return key;
}

export async function saveApiKey(plaintext: string): Promise<void> {
  const db = await openDb();
  const key = await getOrCreateWrapKey(db);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  await idbPut(db, CIPHERTEXT_ID, { iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext)) });
}

export async function loadApiKey(): Promise<string | null> {
  const db = await openDb();
  const stored = await idbGet<{ iv: number[]; ciphertext: number[] }>(db, CIPHERTEXT_ID);
  if (!stored) return null;
  const key = await getOrCreateWrapKey(db);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(stored.iv) },
      key,
      new Uint8Array(stored.ciphertext)
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    // La clave de cifrado no coincide con el texto guardado (ej. se
    // perdió/regeneró) -- mejor pedir la key de nuevo que fallar oscuro.
    return null;
  }
}

export async function clearApiKey(): Promise<void> {
  const db = await openDb();
  await idbDelete(db, CIPHERTEXT_ID);
}

/** Últimos 4 caracteres para mostrar en Settings sin volver a exponer la
 * key completa en el DOM. */
export function maskApiKey(key: string): string {
  return key.length <= 4 ? "••••" : `••••${key.slice(-4)}`;
}
