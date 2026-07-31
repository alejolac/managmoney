import "server-only";
import { prisma } from "@/lib/prisma";
import { Decimal, ZERO } from "@/lib/money";
import { createExpenseOrIncome } from "@/lib/transactions";
import {
  daysUntil,
  monthlyCost,
  nextOccurrence,
  pendingOccurrences,
} from "@/lib/recurrences";
import type {
  CommitmentKind,
  Currency,
  Frequency,
  RecurrenceMode,
  TxType,
} from "@/generated/prisma/enums";

export type Commitment = {
  id: string;
  kind: CommitmentKind;
  type: TxType;
  description: string;
  merchant: string | null;
  amount: Decimal;
  currency: Currency;
  frequency: Frequency;
  interval: number;
  /** El monto llevado a "por mes", para poder sumar todo junto. */
  perMonth: Decimal;
  accountName: string;
  categoryName: string | null;
  nextRunDate: Date;
  /** Negativo si ya vencio y todavia no se registro. */
  daysLeft: number;
  /** Cuantas veces cayo sin que nadie la registre. */
  overdue: number;
  mode: RecurrenceMode;
  paused: boolean;
};

export async function listCommitments(
  workspaceId: string,
  today = new Date(),
): Promise<Commitment[]> {
  const rows = await prisma.recurrence.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: { nextRunDate: "asc" },
    include: {
      account: { select: { name: true } },
      category: { select: { name: true } },
    },
  });

  return rows.map((row) => {
    const amount = new Decimal(row.amount.toString());

    const overdue = row.pausedAt
      ? 0
      : pendingOccurrences({
          frequency: row.frequency,
          interval: row.interval,
          nextRunDate: row.nextRunDate,
          endDate: row.endDate,
          until: today,
          dayOfMonth: row.dayOfMonth,
        }).length;

    return {
      id: row.id,
      kind: row.kind,
      type: row.type,
      description: row.description,
      merchant: row.merchant,
      amount,
      currency: row.currency,
      frequency: row.frequency,
      interval: row.interval,
      perMonth: monthlyCost(amount, row.frequency, row.interval),
      accountName: row.account.name,
      categoryName: row.category?.name ?? null,
      nextRunDate: row.nextRunDate,
      daysLeft: daysUntil(row.nextRunDate, today),
      overdue,
      mode: row.mode,
      paused: row.pausedAt !== null,
    };
  });
}

export type CommitmentTotals = {
  /** Gasto fijo mensualizado, por moneda. */
  expense: Map<Currency, Decimal>;
  income: Map<Currency, Decimal>;
  subscriptions: number;
};

/**
 * Cuanto se va por mes en cosas fijas.
 *
 * Se suma por moneda y no se convierte: un total mezclado con una cotizacion de
 * hoy no significa nada. Se dejan afuera los pausados, que no cobran.
 */
export function totalPerMonth(commitments: Commitment[]): CommitmentTotals {
  const expense = new Map<Currency, Decimal>();
  const income = new Map<Currency, Decimal>();
  let subscriptions = 0;

  for (const item of commitments) {
    if (item.paused) continue;

    const bucket = item.type === "INCOME" ? income : expense;
    bucket.set(
      item.currency,
      (bucket.get(item.currency) ?? ZERO).plus(item.perMonth),
    );

    if (item.kind === "SUBSCRIPTION") subscriptions++;
  }

  return { expense, income, subscriptions };
}

/**
 * Registra los vencimientos pendientes de un compromiso y adelanta su proxima
 * fecha.
 *
 * Crea un movimiento por cada fecha que ya paso: si estuviste tres meses sin
 * entrar, quedan los tres cargados, no uno solo. Cada uno queda con la fecha
 * que le corresponde, no la de hoy.
 */
export async function runCommitment(params: {
  workspaceId: string;
  recurrenceId: string;
  baseCurrency: Currency;
  until?: Date;
}): Promise<number> {
  const recurrence = await prisma.recurrence.findFirst({
    where: {
      id: params.recurrenceId,
      workspaceId: params.workspaceId,
      archivedAt: null,
    },
    include: { account: true },
  });

  if (!recurrence || recurrence.pausedAt) return 0;

  const until = params.until ?? new Date();

  const dates = pendingOccurrences({
    frequency: recurrence.frequency,
    interval: recurrence.interval,
    nextRunDate: recurrence.nextRunDate,
    endDate: recurrence.endDate,
    until,
    dayOfMonth: recurrence.dayOfMonth,
  });

  if (dates.length === 0) return 0;

  const amount = new Decimal(recurrence.amount.toString());

  for (const date of dates) {
    await createExpenseOrIncome(
      {
        workspaceId: params.workspaceId,
        type: recurrence.type === "INCOME" ? "INCOME" : "EXPENSE",
        account: recurrence.account,
        amount,
        date,
        categoryId: recurrence.categoryId,
        description: recurrence.description,
        merchant: recurrence.merchant,
        source: "RECURRING",
        recurrenceId: recurrence.id,
      },
      params.baseCurrency,
    );
  }

  const last = dates[dates.length - 1];
  await prisma.recurrence.update({
    where: { id: recurrence.id },
    data: {
      nextRunDate: nextOccurrence({
        frequency: recurrence.frequency,
        interval: recurrence.interval,
        from: last,
        dayOfMonth: recurrence.dayOfMonth,
      }),
    },
  });

  return dates.length;
}

/** Corre todos los compromisos en modo automatico que ya vencieron. */
export async function runDueAutoCommitments(
  workspaceId: string,
  baseCurrency: Currency,
  today = new Date(),
): Promise<number> {
  const due = await prisma.recurrence.findMany({
    where: {
      workspaceId,
      archivedAt: null,
      pausedAt: null,
      mode: "AUTO",
      nextRunDate: { lte: today },
    },
    select: { id: true },
  });

  let created = 0;
  for (const recurrence of due) {
    created += await runCommitment({
      workspaceId,
      recurrenceId: recurrence.id,
      baseCurrency,
      until: today,
    });
  }

  return created;
}
