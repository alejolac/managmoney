import "server-only";
import { prisma } from "@/lib/prisma";
import { Decimal, ZERO } from "@/lib/money";
import type { Account } from "@/generated/prisma/client";

export type AccountWithBalance = Account & {
  /** Plata que hay hoy. En tarjetas es negativo: es lo que debes. */
  balance: Decimal;
  /** Cuotas y movimientos ya cargados que todavia no vencieron. */
  upcoming: Decimal;
};

/**
 * Saldo de cada cuenta.
 *
 * Se calcula con agregados y no trayendo las transacciones a memoria: con
 * varios anos de movimientos, sumar en JavaScript se vuelve lento y ademas
 * obliga a paginar.
 *
 * Solo cuentan los movimientos ya vencidos (`settlementDate <= hoy`). Una
 * compra en 12 cuotas no te vacia la cuenta hoy: impacta mes a mes. Lo que
 * falta vencer se devuelve aparte en `upcoming`.
 */
export async function getAccountsWithBalances(
  workspaceId: string,
  options: { includeArchived?: boolean } = {},
): Promise<AccountWithBalance[]> {
  // Dos consultas y no seis. Cada movimiento aporta un delta con signo, y el
  // otro lado de una transferencia entra al UNION como una fila positiva sobre
  // la cuenta destino. Antes esto eran cinco agregados sueltos que había que
  // cruzar en JavaScript.
  const [accounts, deltas] = await Promise.all([
    prisma.account.findMany({
      where: {
        workspaceId,
        ...(options.includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),

    prisma.$queryRaw<
      { accountId: string; settled: string | null; pending: string | null }[]
    >`
      WITH movements AS (
        SELECT "accountId",
               CASE WHEN type = 'INCOME' THEN amount ELSE -amount END AS delta,
               "settlementDate"
        FROM "Transaction"
        WHERE "workspaceId" = ${workspaceId}

        UNION ALL

        SELECT "toAccountId", "toAmount", "settlementDate"
        FROM "Transaction"
        WHERE "workspaceId" = ${workspaceId}
          AND type = 'TRANSFER'
          AND "toAccountId" IS NOT NULL
      )
      SELECT "accountId",
             COALESCE(SUM(delta) FILTER (WHERE "settlementDate" <= NOW()), 0)::text AS settled,
             COALESCE(SUM(delta) FILTER (WHERE "settlementDate" >  NOW()), 0)::text AS pending
      FROM movements
      GROUP BY "accountId"
    `,
  ]);

  const byAccount = new Map(deltas.map((row) => [row.accountId, row]));

  return accounts.map((account) => {
    const row = byAccount.get(account.id);

    return {
      ...account,
      balance: new Decimal(account.openingBalance).plus(
        row?.settled ? new Decimal(row.settled) : ZERO,
      ),
      upcoming: row?.pending ? new Decimal(row.pending) : ZERO,
    };
  });
}

/** Agrupa los saldos por moneda, porque sumar pesos con dolares no significa nada. */
export function totalsByCurrency(accounts: AccountWithBalance[]) {
  const totals = new Map<string, Decimal>();

  for (const account of accounts) {
    // Las tarjetas son deuda, no plata disponible: no entran en el total.
    if (account.type === "CREDIT_CARD") continue;

    const current = totals.get(account.currency) ?? ZERO;
    totals.set(account.currency, current.plus(account.balance));
  }

  return totals;
}
