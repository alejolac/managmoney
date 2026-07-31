import Link from "next/link";
import { redirect } from "next/navigation";
import { redirectIfAuthenticated } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { RegistroForm } from "./registro-form";

export const metadata = { title: "Crear cuenta | Managoney" };

export default async function RegistroPage() {
  await redirectIfAuthenticated();

  // La app es de un solo usuario: una vez que te registraste, ALLOW_REGISTRATION
  // pasa a false y esta pantalla deja de existir.
  if (!env.ALLOW_REGISTRATION) redirect("/login");

  return (
    <div className="space-y-5">
      <RegistroForm />

      <p className="text-center text-sm text-muted">
        Ya tenes cuenta?{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
