"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, RefreshCw } from "lucide-react";
import {
  refreshRates,
  saveManualRate,
  type RatesFormState,
} from "./actions";
import { Field, FormError, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/auth/submit-button";

function FormMessage({ state }: { state: RatesFormState }) {
  if (state.error) return <FormError>{state.error}</FormError>;
  if (!state.message) return null;
  return (
    <p className="rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm text-positive">
      {state.message}
    </p>
  );
}

function RefreshButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Consultando al BCU...
        </>
      ) : (
        <>
          <RefreshCw className="size-4" />
          Actualizar ahora
        </>
      )}
    </Button>
  );
}

export function RefreshRatesForm() {
  const [state, formAction] = useActionState<RatesFormState, FormData>(
    async () => refreshRates(),
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <RefreshButton />
      <FormMessage state={state} />
    </form>
  );
}

export function ManualRateForm({
  currencies,
  today,
}: {
  currencies: string[];
  today: string;
}) {
  const [state, formAction] = useActionState<RatesFormState, FormData>(
    saveManualRate,
    {},
  );
  const [currency, setCurrency] = useState(currencies[0] ?? "USD");

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Moneda" htmlFor="currency">
          <Select
            id="currency"
            name="currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
          >
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={`Pesos por 1 ${currency}`} htmlFor="rate">
          <Input
            id="rate"
            name="rate"
            inputMode="decimal"
            required
            placeholder="40,50"
            className="tabular"
          />
        </Field>

        <Field label="Fecha" htmlFor="date">
          <Input
            id="date"
            name="date"
            type="date"
            defaultValue={today}
            required
            className="tabular"
          />
        </Field>
      </div>

      <SubmitButton pendingLabel="Guardando..." className="">
        Guardar cotizacion
      </SubmitButton>
    </form>
  );
}
