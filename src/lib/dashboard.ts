import "server-only";
import { prisma } from "@/lib/prisma";
import { Decimal, ZERO } from "@/lib/money";
import type { Period } from "@/lib/periods";

/**
 * Los numeros del dashboard.
 *
 * Todo se mide en la moneda base usando `amountBase`, que quedo congelado con
 * la cotizacion del dia de cada movimiento. Sumar montos de distintas monedas
 * convirtiendolos hoy daria un total que cambia solo cuando se mueve el dolar,
 * y un mes ya cerrado no puede cambiar de valor.
 *
 * Las transferencias no entran ni como gasto ni como ingreso: mover plata de
 * una cuenta a otra no es gastarla. La unica que se mira aparte es el
 * desahorro, que no es un gasto pero si una senal.
 */

export type PeriodSummary = {
  income: Decimal;
  expense: Decimal;
  net: Decimal;
  dissaving: Decimal;
  expenseCount: number;
};

export type CategorySlice = {
  categoryId: string | null;
  name: string;
  color: string;
  amount: Decimal;
  count: number;
  /** Porcentaje del gasto total del periodo, 0 a 100. */
  share: number;
};

export type MonthPoint = {
  month: Date;
  income: Decimal;
  expense: Decimal;
};

export type Dashboard = {
  summary: PeriodSummary;
  categories: CategorySlice[];
  months: MonthPoint[];
};

type SummaryRow = {
  income: string;
  expense: string;
  dissaving: string;
  expense_count: bigint;
};

type CategoryRow = {
  category_id: string | null;
  name: string | null;
  color: string | null;
  amount: string;
  count: bigint;
};

type MonthRow = {
  month: Date;
  income: string;
  expense: string;
};

export async function getDashboard(
  workspaceId: string,
  period: Period,
  monthsBack = 12,
): Promise<Dashboard> {
  const seriesFrom = new Date(
    Date.UTC(
      period.to.getUTCFullYear(),
      period.to.getUTCMonth() - monthsBack,
      1,
    ),
  );

  // Tres consultas en paralelo: en tiempo de pared cuestan casi lo mismo que
  // una sola, porque lo que domina es la ida y vuelta a la base.
  const [summaryRows, categoryRows, monthRows] = await Promise.all([
    prisma.$queryRaw<SummaryRow[]>`
      SELECT
        COALESCE(SUM("amountBase") FILTER (WHERE type = 'INCOME'), 0)::text  AS income,
        COALESCE(SUM("amountBase") FILTER (WHERE type = 'EXPENSE'), 0)::text AS expense,
        COALESCE(SUM("amountBase") FILTER (WHERE "isDissaving"), 0)::text    AS dissaving,
        COUNT(*) FILTER (WHERE type = 'EXPENSE')                             AS expense_count
      FROM "Transaction"
      WHERE "workspaceId" = ${workspaceId}
        AND "excludeFromStats" = false
        AND "settlementDate" >= ${period.from}
        AND "settlementDate" <  ${period.to}
    `,

    // Se agrupa por la categoria de mas arriba: si cargaste "Servicios > UTE",
    // en el grafico pesa dentro de "Servicios". El detalle se ve al entrar.
    prisma.$queryRaw<CategoryRow[]>`
      SELECT COALESCE(p.id, c.id)             AS category_id,
             COALESCE(p.name, c.name)         AS name,
             COALESCE(p.color, c.color)       AS color,
             SUM(t."amountBase")::text        AS amount,
             COUNT(*)                         AS count
      FROM "Transaction" t
      LEFT JOIN "Category" c ON c.id = t."categoryId"
      LEFT JOIN "Category" p ON p.id = c."parentId"
      WHERE t."workspaceId" = ${workspaceId}
        AND t.type = 'EXPENSE'
        AND t."excludeFromStats" = false
        AND t."settlementDate" >= ${period.from}
        AND t."settlementDate" <  ${period.to}
      GROUP BY COALESCE(p.id, c.id), COALESCE(p.name, c.name), COALESCE(p.color, c.color)
      ORDER BY SUM(t."amountBase") DESC
    `,

    prisma.$queryRaw<MonthRow[]>`
      SELECT date_trunc('month', "settlementDate") AS month,
             COALESCE(SUM("amountBase") FILTER (WHERE type = 'INCOME'), 0)::text  AS income,
             COALESCE(SUM("amountBase") FILTER (WHERE type = 'EXPENSE'), 0)::text AS expense
      FROM "Transaction"
      WHERE "workspaceId" = ${workspaceId}
        AND "excludeFromStats" = false
        AND "settlementDate" >= ${seriesFrom}
        AND "settlementDate" <  ${period.to}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
  ]);

  const row = summaryRows[0];
  const income = new Decimal(row?.income ?? 0);
  const expense = new Decimal(row?.expense ?? 0);

  const summary: PeriodSummary = {
    income,
    expense,
    net: income.minus(expense),
    dissaving: new Decimal(row?.dissaving ?? 0),
    expenseCount: Number(row?.expense_count ?? 0),
  };

  const categories: CategorySlice[] = categoryRows.map((slice) => {
    const amount = new Decimal(slice.amount);
    return {
      categoryId: slice.category_id,
      name: slice.name ?? "Sin categorizar",
      color: slice.color ?? "#64748b",
      amount,
      count: Number(slice.count),
      share: expense.isZero()
        ? 0
        : amount.div(expense).mul(100).toDecimalPlaces(1).toNumber(),
    };
  });

  return {
    summary,
    categories,
    months: monthRows.map((point) => ({
      month: point.month,
      income: new Decimal(point.income),
      expense: new Decimal(point.expense),
    })),
  };
}

/** Cuanto se gasto de mas o de menos que el periodo anterior, en porcentaje. */
export function compareToPrevious(
  current: Decimal,
  previous: Decimal,
): number | null {
  if (previous.lte(0)) return null;
  return current.minus(previous).div(previous).mul(100).toDecimalPlaces(0).toNumber();
}

export const EMPTY_SUMMARY: PeriodSummary = {
  income: ZERO,
  expense: ZERO,
  net: ZERO,
  dissaving: ZERO,
  expenseCount: 0,
};
