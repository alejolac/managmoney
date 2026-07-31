"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guard";
import { decrypt, encrypt } from "@/lib/auth/crypto";
import { verifyPassword } from "@/lib/auth/password";
import { createTotpSecret, replaceRecoveryCodes, verifyTotp } from "@/lib/auth/totp";
import { revokeAllSessions } from "@/lib/auth/session";

const PATH = "/configuracion/seguridad";

export type SetupState = { error?: string; codes?: string[] };

/**
 * Paso 1: genera el secreto y lo guarda cifrado, pero SIN activar el 2FA.
 *
 * Queda en estado pendiente (`totpEnabledAt` en null) hasta que demuestres que
 * tu app genera codigos validos. Activarlo antes de confirmar te dejaria
 * afuera de tu propia cuenta si el QR no se escaneo bien.
 */
export async function startTotpSetup() {
  const session = await requireAuth();

  await prisma.user.update({
    where: { id: session.userId },
    data: { totpSecret: encrypt(createTotpSecret()), totpEnabledAt: null },
  });

  revalidatePath(PATH);
}

/** Paso 2: confirma con un codigo real y recien ahi activa el 2FA. */
export async function confirmTotpSetup(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  const session = await requireAuth();

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { totpSecret: true, totpEnabledAt: true },
  });

  if (!user.totpSecret) return { error: "No hay ninguna activacion en curso." };
  if (user.totpEnabledAt) return { error: "El 2FA ya esta activo." };

  const code = String(formData.get("code") ?? "");
  if (!(await verifyTotp(decrypt(user.totpSecret), code))) {
    return { error: "Ese codigo no coincide. Revisa que el reloj del celular este en hora." };
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { totpEnabledAt: new Date() },
  });

  // Se muestran una sola vez: despues solo queda el hash.
  const codes = await replaceRecoveryCodes(session.userId);

  revalidatePath(PATH);
  return { codes };
}

export async function cancelTotpSetup() {
  const session = await requireAuth();

  await prisma.user.updateMany({
    where: { id: session.userId, totpEnabledAt: null },
    data: { totpSecret: null },
  });

  revalidatePath(PATH);
}

export type DisableState = { error?: string };

/**
 * Apagar el 2FA pide la password de nuevo.
 *
 * Si no, alguien que agarra tu sesion abierta puede bajarte la proteccion sin
 * saber ni una credencial.
 */
export async function disableTotp(
  _prev: DisableState,
  formData: FormData,
): Promise<DisableState> {
  const session = await requireAuth();

  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { passwordHash: true },
  });

  if (!(await verifyPassword(user.passwordHash, password))) {
    return { error: "Contrasena incorrecta." };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.userId },
      data: { totpSecret: null, totpEnabledAt: null },
    }),
    prisma.recoveryCode.deleteMany({ where: { userId: session.userId } }),
  ]);

  revalidatePath(PATH);
  return {};
}

export type RegenerateState = { error?: string; codes?: string[] };

export async function regenerateRecoveryCodes(
  _prev: RegenerateState,
  formData: FormData,
): Promise<RegenerateState> {
  const session = await requireAuth();

  const password = String(formData.get("password") ?? "");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { passwordHash: true, totpEnabledAt: true },
  });

  if (!user.totpEnabledAt) return { error: "El 2FA no esta activo." };
  if (!(await verifyPassword(user.passwordHash, password))) {
    return { error: "Contrasena incorrecta." };
  }

  return { codes: await replaceRecoveryCodes(session.userId) };
}

/**
 * Cierra todas las sesiones, incluida la actual. Es el boton de panico si
 * pensas que alguien entro.
 */
export async function signOutEverywhere() {
  const session = await requireAuth();
  await revokeAllSessions(session.userId);
  revalidatePath("/", "layout");
}
