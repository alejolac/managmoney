"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createPlan, type PlanFormState } from "../actions";
import { Field, FormError, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/auth/submit-button";
import { CURRENCIES, formatMoney, parseAmount } from "@/lib/money";
import { installmentDueDates, splitInstallments } from "@/lib/installments";
import { formatDate, toDateOnly } from "@/lib/dates";
import type { Currency } from "@/generated/prisma/enums";

type AccountOption = {
  id: string;
  name: string;
  currency: string;
  type: string;
  statementClosingDay: number | null;
  paymentDueDay: number | null;
};

type CategoryOption = {
  id: string;
  name: string;
  parentName: string | null;
};

/** Los planes que ofrece cualquier comercio de aca, mas el clasico de 3. */
const COMMON_COUNTS = [3, 6, 10, 12, 18, 24];

export function PlanForm({
  accounts,
  categories,
  baseCurrency,
  today,
  knownRate,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  baseCurrency: string;
  today: string;
  knownRate: string | null;
}) {
  const [state, formAction] = useActionState<PlanFormState, FormData>(
    createPlan,
    {},
  );

  // La tarjeta primero: es lo normal para una compra en cuotas.
  const [accountId, setAccountId] = useState(
    accounts.find((item) => item.type === "CREDIT_CARD")?.id ??
      accounts[0]?.id ??
      "",
  );
  const [total, setTotal] = useState("");
  const [count, setCount] = useState(6);
  const [purchaseDate, setPurchaseDate] = useState(today);

  const account = accounts.find((item) => item.id === accountId);
  const needsRate = account !== undefined && account.currency !== baseCurrency;

  /**
   * La vista previa se calcula aca mismo, con las mismas funciones que usa el
   * servidor al guardar. Ver el vencimiento de la ultima cuota antes de
   * confirmar es medio el punto de la pantalla.
   */
  const preview = useMemo(() => {
    const amount = parseAmount(total);
    if (!account || !amount || amount.lte(0) || count < 2) return null;

    const currency = account.currency as Currency;
    const amounts = splitInstallments(amount, count, currency);
    const dates = installmentDueDates(
      account,
      toDateOnly(purchaseDate),
      count,
    );

    return {
      currency,
      first: amounts[0],
      rest: amounts[count - 1],
      uneven: !amounts[0].equals(amounts[count - 1]),
      firstDue: dates[0],
      lastDue: dates[count - 1],
      deferred: dates[0].getTime() !== toDateOnly(purchaseDate).getTime(),
    };
  }, [account, total, count, purchaseDate]);

  return (
    <form action={formAction} className="space-y-5">
      <FormError>{state.error}</FormError>

      <Field label="Que compraste" htmlFor="description">
        <Input
          id="description"
          name="description"
          maxLength={140}
          required
          autoFocus
          placeholder="Heladera"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Total de la compra" htmlFor="totalAmount">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
              {account
                ? CURRENCIES[account.currency as Currency].symbol
                : ""}
            </span>
            <Input
              id="totalAmount"
              name="totalAmount"
              inputMode="decimal"
              required
              placeholder="0"
              value={total}
              onChange={(event) => setTotal(event.target.value)}
              className="pl-10 text-lg tabular"
            />
          </div>
        </Field>

        <Field label="Cuotas" htmlFor="count">
          <Input
            id="count"
            name="count"
            type="number"
            min={2}
            max={120}
            required
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            className="tabular"
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {COMMON_COUNTS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setCount(value)}
            className={
              count === value
                ? "rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
                : "rounded-lg bg-surface-2 px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground"
            }
          >
            {value}
          </button>
        ))}
      </div>

      <Field
        label="Tarjeta o cuenta"
        htmlFor="accountId"
        hint={
          account?.type === "CREDIT_CARD" &&
          account.statementClosingDay !== null
            ? `Cierra el ${account.statementClosingDay} y vence el ${account.paymentDueDay} de cada mes.`
            : "Si la cargás en una tarjeta con cierre configurado, las cuotas se fechan solas segun el resumen."
        }
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha de la compra" htmlFor="purchaseDate">
          <Input
            id="purchaseDate"
            name="purchaseDate"
            type="date"
            required
            value={purchaseDate}
            onChange={(event) => setPurchaseDate(event.target.value)}
            className="tabular"
          />
        </Field>

        <Field label="Categoria" htmlFor="categoryId">
          <Select id="categoryId" name="categoryId" defaultValue="">
            <option value="">Sin categorizar</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.parentName
                  ? `${category.parentName} › ${category.name}`
                  : category.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Comercio" htmlFor="merchant">
        <Input
          id="merchant"
          name="merchant"
          maxLength={80}
          placeholder="Opcional"
        />
      </Field>

      {needsRate ? (
        <Field
          label={`Cotizacion ${account?.currency} a ${baseCurrency}`}
          htmlFor="rate"
          hint="Se congela en las cuotas para poder ver los reportes en una sola moneda."
        >
          <Input
            id="rate"
            name="rate"
            inputMode="decimal"
            defaultValue={knownRate ?? ""}
            placeholder="40,50"
            className="tabular"
          />
        </Field>
      ) : null}

      {preview ? (
        <div className="rounded-xl border border-border bg-surface-2 p-4 text-sm">
          <p className="font-medium">
            {count} cuotas de {formatMoney(preview.rest, preview.currency)}
          </p>

          {preview.uneven ? (
            <p className="mt-1 text-xs text-muted">
              La primera es de {formatMoney(preview.first, preview.currency)}:
              se lleva el centavo que sobra del redondeo para que las cuotas
              sumen exacto el total.
            </p>
          ) : null}

          <p className="mt-2 text-muted">
            Primera el {formatDate(preview.firstDue)}, ultima el{" "}
            {formatDate(preview.lastDue)}.
          </p>

          {preview.deferred ? (
            <p className="mt-1 text-xs text-muted">
              La compra es de hoy pero la primera cuota recien impacta con el
              vencimiento del resumen, asi que no te ensucia el saldo de este
              mes.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2">
        <SubmitButton pendingLabel="Generando cuotas..." className="">
          Guardar
        </SubmitButton>
        <Link href="/cuotas">
          <Button type="button" variant="secondary">
            Cancelar
          </Button>
        </Link>
      </div>
    </form>
  );
}
