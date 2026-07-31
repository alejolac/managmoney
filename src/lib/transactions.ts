import "server-only";
import { prisma } from "@/lib/prisma";
import { Decimal, deriveRate, roundMoney, toBaseAmount } from "@/lib/money";
import { resolveSettlementDate } from "@/lib/dates";
import { findReferenceRate } from "@/lib/exchange-rate";
import type { Account } from "@/generated/prisma/client";
import type { Currency, TxSource } from "@/generated/prisma/enums";

export type CreateExpenseOrIncomeInput = {
  workspaceId: string;
  type: "EXPENSE" | "INCOME";
  account: Account;
  amount: Decimal;
  date: Date;
  categoryId?: string | null;
  description?: string | null;
  merchant?: string | null;
  notes?: string | null;
  /** Cotizacion a la moneda base, si la cuenta esta en otra moneda. */
  rate?: Decimal | null;
  source?: TxSource;
  /** Sobre del que sale la plata, si la asignaste a uno. */
  envelopeId?: string | null;
  /** Compromiso que lo genero, si vino de uno. */
  recurrenceId?: string | null;
};

export { resolveSettlementDate };

/**
 * Cotizacion a la moneda base del workspace.
 *
 * Orden: la que ingresaste vos, la de referencia guardada, y si no hay
 * ninguna devuelve null para que la pantalla te la pida en vez de inventar un
 * numero que despues ensucia todos los reportes.
 */
export async function resolveBaseRate(params: {
  currency: Currency;
  baseCurrency: Currency;
  date: Date;
  provided?: Decimal | null;
}): Promise<Decimal | null> {
  if (params.currency === params.baseCurrency) return new Decimal(1);
  if (params.provided && params.provided.gt(0)) return params.provided;

  return findReferenceRate(params.currency, params.baseCurrency, params.date);
}

export async function createExpenseOrIncome(
  input: CreateExpenseOrIncomeInput,
  baseCurrency: Currency,
) {
  const rate = await resolveBaseRate({
    currency: input.account.currency,
    baseCurrency,
    date: input.date,
    provided: input.rate,
  });

  if (!rate) {
    throw new Error(
      `Falta la cotizacion ${input.account.currency} a ${baseCurrency} para esa fecha.`,
    );
  }

  const amount = roundMoney(input.amount, input.account.currency);

  return prisma.transaction.create({
    data: {
      workspaceId: input.workspaceId,
      type: input.type,
      date: input.date,
      settlementDate: resolveSettlementDate(input.account, input.date),
      accountId: input.account.id,
      amount: amount.toString(),
      currency: input.account.currency,
      amountBase: toBaseAmount(amount, rate, baseCurrency).toString(),
      baseRate: rate.toString(),
      categoryId: input.categoryId ?? null,
      description: input.description ?? null,
      merchant: input.merchant ?? null,
      notes: input.notes ?? null,
      envelopeId: input.envelopeId ?? null,
      recurrenceId: input.recurrenceId ?? null,
      source: input.source ?? "MANUAL",
    },
  });
}

export type CreateTransferInput = {
  workspaceId: string;
  from: Account;
  to: Account;
  amount: Decimal;
  toAmount: Decimal;
  date: Date;
  description?: string | null;
  notes?: string | null;
  /** Meta de ahorro a la que aporta esta transferencia. */
  envelopeId?: string | null;
};

/**
 * Transferencia entre cuentas, incluido el cambio de moneda.
 *
 * Los dos montos son reales: sale tanto de una cuenta y entra tanto en la
 * otra. La cotizacion no se busca en ningun lado, se deriva de esos dos
 * numeros, asi que el spread de Itau queda registrado sin que tengas que
 * averiguarlo.
 */
export async function createTransfer(
  input: CreateTransferInput,
  baseCurrency: Currency,
) {
  const amount = roundMoney(input.amount, input.from.currency);
  const toAmount = roundMoney(input.toAmount, input.to.currency);

  // Para expresar la salida en moneda base: si la cuenta origen ya esta en la
  // base, es 1; si la destino lo esta, sale del cambio real; y si ninguna lo
  // esta, hay que ir a la tabla de referencia.
  let baseRate: Decimal | null = null;

  if (input.from.currency === baseCurrency) {
    baseRate = new Decimal(1);
  } else if (input.to.currency === baseCurrency) {
    baseRate = deriveRate(toAmount, amount);
  } else {
    baseRate = await findReferenceRate(
      input.from.currency,
      baseCurrency,
      input.date,
    );
  }

  if (!baseRate) {
    throw new Error(
      `Falta la cotizacion ${input.from.currency} a ${baseCurrency} para esa fecha.`,
    );
  }

  return prisma.transaction.create({
    data: {
      workspaceId: input.workspaceId,
      type: "TRANSFER",
      date: input.date,
      settlementDate: input.date,
      accountId: input.from.id,
      amount: amount.toString(),
      currency: input.from.currency,
      toAccountId: input.to.id,
      toAmount: toAmount.toString(),
      toCurrency: input.to.currency,
      amountBase: toBaseAmount(amount, baseRate, baseCurrency).toString(),
      baseRate: baseRate.toString(),
      // Sacar plata del ahorro para gastarla es la senal de que el mes no
      // cerro. Se marca al crear para que el dashboard no tenga que deducirlo.
      isDissaving: input.from.isSavings && !input.to.isSavings,
      description: input.description ?? null,
      notes: input.notes ?? null,
      envelopeId: input.envelopeId ?? null,
      source: "MANUAL",
    },
  });
}
