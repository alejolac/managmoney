import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Bloqueo por intentos fallidos.
 *
 * Sin esto, una password de 12 caracteres igual cae ante alguien que prueba
 * sin limite contra un endpoint publico. Con 5 intentos y 15 minutos de
 * espera, un ataque de fuerza bruta pasa a tardar siglos.
 */
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export function isLocked(user: {
  lockedUntil: Date | null;
}): boolean {
  return user.lockedUntil !== null && user.lockedUntil > new Date();
}

export function minutesUntilUnlock(user: { lockedUntil: Date | null }): number {
  if (!user.lockedUntil) return 0;
  const ms = user.lockedUntil.getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / 60_000));
}

export async function registerFailedAttempt(userId: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });

  if (user.failedLoginAttempts >= MAX_ATTEMPTS) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000),
        failedLoginAttempts: 0,
      },
    });
  }
}

export async function clearFailedAttempts(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });
}
