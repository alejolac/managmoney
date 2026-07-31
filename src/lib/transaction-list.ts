import "server-only";
import { prisma } from "@/lib/prisma";
import { Decimal, ZERO } from "@/lib/money";
import { toDateOnly } from "@/lib/dates";
import { UNCATEGORIZED, type TransactionFilters } from "@/lib/transaction-filters";
import type { Prisma } from "@/generated/prisma/client";

export const PAGE_SIZE = 50;

/**
 * Traduce los filtros de la URL a una consulta.
 *
 * Todo se acumula en `AND` en vez de escribirse suelto sobre el objeto: varios
 * filtros usan `OR` por dentro (una cuenta matchea las dos puntas de una
 * transferencia, el texto busca en tres campos) y si se pisan en la raiz uno se
 * come al otro sin avisar.
 */
export function buildWhere(
  workspaceId: string,
  filters: TransactionFilters,
): Prisma.TransactionWhereInput {
  const and: Prisma.TransactionWhereInput[] = [];

  if (filters.type) and.push({ type: filters.type });
  if (filters.planId) and.push({ installmentPlanId: filters.planId });
  if (filters.envelopeId) and.push({ envelopeId: filters.envelopeId });

  if (filters.categoryId === UNCATEGORIZED) {
    and.push({ categoryId: null });
  } else if (filters.categoryId) {
    // Filtrar por una categoria trae tambien lo cargado en sus hijas: el
    // dashboard agrupa "Servicios > UTE" dentro de "Servicios", y al entrar
    // desde ahi tiene que aparecer el gasto de UTE. Va como relacion y no como
    // lista de ids para no gastar una consulta extra en buscar las hijas.
    and.push({
      OR: [
        { categoryId: filters.categoryId },
        { category: { parentId: filters.categoryId } },
      ],
    });
  }

  if (filters.accountId) {
    // Una transferencia aparece filtrando por cualquiera de las dos cuentas.
    and.push({
      OR: [
        { accountId: filters.accountId },
        { toAccountId: filters.accountId },
      ],
    });
  }

  if (filters.currency) {
    and.push({
      OR: [{ currency: filters.currency }, { toCurrency: filters.currency }],
    });
  }

  // El rango va sobre la fecha en la que impacta la plata, no la de la compra:
  // la cuota de agosto de algo comprado en marzo pesa en agosto.
  if (filters.from || filters.to) {
    and.push({
      settlementDate: {
        ...(filters.from ? { gte: toDateOnly(filters.from) } : {}),
        // El "hasta" incluye todo ese dia.
        ...(filters.to
          ? { lt: new Date(toDateOnly(filters.to).getTime() + 86_400_000) }
          : {}),
      },
    });
  }

  if (filters.q) {
    and.push({
      OR: [
        { description: { contains: filters.q, mode: "insensitive" } },
        { merchant: { contains: filters.q, mode: "insensitive" } },
        { notes: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }

  return { workspaceId, ...(and.length > 0 ? { AND: and } : {}) };
}

export type TransactionListResult = {
  transactions: Awaited<ReturnType<typeof findTransactions>>;
  total: number;
  page: number;
  pageCount: number;
  /** Totales en la moneda base del workspace, de todo lo filtrado. */
  expense: Decimal;
  income: Decimal;
};

function findTransactions(where: Prisma.TransactionWhereInput, skip: number) {
  return prisma.transaction.findMany({
    where,
    // Por fecha de impacto, igual que el filtro y que los saldos.
    orderBy: [{ settlementDate: "desc" }, { createdAt: "desc" }],
    skip,
    take: PAGE_SIZE,
    include: {
      account: { select: { name: true } },
      toAccount: { select: { name: true } },
      category: { select: { name: true } },
      installmentPlan: { select: { count: true } },
    },
  });
}

export async function listTransactions(
  workspaceId: string,
  filters: TransactionFilters,
): Promise<TransactionListResult> {
  const where = buildWhere(workspaceId, filters);
  const skip = (filters.page - 1) * PAGE_SIZE;

  // Las dos consultas salen juntas: dos idas y vueltas que en tiempo de pared
  // cuestan menos que hacerlas una despues de la otra.
  //
  // Medido: esta pantalla tarda ~300 ms contra Neon desde Uruguay, el doble que
  // las demas, porque el `groupBy` no termina de resolverse en paralelo con el
  // `findMany`. Se probo pasarlo a `$queryRaw`, que baja a ~150 ms, y se
  // descarto: obligaba a escribir los filtros dos veces, una en `buildWhere` y
  // otra en SQL a mano, y dos versiones del mismo filtro terminan discrepando
  // sin que nadie se entere. Los 150 ms de diferencia son casi todos latencia
  // hasta Ohio; corriendo en Vercel, al lado de la base, son unos 15.
  const [transactions, groups] = await Promise.all([
    findTransactions(where, skip),
    prisma.transaction.groupBy({
      by: ["type"],
      where,
      _sum: { amountBase: true },
      _count: { _all: true },
    }),
  ]);

  let total = 0;
  let expense = ZERO;
  let income = ZERO;

  for (const group of groups) {
    total += group._count._all;
    const sum = new Decimal((group._sum.amountBase ?? 0).toString());
    if (group.type === "EXPENSE") expense = expense.plus(sum);
    if (group.type === "INCOME") income = income.plus(sum);
  }

  return {
    transactions,
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    expense,
    income,
  };
}
