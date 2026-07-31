/**
 * Mide donde se va el tiempo contra la base. Uso: npm run bench:db
 *
 * La regla en este proyecto: lo que domina no es lo pesada que sea la consulta
 * sino cuantas veces se va y se vuelve a Ohio. Este script sirve para contar
 * esas idas y vueltas en vez de adivinarlas.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function time(label: string, fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await fn();
  const ms = Math.round(performance.now() - start);
  console.log(`${String(ms).padStart(5)} ms  ${label}`);
  return ms;
}

/** Corre varias veces y devuelve la mediana: una corrida suelta miente. */
async function median(
  label: string,
  runs: number,
  fn: () => Promise<unknown>,
): Promise<number> {
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const value = Math.round(samples[Math.floor(runs / 2)]);
  console.log(`${String(value).padStart(5)} ms  ${label}`);
  return value;
}

async function main() {
  await time("arranque: conexion + TLS + primer SELECT", () =>
    prisma.$queryRaw`SELECT 1`,
  );

  console.log("");
  const trip = await median("una ida y vuelta (SELECT 1)", 7, () =>
    prisma.$queryRaw`SELECT 1`,
  );

  // Si tres consultas en paralelo tardan lo mismo que una, el pool las esta
  // resolviendo de verdad en paralelo. Si tardan el triple, van en fila por una
  // sola conexion y todo el Promise.all del codigo no sirve de nada.
  const parallel = await median("tres en paralelo", 5, () =>
    Promise.all([
      prisma.$queryRaw`SELECT 1`,
      prisma.$queryRaw`SELECT 2`,
      prisma.$queryRaw`SELECT 3`,
    ]),
  );

  console.log(
    parallel < trip * 1.8
      ? `      -> el paralelismo funciona (${Math.round(parallel / trip)}x de una sola)\n`
      : `      -> OJO: van en fila, no en paralelo (${Math.round((parallel / trip) * 10) / 10}x)\n`,
  );

  const workspace = await prisma.workspace.findFirst({ select: { id: true } });
  if (!workspace) return;
  const id = workspace.id;

  console.log("-- lista de movimientos --");

  await median("findMany pelado (sin relaciones)", 5, () =>
    prisma.transaction.findMany({
      where: { workspaceId: id },
      orderBy: { settlementDate: "desc" },
      take: 50,
    }),
  );

  await median("findMany con 4 include", 5, () =>
    prisma.transaction.findMany({
      where: { workspaceId: id },
      orderBy: { settlementDate: "desc" },
      take: 50,
      include: {
        account: { select: { name: true } },
        toAccount: { select: { name: true } },
        category: { select: { name: true } },
        installmentPlan: { select: { count: true } },
      },
    }),
  );

  await median("findMany con 4 include + relationLoadStrategy join", 5, () =>
    prisma.transaction.findMany({
      where: { workspaceId: id },
      relationLoadStrategy: "join",
      orderBy: { settlementDate: "desc" },
      take: 50,
      include: {
        account: { select: { name: true } },
        toAccount: { select: { name: true } },
        category: { select: { name: true } },
        installmentPlan: { select: { count: true } },
      },
    }),
  );

  await median("groupBy de totales", 5, () =>
    prisma.transaction.groupBy({
      by: ["type"],
      where: { workspaceId: id },
      _sum: { amountBase: true },
      _count: { _all: true },
    }),
  );

  console.log("\n-- dashboard --");

  const from = new Date("2026-07-01");
  const to = new Date("2026-08-01");

  await median("resumen del periodo", 5, () =>
    prisma.$queryRaw`
      SELECT COALESCE(SUM("amountBase") FILTER (WHERE type = 'INCOME'), 0)::text AS income
      FROM "Transaction"
      WHERE "workspaceId" = ${id} AND "settlementDate" >= ${from} AND "settlementDate" < ${to}
    `,
  );

  await median("gasto por categoria", 5, () =>
    prisma.$queryRaw`
      SELECT COALESCE(p.id, c.id) AS category_id, SUM(t."amountBase")::text AS amount
      FROM "Transaction" t
      LEFT JOIN "Category" c ON c.id = t."categoryId"
      LEFT JOIN "Category" p ON p.id = c."parentId"
      WHERE t."workspaceId" = ${id} AND t.type = 'EXPENSE'
        AND t."settlementDate" >= ${from} AND t."settlementDate" < ${to}
      GROUP BY 1
    `,
  );

  await median("serie mensual", 5, () =>
    prisma.$queryRaw`
      SELECT date_trunc('month', "settlementDate") AS month, SUM("amountBase")::text AS total
      FROM "Transaction" WHERE "workspaceId" = ${id}
      GROUP BY 1 ORDER BY 1
    `,
  );

  console.log("\n-- cuotas y compromisos --");

  await median("planes con include anidado", 5, () =>
    prisma.installmentPlan.findMany({
      where: { workspaceId: id },
      include: {
        account: { select: { name: true } },
        category: { select: { name: true } },
        transactions: { select: { amount: true, settlementDate: true } },
      },
    }),
  );

  await median("planes con relationLoadStrategy join", 5, () =>
    prisma.installmentPlan.findMany({
      where: { workspaceId: id },
      relationLoadStrategy: "join",
      include: {
        account: { select: { name: true } },
        category: { select: { name: true } },
        transactions: { select: { amount: true, settlementDate: true } },
      },
    }),
  );

  await median("compromisos con include", 5, () =>
    prisma.recurrence.findMany({
      where: { workspaceId: id, archivedAt: null },
      include: {
        account: { select: { name: true } },
        category: { select: { name: true } },
      },
    }),
  );

  await median("compromisos con relationLoadStrategy join", 5, () =>
    prisma.recurrence.findMany({
      where: { workspaceId: id, archivedAt: null },
      relationLoadStrategy: "join",
      include: {
        account: { select: { name: true } },
        category: { select: { name: true } },
      },
    }),
  );

  console.log(`\nUna ida y vuelta cuesta ~${trip} ms.`);
  console.log("Todo lo que tarde mucho mas que eso son varias consultas.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
