"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { Account } from "@/generated/prisma/client";
import type { AccountFormState } from "./actions";
import { Field, FormError, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/auth/submit-button";
import { CURRENCIES } from "@/lib/money";
import { cn } from "@/lib/cn";

const ACCOUNT_TYPES = [
  { value: "CHECKING", label: "Cuenta bancaria" },
  { value: "SAVINGS", label: "Caja de ahorro" },
  { value: "CASH", label: "Efectivo" },
  { value: "CREDIT_CARD", label: "Tarjeta de credito" },
  { value: "DIGITAL_WALLET", label: "Billetera digital" },
] as const;

const COLORS = [
  "#22c55e",
  "#0ea5e9",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#64748b",
];

export function AccountForm({
  action,
  account,
}: {
  action: (
    state: AccountFormState,
    formData: FormData,
  ) => Promise<AccountFormState>;
  account?: Account;
}) {
  const [state, formAction] = useActionState<AccountFormState, FormData>(
    action,
    {},
  );

  // El tipo se sigue en el cliente porque los campos de tarjeta aparecen y
  // desaparecen segun lo que elijas.
  const [type, setType] = useState<string>(account?.type ?? "CHECKING");
  const [color, setColor] = useState(account?.color ?? "#22c55e");
  const isCard = type === "CREDIT_CARD";

  return (
    <form action={formAction} className="space-y-5">
      <FormError>{state.error}</FormError>

      <Field label="Nombre" htmlFor="name">
        <Input
          id="name"
          name="name"
          required
          maxLength={60}
          defaultValue={account?.name}
          placeholder="Cuenta en pesos"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="type">
          <Select
            id="type"
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            {ACCOUNT_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Moneda"
          htmlFor="currency"
          hint={account ? "No conviene cambiarla si ya tiene movimientos." : undefined}
        >
          <Select
            id="currency"
            name="currency"
            defaultValue={account?.currency ?? "UYU"}
          >
            {Object.values(CURRENCIES).map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.name} ({currency.code})
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Institucion" htmlFor="institution">
          <Input
            id="institution"
            name="institution"
            maxLength={60}
            defaultValue={account?.institution ?? ""}
            placeholder="Itau, BROU, Prex..."
          />
        </Field>

        <Field
          label={isCard ? "Deuda actual" : "Saldo inicial"}
          htmlFor="openingBalance"
          hint="Lo que hay hoy. Desde aca en adelante lo calcula la app."
        >
          <Input
            id="openingBalance"
            name="openingBalance"
            inputMode="decimal"
            defaultValue={account ? String(account.openingBalance) : ""}
            placeholder="0"
            className="tabular"
          />
        </Field>
      </div>

      {isCard ? (
        <div className="grid gap-4 rounded-xl border border-border bg-surface-2 p-4 sm:grid-cols-3">
          <Field label="Limite" htmlFor="creditLimit">
            <Input
              id="creditLimit"
              name="creditLimit"
              inputMode="decimal"
              defaultValue={account?.creditLimit ? String(account.creditLimit) : ""}
              className="tabular"
            />
          </Field>
          <Field label="Dia de cierre" htmlFor="statementClosingDay">
            <Input
              id="statementClosingDay"
              name="statementClosingDay"
              type="number"
              min={1}
              max={31}
              defaultValue={account?.statementClosingDay ?? ""}
              className="tabular"
            />
          </Field>
          <Field label="Dia de vencimiento" htmlFor="paymentDueDay">
            <Input
              id="paymentDueDay"
              name="paymentDueDay"
              type="number"
              min={1}
              max={31}
              defaultValue={account?.paymentDueDay ?? ""}
              className="tabular"
            />
          </Field>
        </div>
      ) : null}

      <Field label="Color">
        <input type="hidden" name="color" value={color} />
        <div className="flex flex-wrap gap-2">
          {COLORS.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={`Color ${option}`}
              aria-pressed={color === option}
              onClick={() => setColor(option)}
              style={{ backgroundColor: option }}
              className={cn(
                "size-8 rounded-full border-2 transition-transform",
                color === option
                  ? "scale-110 border-foreground"
                  : "border-transparent hover:scale-105",
              )}
            />
          ))}
        </div>
      </Field>

      <label className="flex items-start gap-3 rounded-xl border border-border p-4">
        <input
          type="checkbox"
          name="isSavings"
          defaultChecked={account?.isSavings ?? false}
          className="mt-0.5 size-4 accent-[var(--accent)]"
        />
        <span className="text-sm">
          <span className="block font-medium">Es una cuenta de ahorro</span>
          <span className="block text-muted">
            Sacar plata de aca cuenta como desahorro, y el dashboard te avisa
            cuando el mes no cerro.
          </span>
        </span>
      </label>

      <div className="flex gap-2">
        <SubmitButton pendingLabel="Guardando..." className="">
          {account ? "Guardar cambios" : "Crear cuenta"}
        </SubmitButton>
        <Link href="/cuentas">
          <Button type="button" variant="secondary">
            Cancelar
          </Button>
        </Link>
      </div>
    </form>
  );
}
