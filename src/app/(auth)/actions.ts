"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { hashPassword, passwordSchema, verifyPassword } from "@/lib/auth/password";
import {
  completeTwoFactor,
  createSession,
  destroySession,
  getSession,
} from "@/lib/auth/session";
import { decrypt } from "@/lib/auth/crypto";
import { consumeRecoveryCode, verifyTotp } from "@/lib/auth/totp";
import {
  clearFailedAttempts,
  isLocked,
  minutesUntilUnlock,
  registerFailedAttempt,
} from "@/lib/auth/lockout";
import { bootstrapWorkspace } from "@/lib/workspace/bootstrap";

export type FormState = { error?: string };

/**
 * Hash descartable con el que se compara cuando el email no existe.
 *
 * Sin esto, un login con email inexistente responde mucho mas rapido que uno
 * con email valido, y esa diferencia de tiempo revela que cuentas existen.
 *
 * Tiene que ser un hash Argon2 REAL: uno falso falla al parsear en
 * microsegundos y no iguala nada. Se calcula una sola vez por proceso.
 */
let dummyHashPromise: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomBytes(32).toString("hex"));
  return dummyHashPromise;
}

async function requestMeta() {
  const headerList = await headers();
  return {
    userAgent: headerList.get("user-agent"),
    ip:
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerList.get("x-real-ip"),
  };
}

// ---------------------------------------------------------------- registro

const registerSchema = z.object({
  name: z.string().trim().min(1, "Falta el nombre").max(80),
  email: z.string().trim().toLowerCase().email("Email invalido"),
  password: passwordSchema,
});

export async function register(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!env.ALLOW_REGISTRATION) {
    return { error: "El registro esta cerrado." };
  }

  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { name, email, password } = parsed.data;

  if (await prisma.user.findUnique({ where: { email } })) {
    return { error: "Ya existe una cuenta con ese email." };
  }

  const passwordHash = await hashPassword(password);

  // Usuario, workspace, categorias y cuentas iniciales van juntos: si algo
  // falla no queda un usuario a medias sin donde cargar nada.
  //
  // El timeout va holgado porque la base esta en otro continente y el default
  // de 5s no deja margen para la latencia de red.
  const user = await prisma.$transaction(
    async (tx) => {
      const created = await tx.user.create({
        data: { name, email, passwordHash },
      });
      await bootstrapWorkspace(tx, {
        userId: created.id,
        name: `Finanzas de ${name}`,
      });
      return created;
    },
    { timeout: 20_000 },
  );

  const meta = await requestMeta();
  await createSession(user.id, { pending2fa: false, ...meta });

  redirect("/");
}

// ------------------------------------------------------------------- login

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalido"),
  password: z.string().min(1, "Falta la contrasena"),
});

export async function login(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  // Mensaje generico a proposito: no confirmamos si el email existe.
  const genericError = { error: "Email o contrasena incorrectos." };

  if (!parsed.success) return genericError;

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await verifyPassword(await getDummyHash(), password);
    return genericError;
  }

  if (isLocked(user)) {
    return {
      error: `Cuenta bloqueada por intentos fallidos. Volve a probar en ${minutesUntilUnlock(user)} minutos.`,
    };
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    await registerFailedAttempt(user.id);
    return genericError;
  }

  await clearFailedAttempts(user.id);

  const meta = await requestMeta();
  const needsTwoFactor = user.totpEnabledAt !== null;
  await createSession(user.id, { pending2fa: needsTwoFactor, ...meta });

  redirect(needsTwoFactor ? "/login/2fa" : "/");
}

// --------------------------------------------------------------- segundo factor

export async function verifySecondFactor(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.pending2fa) redirect("/");

  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Ingresa el codigo." };

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { totpSecret: true },
  });

  if (!user?.totpSecret) redirect("/");

  // Un codigo con guion es de recuperacion; seis digitos es de la app.
  const isRecoveryCode = code.includes("-");
  const ok = isRecoveryCode
    ? await consumeRecoveryCode(session.userId, code)
    : await verifyTotp(decrypt(user.totpSecret), code);

  if (!ok) {
    await registerFailedAttempt(session.userId);
    return { error: "Codigo invalido o vencido." };
  }

  await clearFailedAttempts(session.userId);
  await completeTwoFactor(session.sessionId);

  redirect("/");
}

// ------------------------------------------------------------------ logout

export async function logout() {
  await destroySession();
  redirect("/login");
}
