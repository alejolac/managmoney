/**
 * Verifica que la consulta de saldos optimizada da lo mismo que sumar los
 * movimientos a mano. Uso: npm run verify:balances
 *
 * Crea datos de prueba, compara, y borra todo al terminar.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import Decimal from "decimal.js";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) failures++;
}

/** Copia de la consulta que usa la app. */
async function balancesFromSql(workspaceId: string) {
  const rows = await prisma.$queryRaw<
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
  `;
  return new Map(rows.map((row) => [row.accountId, row]));
}

async function main() {
  const past = new Date(Date.now() - 86_400_000);
  const future = new Date(Date.now() + 30 * 86_400_000);

  const workspace = await prisma.workspace.create({
    data: { name: "__verify_balances__", baseCurrency: "UYU" },
  });

  const pesos = await prisma.account.create({
    data: {
      workspaceId: workspace.id,
      name: "Pesos",
      type: "CHECKING",
      currency: "UYU",
      openingBalance: "1000",
    },
  });

  const dolares = await prisma.account.create({
    data: {
      workspaceId: workspace.id,
      name: "Dolares",
      type: "SAVINGS",
      currency: "USD",
      openingBalance: "0",
      isSavings: true,
    },
  });

  const tarjeta = await prisma.account.create({
    data: {
      workspaceId: workspace.id,
      name: "Tarjeta",
      type: "CREDIT_CARD",
      currency: "UYU",
      openingBalance: "0",
      statementClosingDay: 25,
      paymentDueDay: 5,
    },
  });

  const base = {
    workspaceId: workspace.id,
    currency: "UYU" as const,
    baseRate: "1",
  };

  await prisma.transaction.createMany({
    data: [
      // Sueldo: +50.000
      {
        ...base,
        type: "INCOME",
        accountId: pesos.id,
        amount: "50000",
        amountBase: "50000",
        date: past,
        settlementDate: past,
      },
      // Supermercado: -3.500
      {
        ...base,
        type: "EXPENSE",
        accountId: pesos.id,
        amount: "3500",
        amountBase: "3500",
        date: past,
        settlementDate: past,
      },
      // Cambio: salen 40.000 pesos, entran 1.000 dolares
      {
        ...base,
        type: "TRANSFER",
        accountId: pesos.id,
        amount: "40000",
        amountBase: "40000",
        toAccountId: dolares.id,
        toAmount: "1000",
        toCurrency: "USD",
        date: past,
        settlementDate: past,
      },
      // Cuota de tarjeta que YA vencio: -2.000
      {
        ...base,
        type: "EXPENSE",
        accountId: tarjeta.id,
        amount: "2000",
        amountBase: "2000",
        date: past,
        settlementDate: past,
      },
      // Cuota de tarjeta que vence el mes que viene: no toca el saldo de hoy
      {
        ...base,
        type: "EXPENSE",
        accountId: tarjeta.id,
        amount: "7000",
        amountBase: "7000",
        date: past,
        settlementDate: future,
      },
    ],
  });

  const balances = await balancesFromSql(workspace.id);

  const pesosRow = balances.get(pesos.id);
  const pesosBalance = new Decimal(1000).plus(pesosRow?.settled ?? 0);
  check(
    "pesos: 1.000 + 50.000 - 3.500 - 40.000 = 7.500",
    pesosBalance.equals(7500),
    pesosBalance.toString(),
  );

  const dolaresRow = balances.get(dolares.id);
  const dolaresBalance = new Decimal(0).plus(dolaresRow?.settled ?? 0);
  check(
    "dolares: entra el otro lado de la transferencia = 1.000",
    dolaresBalance.equals(1000),
    dolaresBalance.toString(),
  );

  const tarjetaRow = balances.get(tarjeta.id);
  const tarjetaBalance = new Decimal(0).plus(tarjetaRow?.settled ?? 0);
  check(
    "tarjeta: solo la cuota vencida = -2.000",
    tarjetaBalance.equals(-2000),
    tarjetaBalance.toString(),
  );
  check(
    "tarjeta: la cuota futura queda en 'por vencer' = -7.000",
    new Decimal(tarjetaRow?.pending ?? 0).equals(-7000),
    tarjetaRow?.pending ?? "0",
  );
  check(
    "la cuota futura NO ensucia el saldo de hoy",
    !tarjetaBalance.equals(-9000),
  );

  // Contraste: sumar a mano trayendo todo, que es la forma "obvia" y lenta.
  const all = await prisma.transaction.findMany({
    where: { workspaceId: workspace.id },
  });
  const now = new Date();
  let manual = new Decimal(1000);
  for (const tx of all) {
    if (tx.settlementDate > now) continue;
    if (tx.accountId === pesos.id) {
      manual =
        tx.type === "INCOME"
          ? manual.plus(tx.amount.toString())
          : manual.minus(tx.amount.toString());
    }
    if (tx.toAccountId === pesos.id && tx.toAmount) {
      manual = manual.plus(tx.toAmount.toString());
    }
  }
  check(
    "el SQL coincide con la suma hecha a mano",
    manual.equals(pesosBalance),
    `manual ${manual} vs sql ${pesosBalance}`,
  );

  await prisma.workspace.delete({ where: { id: workspace.id } });

  console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLARON`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch(async (error) => {
    console.error(error);
    await prisma.workspace.deleteMany({
      where: { name: "__verify_balances__" },
    });
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
