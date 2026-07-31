import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { logout } from "@/app/(auth)/actions";
import { TwoFactorForm } from "./two-factor-form";

export const metadata = { title: "Verificacion | Managoney" };

export default async function TwoFactorPage() {
  const session = await getSession();

  if (!session) redirect("/login");
  // Sesion ya completa: no hay segundo factor pendiente que resolver.
  if (!session.pending2fa) redirect("/");

  return (
    <div className="space-y-5">
      <div className="space-y-1 text-center">
        <h2 className="font-medium">Verificacion en dos pasos</h2>
        <p className="text-sm text-muted">
          Abri tu app de autenticacion e ingresa el codigo de 6 digitos.
        </p>
      </div>

      <TwoFactorForm />

      <form action={logout}>
        <button
          type="submit"
          className="w-full text-center text-sm text-muted hover:text-foreground"
        >
          Entrar con otra cuenta
        </button>
      </form>
    </div>
  );
}
