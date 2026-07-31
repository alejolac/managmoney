/**
 * Verifica los numeros del dashboard y, sobre todo, que el drill-down cierre:
 * si el grafico dice que en Supermercado se fueron $5.000, la lista que se
 * abre al hacer click tiene que sumar exactamente $5.000.
 *
 * Uso: npm run verify:dashboard
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { getDashboard } from "../src/lib/dashboard";
import { buildWhere } from "../src/lib/transaction-list";
import { EMPTY_FILTERS, UNCATEGORIZED } from "../src/lib/transaction-filters";
import { resolvePeriod, periodToFilterDates } from "../src/lib/periods";
import { toDateOnly } from "../src/lib/dates";
import { Decimal } from "../src/lib/money";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) failures++;
}

const NAME = "__verify_dashboard__";

async function main() {
  const workspace = await prisma.workspace.create({
    data: { name: NAME, baseCurrency: "UYU" },
  });

  const pesos = await prisma.account.create({
    data: {
      workspaceId: workspace.id,
      name: "Pesos",
      type: "CHECKING",
      currency: "UYU",
      openingBalance: "0",
    },
  });

  const ahorro = await prisma.account.create({
    data: {
      workspaceId: workspace.id,
      name: "Ahorro",
      type: "SAVINGS",
      currency: "USD",
      openingBalance: "0",
      isSavings: true,
    },
  });

  // Un arbol de categorias: el dashboard agrupa las hijas dentro del padre.
  const servicios = await prisma.category.create({
    data: { workspaceId: workspace.id, name: "Servicios", kind: "EXPENSE" },
  });
  const ute = await prisma.category.create({
    data: {
      workspaceId: workspace.id,
      name: "UTE",
      kind: "EXPENSE",
      parentId: servicios.id,
    },
  });
  const ose = await prisma.category.create({
    data: {
      workspaceId: workspace.id,
      name: "OSE",
      kind: "EXPENSE",
      parentId: servicios.id,
    },
  });
  const super_ = await prisma.category.create({
    data: { workspaceId: workspace.id, name: "Supermercado", kind: "EXPENSE" },
  });

  const base = { workspaceId: workspace.id, currency: "UYU" as const, baseRate: "1" };
  const enJulio = toDateOnly("2026-07-10");
  const enJunio = toDateOnly("2026-06-10");

  await prisma.transaction.createMany({
    data: [
      // Julio
      { ...base, type: "INCOME", accountId: pesos.id, amount: "60000", amountBase: "60000", date: enJulio, settlementDate: enJulio },
      { ...base, type: "EXPENSE", accountId: pesos.id, categoryId: super_.id, amount: "5000", amountBase: "5000", date: enJulio, settlementDate: enJulio },
      { ...base, type: "EXPENSE", accountId: pesos.id, categoryId: super_.id, amount: "3000", amountBase: "3000", date: enJulio, settlementDate: enJulio },
      { ...base, type: "EXPENSE", accountId: pesos.id, categoryId: ute.id, amount: "2000", amountBase: "2000", date: enJulio, settlementDate: enJulio },
      { ...base, type: "EXPENSE", accountId: pesos.id, categoryId: ose.id, amount: "1000", amountBase: "1000", date: enJulio, settlementDate: enJulio },
      // Sin categoria: tiene que aparecer igual.
      { ...base, type: "EXPENSE", accountId: pesos.id, amount: "500", amountBase: "500", date: enJulio, settlementDate: enJulio },
      // Excluida de estadisticas: NO tiene que sumar en ningun lado.
      { ...base, type: "EXPENSE", accountId: pesos.id, categoryId: super_.id, amount: "9999", amountBase: "9999", date: enJulio, settlementDate: enJulio, excludeFromStats: true },
      // Desahorro: sale del ahorro hacia la cuenta de gastar.
      { ...base, type: "TRANSFER", accountId: ahorro.id, currency: "USD", amount: "100", amountBase: "4000", baseRate: "40", toAccountId: pesos.id, toAmount: "4000", toCurrency: "UYU", date: enJulio, settlementDate: enJulio, isDissaving: true },
      // Junio, para la serie mensual.
      { ...base, type: "EXPENSE", accountId: pesos.id, categoryId: super_.id, amount: "7000", amountBase: "7000", date: enJunio, settlementDate: enJunio },
      { ...base, type: "INCOME", accountId: pesos.id, amount: "55000", amountBase: "55000", date: enJunio, settlementDate: enJunio },
    ],
  });

  const julio = resolvePeriod("mes", "2026-07", toDateOnly("2026-07-29"));
  const dashboard = await getDashboard(workspace.id, julio);

  console.log("-- resumen de julio --");

  check(
    "ingresos = 60.000",
    dashboard.summary.income.equals(60000),
    dashboard.summary.income.toString(),
  );

  // 5000 + 3000 + 2000 + 1000 + 500 = 11500. La excluida no entra.
  check(
    "gastos = 11.500 (la excluida de estadisticas no suma)",
    dashboard.summary.expense.equals(11500),
    dashboard.summary.expense.toString(),
  );

  check(
    "la transferencia no cuenta como gasto ni como ingreso",
    dashboard.summary.income.equals(60000) &&
      dashboard.summary.expense.equals(11500),
  );

  check(
    "neto = 48.500",
    dashboard.summary.net.equals(48500),
    dashboard.summary.net.toString(),
  );

  check(
    "desahorro = 4.000 en moneda base",
    dashboard.summary.dissaving.equals(4000),
    dashboard.summary.dissaving.toString(),
  );

  check(
    "cuenta 5 gastos, no 6",
    dashboard.summary.expenseCount === 5,
    String(dashboard.summary.expenseCount),
  );

  console.log("\n-- por categoria --");

  const porNombre = new Map(
    dashboard.categories.map((slice) => [slice.name, slice]),
  );

  check(
    "UTE y OSE se suman dentro de Servicios = 3.000",
    porNombre.get("Servicios")?.amount.equals(3000) ?? false,
    porNombre.get("Servicios")?.amount.toString(),
  );

  check(
    "UTE no aparece suelta",
    !porNombre.has("UTE") && !porNombre.has("OSE"),
    [...porNombre.keys()].join(", "),
  );

  check(
    "Supermercado = 8.000",
    porNombre.get("Supermercado")?.amount.equals(8000) ?? false,
    porNombre.get("Supermercado")?.amount.toString(),
  );

  check(
    "lo que no tiene categoria aparece igual",
    porNombre.get("Sin categorizar")?.amount.equals(500) ?? false,
    porNombre.get("Sin categorizar")?.amount.toString(),
  );

  check(
    "vienen ordenadas de mayor a menor",
    dashboard.categories.every(
      (slice, index) =>
        index === 0 || dashboard.categories[index - 1].amount.gte(slice.amount),
    ),
    dashboard.categories.map((slice) => slice.name).join(" > "),
  );

  const sumaCategorias = dashboard.categories.reduce(
    (acc, slice) => acc.plus(slice.amount),
    new Decimal(0),
  );
  check(
    "las categorias suman el gasto total del periodo",
    sumaCategorias.equals(dashboard.summary.expense),
    `${sumaCategorias} vs ${dashboard.summary.expense}`,
  );

  const sumaShares = dashboard.categories.reduce(
    (acc, slice) => acc + slice.share,
    0,
  );
  check(
    "los porcentajes suman ~100",
    Math.abs(sumaShares - 100) < 0.5,
    `${sumaShares}%`,
  );

  console.log("\n-- el drill-down tiene que cerrar con el grafico --");

  const range = periodToFilterDates(julio);

  for (const slice of dashboard.categories) {
    const where = buildWhere(workspace.id, {
      ...EMPTY_FILTERS,
      ...range,
      type: "EXPENSE",
      // Igual que en el dashboard: sin categoria es un filtro, no la ausencia
      // de filtro.
      categoryId: slice.categoryId ?? UNCATEGORIZED,
    });

    const rows = await prisma.transaction.findMany({
      where,
      select: { amountBase: true, excludeFromStats: true },
    });

    const suma = rows
      .filter((row) => !row.excludeFromStats)
      .reduce((acc, row) => acc.plus(row.amountBase.toString()), new Decimal(0));

    check(
      `${slice.name}: el grafico dice ${slice.amount} y la lista suma ${suma}`,
      suma.equals(slice.amount),
    );
  }

  console.log("\n-- serie mensual --");

  check(
    "hay datos de junio y de julio",
    dashboard.months.length >= 2,
    dashboard.months
      .map((point) => point.month.toISOString().slice(0, 7))
      .join(", "),
  );

  const junio = dashboard.months.find(
    (point) => point.month.toISOString().slice(0, 7) === "2026-06",
  );
  check("junio: gastos 7.000", junio?.expense.equals(7000) ?? false, junio?.expense.toString());
  check("junio: ingresos 55.000", junio?.income.equals(55000) ?? false, junio?.income.toString());

  console.log("\n-- otros periodos --");

  const semestre = resolvePeriod("semestre", "2026-07", toDateOnly("2026-07-29"));
  const dashSemestre = await getDashboard(workspace.id, semestre);
  check(
    "el semestre incluye junio y julio: 18.500 de gasto",
    dashSemestre.summary.expense.equals(18500),
    dashSemestre.summary.expense.toString(),
  );

  const anio = resolvePeriod("ano", "2026-07", toDateOnly("2026-07-29"));
  const dashAnio = await getDashboard(workspace.id, anio);
  check(
    "el anio da lo mismo que el semestre (no hay nada mas cargado)",
    dashAnio.summary.expense.equals(18500),
    dashAnio.summary.expense.toString(),
  );

  const vacio = resolvePeriod("mes", "2026-01", toDateOnly("2026-07-29"));
  const dashVacio = await getDashboard(workspace.id, vacio);
  check(
    "un mes sin nada da cero y no rompe",
    dashVacio.summary.expense.isZero() && dashVacio.categories.length === 0,
  );

  console.log("\n-- limites de los periodos --");

  check("julio arranca el 1", julio.from.toISOString().slice(0, 10) === "2026-07-01");
  check("julio termina antes del 1 de agosto", julio.to.toISOString().slice(0, 10) === "2026-08-01");
  check("el rango para los filtros dice 31 de julio", range.to === "2026-07-31", range.to);
  check("el semestre arranca en febrero", semestre.from.toISOString().slice(0, 10) === "2026-02-01", semestre.from.toISOString().slice(0, 10));
  check("no deja avanzar al mes que viene", julio.hasNext === false);
  check("si deja retroceder", julio.previousRef === "2026-06", julio.previousRef);
  check(
    "en diciembre el mes siguiente es enero del anio que viene",
    resolvePeriod("mes", "2026-12", toDateOnly("2027-06-01")).nextRef === "2027-01",
  );

  await prisma.workspace.delete({ where: { id: workspace.id } });
}

main()
  .catch(async (error) => {
    console.error(error);
    failures++;
    await prisma.workspace.deleteMany({ where: { name: NAME } });
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLARON`);
    process.exitCode = failures === 0 ? 0 : 1;
  });
