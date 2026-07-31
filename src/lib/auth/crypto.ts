import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "@/lib/env";

const KEY = Buffer.from(env.APP_ENCRYPTION_KEY, "base64");
const IV_LENGTH = 12; // recomendado para GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Cifra un texto con AES-256-GCM.
 *
 * Se usa para el secreto TOTP: si alguien se lleva un dump de la base, sin la
 * APP_ENCRYPTION_KEY no puede generar codigos validos. GCM ademas autentica,
 * asi que un secreto manipulado falla al descifrar en vez de devolver basura.
 *
 * Formato de salida: base64(iv || authTag || ciphertext)
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    "base64",
  );
}

export function decrypt(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Hash de tokens de sesion y codigos de recuperacion.
 *
 * SHA-256 sin salt a proposito: estos valores son aleatorios de 256 bits, no
 * elegidos por una persona, asi que no hay diccionario que atacar y el lookup
 * tiene que ser rapido. Las passwords van con Argon2id, que es otra cosa.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Comparacion en tiempo constante, para no filtrar informacion por timing. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
