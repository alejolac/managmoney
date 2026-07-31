import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

/**
 * Parametros de Argon2id.
 *
 * Argon2id es el ganador del Password Hashing Competition y lo que OWASP
 * recomienda hoy. A diferencia de bcrypt es duro en memoria, asi que crackear
 * en GPU sale mucho mas caro.
 *
 * 19 MiB con 2 iteraciones es la config minima que recomienda OWASP y entra
 * comoda en el limite de memoria de una funcion serverless.
 */
const OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, password, OPTIONS);
  } catch {
    // Hash corrupto o de otro formato: no es una password valida.
    return false;
  }
}

/**
 * Requisitos de password.
 *
 * Largo minimo generoso en vez de exigir simbolos raros: es lo que mejor
 * aguanta un ataque real y lo que ya recomienda el NIST. Una frase larga vale
 * mas que "P4ssw0rd!".
 */
export const passwordSchema = z
  .string()
  .min(12, "La contrasena tiene que tener al menos 12 caracteres")
  .max(200, "Demasiado larga");
