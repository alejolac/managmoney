import "server-only";
import { redirect } from "next/navigation";
import { getSession, type SessionContext } from "@/lib/auth/session";

/**
 * Puerta de entrada de todo lo privado.
 *
 * Una sesion con `pending2fa` NO alcanza: paso la password pero no el segundo
 * factor, asi que va al paso 2 y no a la app.
 */
export async function requireAuth(): Promise<SessionContext> {
  const session = await getSession();

  if (!session) redirect("/login");
  if (session.pending2fa) redirect("/login/2fa");

  return session;
}

/** Para paginas publicas: si ya entraste, no tiene sentido volver al login. */
export async function redirectIfAuthenticated(to = "/") {
  const session = await getSession();
  if (session && !session.pending2fa) redirect(to);
}
