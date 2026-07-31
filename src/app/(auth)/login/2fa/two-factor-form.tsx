"use client";

import { useActionState } from "react";
import { verifySecondFactor, type FormState } from "@/app/(auth)/actions";
import { Field, FormError, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/auth/submit-button";

export function TwoFactorForm() {
  const [state, formAction] = useActionState<FormState, FormData>(
    verifySecondFactor,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <FormError>{state.error}</FormError>

      <Field
        label="Codigo"
        htmlFor="code"
        hint="Tambien podes usar uno de tus codigos de recuperacion."
      >
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          required
          autoFocus
          className="text-center text-lg tracking-[0.4em] tabular"
        />
      </Field>

      <SubmitButton pendingLabel="Verificando...">Verificar</SubmitButton>
    </form>
  );
}
