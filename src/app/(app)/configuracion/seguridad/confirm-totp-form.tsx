"use client";

import { useActionState } from "react";
import { confirmTotpSetup, type SetupState } from "./actions";
import { Field, FormError, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/auth/submit-button";
import { RecoveryCodes } from "@/components/auth/recovery-codes";

export function ConfirmTotpForm() {
  const [state, formAction] = useActionState<SetupState, FormData>(
    confirmTotpSetup,
    {},
  );

  if (state.codes) return <RecoveryCodes codes={state.codes} />;

  return (
    <form action={formAction} className="space-y-4">
      <FormError>{state.error}</FormError>

      <Field label="Codigo de la app" htmlFor="setup-code">
        <Input
          id="setup-code"
          name="code"
          inputMode="numeric"
          placeholder="123456"
          required
          className="text-center text-lg tracking-[0.4em] tabular"
        />
      </Field>

      <SubmitButton pendingLabel="Verificando...">Activar 2FA</SubmitButton>
    </form>
  );
}
