import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { generateToken, hashToken } from "@/lib/auth/crypto";

export const SESSION_COOKIE = "managoney_session";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const REFRESH_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // renovar en la mitad
const LAST_SEEN_THROTTLE_MS = 60 * 60 * 1000; // 1 hora

/**
 * Crea una sesion y la deja en una cookie httpOnly.
 *
 * En la base solo queda el SHA-256 del token: el valor en claro existe unicamente
 * dentro de la cookie del navegador. Un dump de la base no sirve para robar
 * sesiones.
 *
 * Nace con `pending2fa` en true si el usuario tiene 2FA activo. Hasta que no
 * pase el segundo factor, `requireAuth` la rechaza.
 */
export async function createSession(
  userId: string,
  opts: { pending2fa: boolean; userAgent?: string | null; ip?: string | null },
) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      pending2fa: opts.pending2fa,
      userAgent: opts.userAgent?.slice(0, 500) ?? null,
      ip: opts.ip ?? null,
      expiresAt,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true, // invisible para JavaScript: corta el robo por XSS
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // corta CSRF sin romper la vuelta desde links externos
    path: "/",
    expires: expiresAt,
  });

  return { token, expiresAt };
}

export type SessionContext = {
  sessionId: string;
  userId: string;
  pending2fa: boolean;
  workspaceId: string;
  user: { id: string; name: string; email: string; totpEnabled: boolean };
};

/**
 * Lee la sesion de la cookie y la valida. Devuelve null si no hay, si vencio
 * o si fue revocada.
 *
 * No lanza ni redirige: se usa tanto en paginas publicas como privadas.
 */
export const getSession = cache(async function getSession(): Promise<SessionContext | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  // Un JOIN a mano y no `include` anidados: Prisma resuelve cada relacion con
  // una consulta aparte, asi que sesion -> usuario -> membresia costaba tres
  // idas y vueltas a la base. Esta consulta la paga CADA pagina privada, y con
  // la base en otro continente esos viajes se notan.
  const rows = await prisma.$queryRaw<
    {
      id: string;
      userId: string;
      pending2fa: boolean;
      revokedAt: Date | null;
      expiresAt: Date;
      lastSeenAt: Date;
      workspaceId: string;
      name: string;
      email: string;
      totpEnabledAt: Date | null;
    }[]
  >`
    SELECT s.id, s."userId", s."pending2fa", s."revokedAt", s."expiresAt",
           s."lastSeenAt", m."workspaceId", u.name, u.email, u."totpEnabledAt"
    FROM "Session" s
    JOIN "User" u ON u.id = s."userId"
    JOIN "Membership" m ON m."userId" = u.id
    WHERE s."tokenHash" = ${hashToken(token)}
    ORDER BY m."createdAt" ASC
    LIMIT 1
  `;

  const session = rows[0];

  // Sin fila: token inexistente, o un usuario sin workspace (registro a medias).
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt <= new Date()) return null;

  void touchSession(session.id, session.lastSeenAt, session.expiresAt);

  return {
    sessionId: session.id,
    userId: session.userId,
    pending2fa: session.pending2fa,
    workspaceId: session.workspaceId,
    user: {
      id: session.userId,
      name: session.name,
      email: session.email,
      totpEnabled: session.totpEnabledAt !== null,
    },
  };
});

/**
 * Actualiza `lastSeenAt` y estira el vencimiento si la sesion se esta por
 * vencer, para no echar a alguien que la usa todos los dias.
 *
 * Corre sin await y se traga los errores: es telemetria, no puede romper una
 * request.
 */
async function touchSession(
  sessionId: string,
  lastSeenAt: Date,
  expiresAt: Date,
) {
  const now = Date.now();
  const staleLastSeen = now - lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS;
  const nearExpiry = expiresAt.getTime() - now < REFRESH_THRESHOLD_MS;

  if (!staleLastSeen && !nearExpiry) return;

  try {
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        lastSeenAt: new Date(),
        ...(nearExpiry
          ? { expiresAt: new Date(now + SESSION_TTL_MS) }
          : {}),
      },
    });
  } catch {
    // La sesion pudo haberse revocado en paralelo. No importa.
  }
}

/** Marca la sesion como completa despues de validar el segundo factor. */
export async function completeTwoFactor(sessionId: string) {
  await prisma.session.update({
    where: { id: sessionId },
    data: { pending2fa: false },
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session
      .updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => {});
  }

  store.delete(SESSION_COOKIE);
}

/** Cierra todas las sesiones del usuario. Se usa al cambiar la password. */
export async function revokeAllSessions(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
