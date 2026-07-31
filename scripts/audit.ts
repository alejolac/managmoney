/**
 * Audita el workspace real: corre lo mismo que consulta cada pantalla, muestra
 * los numeros que van a salir en pantalla y cuanto tarda cada una.
 * Uso: npm run audit
 *
 * No escribe nada. Sirve para dos cosas: ver si los numeros cierran con datos
 * de verdad, y saber que pantalla es la lenta antes de optimizar a ciegas.
 */
import "dotenv/config";
// El mismo cliente que usan las pantallas, no uno nuevo: si el script abriera
// su propio pool estaria calentando conexiones que las funciones no usan, y
// mediria la primera de ellas como si fuera lentisima.
import { prisma } from "../src/lib/prisma";
import { getAccountsWithBalances, totalsByCurrency } from "../src/lib/accounts";
import { getDashboard } from "../src/lib/dashboard";
import { getEnvelopeStatus } from "../src/lib/envelopes";
import { listInstallmentPlans, upcomingInstallmentLoad } from "../src/lib/installments.server";
import { listCommitments, totalPerMonth } from "../src/lib/recurrences.server";
import { listTransactions } from "../src/lib/transaction-list";
import { EMPTY_FILTERS } from "../src/lib/transaction-filters";
import { resolvePeriod } from "../src/lib/periods";
import { Decimal, formatMoney } from "../src/lib/money";
import { formatMonth } from "../src/lib/dates";
import type { Currency } from "../src/generated/prisma/enums";

const timings: { label: string; ms: number }[] = [];

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  timings.push({ label, ms: Math.round(performance.now() - start) });
  return result;
}

let problems = 0;
function flag(message: string) {
  console.log(`  !! ${message}`);
  problems++;
}

async function main() {
  // `src/lib/prisma` calienta el pool solo al importarse; esto espera a que
  // termine para medir el costo real de cada pantalla y no el de abrir una
  // conexion, que se paga una vez por proceso y no por pagina.
  const warmup = performance.now();
  await Promise.all([1, 2, 3].map(() => prisma.$queryRaw`SELECT 1`));
  console.log(
    `(pool listo en ${Math.round(performance.now() - warmup)} ms)\n`,
  );

  const workspace = await prisma.workspace.findFirstOrThrow();
  const base = workspace.baseCurrency;
  const period = resolvePeriod("mes", null);

  console.log(`Workspace: ${workspace.name} (base ${base})`);
  console.log(`Periodo: ${period.label}\n`);

  // --- INICIO ---
  const dashboard = await timed("inicio: dashboard", () =>
    getDashboard(workspace.id, period),
  );
  const accounts = await timed("inicio: cuentas y saldos", () =>
    getAccountsWithBalances(workspace.id),
  );

  console.log("== INICIO ==");
  console.log(`  ingresos   ${formatMoney(dashboard.summary.income, base)}`);
  console.log(`  gastos     ${formatMoney(dashboard.summary.expense, base)} en ${dashboard.summary.expenseCount} movimientos`);
  console.log(`  neto       ${formatMoney(dashboard.summary.net, base, { signed: true })}`);
  if (dashboard.summary.dissaving.gt(0)) {
    console.log(`  desahorro  ${formatMoney(dashboard.summary.dissaving, base)}`);
  }

  console.log("\n  gasto por categoria:");
  for (const slice of dashboard.categories.slice(0, 8)) {
    console.log(
      `    ${slice.name.padEnd(22)} ${formatMoney(slice.amount, base).padStart(14)}  ${String(slice.share).padStart(5)}%  (${slice.count})`,
    );
  }

  const sumSlices = dashboard.categories.reduce(
    (acc, slice) => acc.plus(slice.amount),
    new Decimal(0),
  );
  if (!sumSlices.equals(dashboard.summary.expense)) {
    flag(`las categorias suman ${sumSlices} pero el total dice ${dashboard.summary.expense}`);
  }

  console.log("\n  mes a mes:");
  for (const point of dashboard.months) {
    console.log(
      `    ${formatMonth(point.month).padEnd(10)} gastos ${formatMoney(point.expense, base).padStart(14)}   ingresos ${formatMoney(point.income, base).padStart(14)}`,
    );
  }

  const totals = totalsByCurrency(accounts);
  console.log("\n  disponible:");
  for (const [currency, total] of totals) {
    console.log(
      `    ${currency}  ${formatMoney(total, currency as Currency)}`,
    );
  }
  console.log("\n  cuentas:");
  for (const account of accounts) {
    const upcoming = account.upcoming.isZero()
      ? ""
      : `   (por vencer ${formatMoney(account.upcoming, account.currency)})`;
    console.log(
      `    ${account.name.padEnd(22)} ${formatMoney(account.balance, account.currency).padStart(14)}${upcoming}`,
    );

    // Una tarjeta en negativo es lo normal: es deuda. Una caja de ahorro o el
    // efectivo en negativo significa que se gasto plata que nunca entro.
    if (account.type !== "CREDIT_CARD" && account.balance.isNegative()) {
      flag(`"${account.name}" quedo en negativo: se gasto plata que nunca entro`);
    }
  }

  // --- MOVIMIENTOS ---
  const list = await timed("movimientos: sin filtros", () =>
    listTransactions(workspace.id, EMPTY_FILTERS),
  );
  const filtered = await timed("movimientos: filtrados", () =>
    listTransactions(workspace.id, {
      ...EMPTY_FILTERS,
      type: "EXPENSE",
      from: "2026-07-01",
      to: "2026-07-31",
    }),
  );

  console.log("\n== MOVIMIENTOS ==");
  console.log(`  total ${list.total} en ${list.pageCount} paginas`);
  console.log(`  julio, solo gastos: ${filtered.total} movimientos por ${formatMoney(filtered.expense, base)}`);

  if (!filtered.expense.equals(dashboard.summary.expense)) {
    flag(
      `el dashboard dice ${dashboard.summary.expense} de gasto y la lista filtrada ${filtered.expense}`,
    );
  } else {
    console.log("  ok: coincide con el total del dashboard");
  }

  // --- SOBRES ---
  const envelopes = await timed("sobres", () =>
    getEnvelopeStatus(
      workspace.id,
      period.from.getUTCFullYear(),
      period.from.getUTCMonth() + 1,
    ),
  );

  console.log("\n== SOBRES ==");
  for (const envelope of envelopes) {
    if (envelope.kind === "GOAL") {
      console.log(
        `  ${envelope.name.padEnd(12)} meta   ${formatMoney(envelope.saved, envelope.currency).padStart(12)} de ${formatMoney(envelope.target ?? new Decimal(0), envelope.currency)}  (${envelope.progress}%)`,
      );
    } else {
      const carry = envelope.carriedIn.gt(0)
        ? ` + ${formatMoney(envelope.carriedIn, envelope.currency)} de antes`
        : "";
      console.log(
        `  ${envelope.name.padEnd(12)} asignado ${formatMoney(envelope.allocated, envelope.currency).padStart(10)}${carry}  gastado ${formatMoney(envelope.spent, envelope.currency).padStart(10)}  queda ${formatMoney(envelope.available, envelope.currency).padStart(10)}`,
      );
      if (envelope.spent.isZero()) {
        flag(`el sobre "${envelope.name}" no tiene ningun gasto asignado`);
      }
    }
  }

  // --- CUOTAS ---
  const plans = await timed("cuotas: planes", () =>
    listInstallmentPlans(workspace.id),
  );
  const load = await timed("cuotas: comprometido", () =>
    upcomingInstallmentLoad(workspace.id),
  );

  console.log("\n== CUOTAS ==");
  for (const plan of plans) {
    console.log(
      `  ${plan.description.padEnd(12)} ${plan.paidCount}/${plan.count}  cuota ${formatMoney(plan.installmentAmount, plan.currency).padStart(12)}  falta ${formatMoney(plan.remainingAmount, plan.currency).padStart(12)}`,
    );
    if (!plan.paidAmount.plus(plan.remainingAmount).equals(plan.total)) {
      flag(`en "${plan.description}" pagado + pendiente no da el total`);
    }
  }
  console.log("  comprometido por mes:");
  for (const item of load) {
    console.log(
      `    ${formatMonth(item.month).padEnd(10)} ${formatMoney(item.amount, item.currency).padStart(14)}`,
    );
  }

  // --- COMPROMISOS ---
  const commitments = await timed("compromisos", () =>
    listCommitments(workspace.id),
  );
  const fixed = totalPerMonth(commitments);

  console.log("\n== COMPROMISOS ==");
  for (const [currency, amount] of fixed.expense) {
    console.log(`  comprometido por mes  ${formatMoney(amount, currency)}`);
  }
  for (const [currency, amount] of fixed.income) {
    console.log(`  ingreso fijo por mes  ${formatMoney(amount, currency)}`);
  }
  const due = commitments.filter((item) => !item.paused && item.daysLeft <= 0);
  console.log(`  ${commitments.length} cargados, ${due.length} vencidos sin registrar`);

  // Chequeo de sentido: el gasto fijo no puede superar el ingreso fijo.
  const fixedExpense = fixed.expense.get(base);
  const fixedIncome = fixed.income.get(base);
  if (fixedExpense && fixedIncome) {
    const share = fixedExpense.div(fixedIncome).mul(100).toDecimalPlaces(0);
    console.log(`  se lleva el ${share}% del ingreso fijo`);
  }

  // --- TIEMPOS ---
  console.log("\n== TIEMPOS ==");
  const sorted = [...timings].sort((a, b) => b.ms - a.ms);
  for (const entry of sorted) {
    const bar = "#".repeat(Math.min(Math.round(entry.ms / 20), 40));
    console.log(`  ${String(entry.ms).padStart(5)} ms  ${entry.label.padEnd(28)} ${bar}`);
  }

  const total = timings.reduce((acc, entry) => acc + entry.ms, 0);
  console.log(`  ${String(total).padStart(5)} ms  TOTAL de todas las pantallas`);

  console.log(
    problems === 0
      ? "\nSin problemas: los numeros cierran entre pantallas."
      : `\n${problems} cosas para mirar.`,
  );
  process.exitCode = problems === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
