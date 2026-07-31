"use client";

import { useActionState } from "react";
import { register, type FormState } from "@/app/(auth)/actions";
import { Field, FormError, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/auth/submit-button";

export function RegistroForm() {
  const [state, formAction] = useActionState<FormState, FormData>(register, {});

  return (
    <form action={formAction} className="space-y-4">
      <FormError>{state.error}</FormError>

      <Field label="Nombre" htmlFor="name">
        <Input id="name" name="name" required autoFocus maxLength={80} />
      </Field>

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </Field>

      <Field
        label="Contrasena"
        htmlFor="password"
        hint="Minimo 12 caracteres. Una frase larga que recuerdes es mejor que una corta con simbolos raros."
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
        />
      </Field>

      <SubmitButton pendingLabel="Creando cuenta...">Crear cuenta</SubmitButton>
    </form>
  );
}
