"use client";

import { useActionState } from "react";
import { login, type FormState } from "@/app/(auth)/actions";
import { Field, FormError, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/auth/submit-button";

export function LoginForm() {
  const [state, formAction] = useActionState<FormState, FormData>(login, {});

  return (
    <form action={formAction} className="space-y-4">
      <FormError>{state.error}</FormError>

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
        />
      </Field>

      <Field label="Contrasena" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <SubmitButton pendingLabel="Entrando...">Entrar</SubmitButton>
    </form>
  );
}
