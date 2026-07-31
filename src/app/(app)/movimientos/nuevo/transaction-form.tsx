"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { createTransaction, type TxFormState } from "../actions";
import { Field, FormError, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/auth/submit-button";
import { CURRENCIES } from "@/lib/money";
import { cn } from "@/lib/cn";

type AccountOption = {
  id: string;
  name: string;
  currency: string;
  type: string;
};

type CategoryOption = {
  id: string;
  name: string;
  kind: string;
  parentName: string | null;
};

type EnvelopeOption = {
  id: string;
  name: string;
  kind: string;
  currency: string;
};

const TABS = [
  { value: "EXPENSE", label: "Gasto" },
  { value: "INCOME", label: "Ingreso" },
  { value: "TRANSFER", label: "Transferencia" },
] as const;

export function TransactionForm({
  accounts,
  categories,
  envelopes,
  baseCurrency,
  today,
  knownRate,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  envelopes: EnvelopeOption[];
  baseCurrency: string;
  today: string;
  knownRate: string | null;
}) {
  const [state, formAction] = useActionState<TxFormState, FormData>(
    createTransaction,
    {},
  );

  const [type, setType] = useState<string>("EXPENSE");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? "");

  const account = accounts.find((item) => item.id === accountId);
  const toAccount = accounts.find((item) => item.id === toAccountId);

  const isTransfer = type === "TRANSFER";
  const crossCurrencyTransfer =
    isTransfer && account && toAccount && account.currency !== toAccount.currency;

  // En un gasto en moneda extranjera hace falta saber a cuanto convertirlo
  // para los reportes. En una transferencia no: sale de los dos montos.
  const needsRate =
    !isTransfer && account !== undefined && account.currency !== baseCurrency;

  const visibleCategories = useMemo(
    () =>
      categories.filter((category) =>
        type === "INCOME" ? category.kind === "INCOME" : category.kind === "EXPENSE",
      ),
    [categories, type],
  );

  /**
   * Que sobres se pueden elegir.
   *
   * Un sobre solo cuenta movimientos de su misma moneda, asi que ofrecer uno de
   * dolares para un gasto en pesos seria ofrecer algo que despues no suma. En
   * un gasto se compara con la cuenta de origen; en una transferencia, con la
   * de destino, que es donde entra la plata de una meta.
   */
  const visibleEnvelopes = useMemo(() => {
    const currency = isTransfer ? toAccount?.currency : account?.currency;
    if (!currency) return [];

    return envelopes.filter(
      (envelope) =>
        envelope.currency === currency &&
        (isTransfer ? envelope.kind === "GOAL" : envelope.kind === "MONTHLY"),
    );
  }, [envelopes, isTransfer, account, toAccount]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="type" value={type} />

      <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setType(tab.value)}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              type === tab.value
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <FormError>{state.error}</FormError>

      <Field
        label={isTransfer ? "Sale de" : "Cuenta"}
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

      <Field
        label={isTransfer ? "Monto que sale" : "Monto"}
        htmlFor="amount"
      >
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
            {account
              ? CURRENCIES[account.currency as keyof typeof CURRENCIES].symbol
              : ""}
          </span>
          <Input
            id="amount"
            name="amount"
            inputMode="decimal"
            required
            autoFocus
            placeholder="0"
            className="pl-10 text-lg tabular"
          />
        </div>
      </Field>

      {isTransfer ? (
        <>
          <Field label="Entra en" htmlFor="toAccountId">
            <Select
              id="toAccountId"
              name="toAccountId"
              value={toAccountId}
              onChange={(event) => setToAccountId(event.target.value)}
              required
            >
              {accounts
                .filter((option) => option.id !== accountId)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.currency})
                  </option>
                ))}
            </Select>
          </Field>

          {crossCurrencyTransfer ? (
            <Field
              label="Monto que entra"
              htmlFor="toAmount"
              hint="Poné los dos montos reales de la operacion. La cotizacion efectiva, con el spread del banco incluido, sale sola."
            >
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                  {toAccount
                    ? CURRENCIES[toAccount.currency as keyof typeof CURRENCIES]
                        .symbol
                    : ""}
                </span>
                <Input
                  id="toAmount"
                  name="toAmount"
                  inputMode="decimal"
                  required
                  placeholder="0"
                  className="pl-10 text-lg tabular"
                />
              </div>
            </Field>
          ) : null}
        </>
      ) : (
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
      )}

      {visibleEnvelopes.length > 0 ? (
        <Field
          label={isTransfer ? "Aporta a la meta" : "Sale del sobre"}
          htmlFor="envelopeId"
          hint={
            isTransfer
              ? "Opcional. Si es plata que estas juntando para algo, marcalo aca."
              : "Opcional. Descuenta de lo que te queda en ese sobre este mes."
          }
        >
          <Select id="envelopeId" name="envelopeId" defaultValue="">
            <option value="">Ninguno</option>
            {visibleEnvelopes.map((envelope) => (
              <option key={envelope.id} value={envelope.id}>
                {envelope.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {needsRate ? (
        <Field
          label={`Cotizacion ${account?.currency} a ${baseCurrency}`}
          htmlFor="rate"
          hint="Solo se usa para mostrar los reportes en una sola moneda. No mueve plata."
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

      <div className="grid gap-4 sm:grid-cols-2">
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

        <Field label="Descripcion" htmlFor="description">
          <Input
            id="description"
            name="description"
            maxLength={140}
            placeholder="Opcional"
          />
        </Field>
      </div>

      <div className="flex gap-2">
        <SubmitButton pendingLabel="Guardando..." className="">
          Guardar
        </SubmitButton>
        <Link href="/movimientos">
          <Button type="button" variant="secondary">
            Cancelar
          </Button>
        </Link>
      </div>
    </form>
  );
}
