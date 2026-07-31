"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createEnvelope, type EnvelopeFormState } from "../actions";
import { Field, FormError, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/auth/submit-button";
import { CURRENCIES } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { Currency } from "@/generated/prisma/enums";

const TABS = [
  {
    value: "MONTHLY",
    label: "Sobre del mes",
    hint: "Separás un monto cada mes y ves cuanto te queda.",
  },
  {
    value: "GOAL",
    label: "Meta de ahorro",
    hint: "Acumulás hasta llegar a un numero.",
  },
] as const;

const COLORS = [
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#64748b",
];

export function EnvelopeForm({
  currencies,
  baseCurrency,
}: {
  currencies: Currency[];
  baseCurrency: string;
}) {
  const [state, formAction] = useActionState<EnvelopeFormState, FormData>(
    createEnvelope,
    {},
  );

  const [kind, setKind] = useState<"MONTHLY" | "GOAL">("MONTHLY");
  const [currency, setCurrency] = useState(baseCurrency);
  const [color, setColor] = useState(COLORS[0]);

  const isGoal = kind === "GOAL";
  const symbol = CURRENCIES[currency as Currency].symbol;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="color" value={color} />

      <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setKind(tab.value)}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              kind === tab.value
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted">
        {TABS.find((tab) => tab.value === kind)?.hint}
      </p>

      <FormError>{state.error}</FormError>

      <Field label="Nombre" htmlFor="name">
        <Input
          id="name"
          name="name"
          maxLength={40}
          required
          autoFocus
          placeholder={isGoal ? "Viaje" : "Salidas"}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={isGoal ? "Quiero llegar a" : "Cuanto le asigno por mes"}
          htmlFor={isGoal ? "targetAmount" : "monthlyAmount"}
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
              {symbol}
            </span>
            <Input
              id={isGoal ? "targetAmount" : "monthlyAmount"}
              name={isGoal ? "targetAmount" : "monthlyAmount"}
              inputMode="decimal"
              required
              placeholder="0"
              className="pl-10 text-lg tabular"
            />
          </div>
        </Field>

        <Field
          label="Moneda"
          htmlFor="currency"
          hint="El sobre cuenta solo movimientos de esta moneda."
        >
          <Select
            id="currency"
            name="currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
          >
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code} — {CURRENCIES[code].name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {isGoal ? (
        <Field
          label="Para cuando"
          htmlFor="targetDate"
          hint="Opcional. Solo sirve para saber si vas en tiempo."
        >
          <Input id="targetDate" name="targetDate" type="date" className="tabular" />
        </Field>
      ) : (
        <Field
          label="Si sobra plata a fin de mes"
          htmlFor="rollover"
          hint="Por defecto el sobre arranca limpio cada mes."
        >
          <Select id="rollover" name="rollover" defaultValue="RESET">
            <option value="RESET">Se reinicia</option>
            <option value="CARRY_OVER">Pasa al mes siguiente</option>
          </Select>
        </Field>
      )}

      <div className="space-y-1.5">
        <span className="block text-sm font-medium">Color</span>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setColor(option)}
              aria-label={`Color ${option}`}
              aria-pressed={color === option}
              className={cn(
                "size-8 rounded-full transition-transform",
                color === option
                  ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface"
                  : "hover:scale-110",
              )}
              style={{ backgroundColor: option }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <SubmitButton pendingLabel="Creando..." className="">
          Crear sobre
        </SubmitButton>
        <Link href="/sobres">
          <Button type="button" variant="secondary">
            Cancelar
          </Button>
        </Link>
      </div>
    </form>
  );
}
