"use client";

import { useActionState } from "react";
import {
  disableTotp,
  regenerateRecoveryCodes,
  type DisableState,
  type RegenerateState,
} from "./actions";
import { Field, FormError, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { RecoveryCodes } from "@/components/auth/recovery-codes";

export function DisableTotpForm() {
  const [state, formAction] = useActionState<DisableState, FormData>(
    disableTotp,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <FormError>{state.error}</FormError>

      <Field
        label="Confirma con tu contrasena"
        htmlFor="disable-password"
        hint="Se pide de nuevo para que nadie pueda bajar la proteccion desde una sesion tuya abierta."
      >
        <Input
          id="disable-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Button type="submit" variant="danger" size="sm">
        Desactivar 2FA
      </Button>
    </form>
  );
}

export function RegenerateCodesForm() {
  const [state, formAction] = useActionState<RegenerateState, FormData>(
    regenerateRecoveryCodes,
    {},
  );

  if (state.codes) return <RecoveryCodes codes={state.codes} />;

  return (
    <form action={formAction} className="space-y-3">
      <FormError>{state.error}</FormError>

      <Field label="Confirma con tu contrasena" htmlFor="regen-password">
        <Input
          id="regen-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Button type="submit" variant="secondary" size="sm">
        Generar codigos nuevos
      </Button>
    </form>
  );
}
