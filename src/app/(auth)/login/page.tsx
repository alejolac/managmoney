import Link from "next/link";
import { redirectIfAuthenticated } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar | Managoney" };

export default async function LoginPage() {
  await redirectIfAuthenticated();

  return (
    <div className="space-y-5">
      <LoginForm />

      {env.ALLOW_REGISTRATION ? (
        <p className="text-center text-sm text-muted">
          Todavia no tenes cuenta?{" "}
          <Link
            href="/registro"
            className="font-medium text-accent hover:underline"
          >
            Crear una
          </Link>
        </p>
      ) : null}
    </div>
  );
}
