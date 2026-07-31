import "server-only";
import { randomInt } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/auth/crypto";

const ISSUER = "Managoney";

/**
 * Tolerancia de reloj, en segundos. Acepta el codigo del paso anterior y el
 * siguiente para que un celular con el reloj corrido unos segundos no te deje
 * afuera. Mas que esto empieza a agrandar la ventana de un atacante.
 */
const EPOCH_TOLERANCE = 30;

const RECOVERY_CODE_COUNT = 10;

export function createTotpSecret(): string {
  return generateSecret();
}

/** URI `otpauth://` que se convierte en el QR que escanea la app del celular. */
export function buildOtpAuthUri(secret: string, email: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret });
}

export async function verifyTotp(
  secret: string,
  token: string,
): Promise<boolean> {
  const normalized = token.replace(/\D/g, "");
  if (normalized.length !== 6) return false;

  try {
    const result = await verify({
      secret,
      token: normalized,
      epochTolerance: EPOCH_TOLERANCE,
    });
    return result.valid;
  } catch {
    return false;
  }
}

/**
 * Codigos de recuperacion de un solo uso, para cuando pierdas el celular.
 *
 * Se muestran UNA vez al activar el 2FA; en la base solo queda el hash.
 * Formato `abcd-efgh` para que sean legibles al anotarlos en papel.
 */
export function createRecoveryCodes(): string[] {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"; // sin l/1/0/o
  const pick = () =>
    Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join(
      "",
    );

  return Array.from(
    { length: RECOVERY_CODE_COUNT },
    () => `${pick()}-${pick()}`,
  );
}

/**
 * Canjea un codigo de recuperacion. Devuelve true si era valido y no estaba
 * usado; en ese caso lo marca como usado para que no sirva de nuevo.
 */
export async function consumeRecoveryCode(
  userId: string,
  code: string,
): Promise<boolean> {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return false;

  const match = await prisma.recoveryCode.findFirst({
    where: { userId, codeHash: hashToken(normalized), usedAt: null },
  });

  if (!match) return false;

  // updateMany con usedAt null actua como compare-and-swap: si dos requests
  // llegan con el mismo codigo, solo una afecta una fila.
  const consumed = await prisma.recoveryCode.updateMany({
    where: { id: match.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  return consumed.count === 1;
}

export async function replaceRecoveryCodes(
  userId: string,
): Promise<string[]> {
  const codes = createRecoveryCodes();

  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashToken(code) })),
    }),
  ]);

  return codes;
}
