"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createCommitment, type CommitmentFormState } from "../actions";
import { Field, FormError, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/auth/submit-button";
import { CURRENCIES, formatMoney, parseAmount } from "@/lib/money";
import {
  FREQUENCY_LABELS,
  monthlyCost,
  upcomingOccurrences,
} from "@/lib/recurrences";
import { formatDate, toDateOnly } from "@/lib/dates";
import { cn } from "@/lib/cn";
import type { Currency, Frequency } from "@/generated/prisma/enums";

type AccountOption = { id: string; name: string; currency: string };
type CategoryOption = {
  id: string;
  name: string;
  kind: string;
  parentName: string | null;
};

const TABS = [
  { value: "SUBSCRIPTION", label: "Suscripcion" },
  { value: "FIXED_EXPENSE", label: "Gasto fijo" },
  { value: "INCOME", label: "Ingreso" },
] as const;

const FREQUENCIES = Object.keys(FREQUENCY_LABELS) as Frequency[];

export function CommitmentForm({
  accounts,
  categories,
  today,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  today: string;
}) {
  const [state, formAction] = useActionState<CommitmentFormState, FormData>(
    createCommitment,
    {},
  );

  const [kind, setKind] = useState<string>("SUBSCRIPTION");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("MONTHLY");
  const [startDate, setStartDate] = useState(today);

  const account = accounts.find((item) => item.id === accountId);
  const isIncome = kind === "INCOME";
  const currency = (account?.currency ?? "UYU") as Currency;

  const visibleCategories = useMemo(
    () =>
      categories.filter((category) =>
        isIncome ? category.kind === "INCOME" : category.kind === "EXPENSE",
      ),
    [categories, isIncome],
  );

  /** Vista previa con las mismas funciones que usa el servidor. */
  const preview = useMemo(() => {
    const parsed = parseAmount(amount);
    if (!parsed || parsed.lte(0)) return null;

    const start = toDateOnly(startDate);

    return {
      perMonth: monthlyCost(parsed, frequency),
      dates: upcomingOccurrences({
        frequency,
        startDate: start,
        dayOfMonth: start.getUTCDate(),
        count: 4,
      }),
    };
  }, [amount, frequency, startDate]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="kind" value={kind} />

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

      <FormError>{state.error}</FormError>

      <Field label="Que es" htmlFor="description">
        <Input
          id="description"
          name="description"
          maxLength={140}
          required
          autoFocus
          placeholder={
            kind === "SUBSCRIPTION"
              ? "Netflix"
              : kind === "INCOME"
                ? "Sueldo"
                : "Alquiler"
          }
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Monto" htmlFor="amount">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
              {CURRENCIES[currency].symbol}
            </span>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              required
              placeholder="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="pl-10 text-lg tabular"
            />
          </div>
        </Field>

        <Field label="Cada cuanto" htmlFor="frequency">
          <Select
            id="frequency"
            name="frequency"
            value={frequency}
            onChange={(event) =>
              setFrequency(event.target.value as Frequency)
            }
          >
            {FREQUENCIES.map((value) => (
              <option key={value} value={value}>
                {FREQUENCY_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={isIncome ? "Entra en" : "Se paga con"}
          htmlFor="accountId"
        >
          <Select
            id="accountId"
            name="accountId"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            required
          >
            {accounts.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name} ({option.currency})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Categoria" htmlFor="categoryId">
          <Select id="categoryId" name="categoryId" defaultValue="">
            <option value="">Sin categorizar</option>
            {visibleCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.parentName
                  ? `${category.parentName} › ${category.name}`
                  : category.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Proximo vencimiento"
          htmlFor="startDate"
          hint="El dia del mes sale de aca."
        >
          <Input
            id="startDate"
            name="startDate"
            type="date"
            required
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="tabular"
          />
        </Field>

        <Field
          label="Hasta cuando"
          htmlFor="endDate"
          hint="Opcional. Para algo que ya sabés que termina."
        >
          <Input id="endDate" name="endDate" type="date" className="tabular" />
        </Field>
      </div>

      <Field
        label="Cuando toca"
        htmlFor="mode"
        hint="Por defecto te avisa y confirmás vos, para que la app no invente movimientos que capaz no pasaron."
      >
        <Select id="mode" name="mode" defaultValue="CONFIRM">
          <option value="CONFIRM">Avisame y lo confirmo</option>
          <option value="AUTO">Cargalo solo</option>
        </Select>
      </Field>

      {preview ? (
        <div className="rounded-xl border border-border bg-surface-2 p-4 text-sm">
          <p className="font-medium">
            {formatMoney(preview.perMonth, currency)} por mes
          </p>
          <p className="mt-2 text-muted">
            Proximos: {preview.dates.map((date) => formatDate(date)).join(" · ")}
          </p>
        </div>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton pendingLabel="Guardando..." className="">
          Guardar
        </SubmitButton>
        <Link href="/compromisos">
          <Button type="button" variant="secondary">
            Cancelar
          </Button>
        </Link>
      </div>
    </form>
  );
}
