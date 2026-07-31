/**
 * Verifica los compromisos: normalizacion a costo mensual, calculo de fechas y
 * generacion de los movimientos atrasados.
 * Uso: npm run verify:commitments
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  daysUntil,
  monthlyCost,
  nextOccurrence,
  pendingOccurrences,
  upcomingOccurrences,
} from "../src/lib/recurrences";
import {
  listCommitments,
  runCommitment,
  runDueAutoCommitments,
  totalPerMonth,
} from "../src/lib/recurrences.server";
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

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

const NAME = "__verify_commitments__";

console.log("-- llevar todo a un numero por mes --");

check(
  "algo mensual de 500 vale 500",
  monthlyCost(new Decimal(500), "MONTHLY").equals(500),
);
check(
  "algo anual de 12.000 vale 1.000 por mes",
  monthlyCost(new Decimal(12000), "YEARLY").equals(1000),
);
check(
  "algo trimestral de 3.000 vale 1.000 por mes",
  monthlyCost(new Decimal(3000), "QUARTERLY").equals(1000),
);
check(
  "algo semestral de 6.000 vale 1.000 por mes",
  monthlyCost(new Decimal(6000), "SEMIANNUAL").equals(1000),
);

// 365,25/12 = 30,4375 dias por mes; /7 = 4,348 semanas.
const semanal = monthlyCost(new Decimal(100), "WEEKLY");
check(
  "algo semanal de 100 vale ~435 por mes (no 400)",
  semanal.gt(434) && semanal.lt(436),
  semanal.toFixed(2),
);

const quincenal = monthlyCost(new Decimal(100), "BIWEEKLY");
check(
  "algo quincenal de 100 vale ~217 por mes",
  quincenal.gt(217) && quincenal.lt(218),
  quincenal.toFixed(2),
);

check(
  "cada dos meses de 1.000 vale 500 por mes",
  monthlyCost(new Decimal(1000), "BIMONTHLY").equals(500),
);

check(
  "el intervalo se respeta: mensual cada 3 = un tercio",
  monthlyCost(new Decimal(300), "MONTHLY", 3).equals(100),
);

console.log("\n-- fechas --");

check(
  "mensual: del 15 de enero al 15 de febrero",
  iso(nextOccurrence({ frequency: "MONTHLY", from: toDateOnly("2026-01-15") })) ===
    "2026-02-15",
);

// El caso que rompe a casi todas las apps: el 31 en un mes que no lo tiene.
check(
  "un alquiler del 31 cae el 28 en febrero",
  iso(
    nextOccurrence({
      frequency: "MONTHLY",
      from: toDateOnly("2026-01-31"),
      dayOfMonth: 31,
    }),
  ) === "2026-02-28",
);

check(
  "y en marzo vuelve al 31, no se queda pegado en el 28",
  iso(
    nextOccurrence({
      frequency: "MONTHLY",
      from: toDateOnly("2026-02-28"),
      dayOfMonth: 31,
    }),
  ) === "2026-03-31",
);

check(
  "anual: cruza de anio bien",
  iso(nextOccurrence({ frequency: "YEARLY", from: toDateOnly("2026-03-10") })) ===
    "2027-03-10",
);

check(
  "semanal: sumar 7 dias",
  iso(nextOccurrence({ frequency: "WEEKLY", from: toDateOnly("2026-07-29") })) ===
    "2026-08-05",
);

const proximas = upcomingOccurrences({
  frequency: "MONTHLY",
  startDate: toDateOnly("2026-01-31"),
  dayOfMonth: 31,
  count: 4,
});
check(
  "vista previa desde el 31 de enero: 31, 28, 31, 30",
  proximas.map(iso).join(",") ===
    "2026-01-31,2026-02-28,2026-03-31,2026-04-30",
  proximas.map(iso).join(","),
);

console.log("\n-- vencimientos atrasados --");

const atrasadas = pendingOccurrences({
  frequency: "MONTHLY",
  nextRunDate: toDateOnly("2026-05-10"),
  until: toDateOnly("2026-07-29"),
  dayOfMonth: 10,
});
check(
  "tres meses sin entrar dejan tres pendientes",
  atrasadas.map(iso).join(",") === "2026-05-10,2026-06-10,2026-07-10",
  atrasadas.map(iso).join(","),
);

check(
  "si todavia no vencio no hay ninguna",
  pendingOccurrences({
    frequency: "MONTHLY",
    nextRunDate: toDateOnly("2026-08-10"),
    until: toDateOnly("2026-07-29"),
  }).length === 0,
);

check(
  "la fecha de fin corta la serie",
  pendingOccurrences({
    frequency: "MONTHLY",
    nextRunDate: toDateOnly("2026-05-10"),
    endDate: toDateOnly("2026-06-15"),
    until: toDateOnly("2026-07-29"),
    dayOfMonth: 10,
  }).length === 2,
);

check(
  "hay un tope para que un dato malo no genere miles",
  pendingOccurrences({
    frequency: "WEEKLY",
    nextRunDate: toDateOnly("1990-01-01"),
    until: toDateOnly("2026-07-29"),
  }).length === 60,
);

check(
  "los dias que faltan se cuentan por dia, no por hora",
  daysUntil(toDateOnly("2026-07-31"), new Date("2026-07-29T23:50:00Z")) === 2,
);

async function main() {
  console.log("\n-- contra la base --");

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

  const hoy = toDateOnly("2026-07-29");

  const netflix = await prisma.recurrence.create({
    data: {
      workspaceId: workspace.id,
      kind: "SUBSCRIPTION",
      type: "EXPENSE",
      accountId: pesos.id,
      description: "Netflix",
      amount: "600",
      currency: "UYU",
      frequency: "MONTHLY",
      dayOfMonth: 10,
      startDate: toDateOnly("2026-05-10"),
      nextRunDate: toDateOnly("2026-05-10"),
      mode: "CONFIRM",
    },
  });

  const dominio = await prisma.recurrence.create({
    data: {
      workspaceId: workspace.id,
      kind: "SUBSCRIPTION",
      type: "EXPENSE",
      accountId: pesos.id,
      description: "Dominio",
      amount: "12000",
      currency: "UYU",
      frequency: "YEARLY",
      dayOfMonth: 1,
      startDate: toDateOnly("2027-01-01"),
      nextRunDate: toDateOnly("2027-01-01"),
      mode: "CONFIRM",
    },
  });

  const sueldo = await prisma.recurrence.create({
    data: {
      workspaceId: workspace.id,
      kind: "INCOME",
      type: "INCOME",
      accountId: pesos.id,
      description: "Sueldo",
      amount: "60000",
      currency: "UYU",
      frequency: "MONTHLY",
      dayOfMonth: 1,
      startDate: toDateOnly("2026-08-01"),
      nextRunDate: toDateOnly("2026-08-01"),
      mode: "AUTO",
    },
  });

  const pausado = await prisma.recurrence.create({
    data: {
      workspaceId: workspace.id,
      kind: "SUBSCRIPTION",
      type: "EXPENSE",
      accountId: pesos.id,
      description: "Gimnasio",
      amount: "2000",
      currency: "UYU",
      frequency: "MONTHLY",
      dayOfMonth: 5,
      startDate: toDateOnly("2026-05-05"),
      nextRunDate: toDateOnly("2026-05-05"),
      pausedAt: new Date(),
      mode: "CONFIRM",
    },
  });

  const lista = await listCommitments(workspace.id, hoy);
  const porNombre = new Map(lista.map((item) => [item.description, item]));

  check("trae los cuatro", lista.length === 4, String(lista.length));

  check(
    "Netflix aparece con 3 vencimientos sin registrar",
    porNombre.get("Netflix")?.overdue === 3,
    String(porNombre.get("Netflix")?.overdue),
  );

  check(
    "el pausado no acumula atrasos",
    porNombre.get("Gimnasio")?.overdue === 0,
    String(porNombre.get("Gimnasio")?.overdue),
  );

  check(
    "el dominio anual pesa 1.000 por mes",
    porNombre.get("Dominio")?.perMonth.equals(1000) ?? false,
    porNombre.get("Dominio")?.perMonth.toString(),
  );

  const totales = totalPerMonth(lista);
  check(
    "el gasto fijo mensual es 600 + 1.000 = 1.600 (el pausado no suma)",
    totales.expense.get("UYU")?.equals(1600) ?? false,
    totales.expense.get("UYU")?.toString(),
  );
  check(
    "el ingreso fijo va aparte",
    totales.income.get("UYU")?.equals(60000) ?? false,
    totales.income.get("UYU")?.toString(),
  );
  check(
    "cuenta 2 suscripciones activas",
    totales.subscriptions === 2,
    String(totales.subscriptions),
  );

  console.log("\n-- registrar lo atrasado --");

  const creados = await runCommitment({
    workspaceId: workspace.id,
    recurrenceId: netflix.id,
    baseCurrency: "UYU",
    until: hoy,
  });
  check("crea los 3 movimientos de una", creados === 3, String(creados));

  const movimientos = await prisma.transaction.findMany({
    where: { recurrenceId: netflix.id },
    orderBy: { date: "asc" },
  });

  check(
    "cada uno con SU fecha, no la de hoy",
    movimientos.map((tx) => iso(tx.date)).join(",") ===
      "2026-05-10,2026-06-10,2026-07-10",
    movimientos.map((tx) => iso(tx.date)).join(","),
  );

  check(
    "quedan marcados como generados por una recurrencia",
    movimientos.every((tx) => tx.source === "RECURRING"),
  );

  const despues = await prisma.recurrence.findUniqueOrThrow({
    where: { id: netflix.id },
  });
  check(
    "la proxima fecha avanza a agosto",
    iso(despues.nextRunDate) === "2026-08-10",
    iso(despues.nextRunDate),
  );

  const otraVez = await runCommitment({
    workspaceId: workspace.id,
    recurrenceId: netflix.id,
    baseCurrency: "UYU",
    until: hoy,
  });
  check("volver a tocar Registrar no duplica nada", otraVez === 0, String(otraVez));

  console.log("\n-- modo automatico --");

  const auto = await runDueAutoCommitments(workspace.id, "UYU", hoy);
  check("en julio el sueldo de agosto todavia no corre", auto === 0, String(auto));

  const auto2 = await runDueAutoCommitments(
    workspace.id,
    "UYU",
    toDateOnly("2026-08-02"),
  );
  check("en agosto si", auto2 === 1, String(auto2));

  const ingreso = await prisma.transaction.findFirst({
    where: { recurrenceId: sueldo.id },
  });
  check("y entra como ingreso", ingreso?.type === "INCOME", ingreso?.type);

  const pausadoCorrido = await runCommitment({
    workspaceId: workspace.id,
    recurrenceId: pausado.id,
    baseCurrency: "UYU",
    until: hoy,
  });
  check("un compromiso pausado no genera nada", pausadoCorrido === 0);

  console.log("\n-- de otro workspace no se toca --");

  const otro = await prisma.workspace.create({
    data: { name: `${NAME}_otro`, baseCurrency: "UYU" },
  });
  const ajeno = await runCommitment({
    workspaceId: otro.id,
    recurrenceId: dominio.id,
    baseCurrency: "UYU",
    until: toDateOnly("2027-06-01"),
  });
  check("no corre el compromiso de otro workspace", ajeno === 0);

  await prisma.workspace.delete({ where: { id: otro.id } });
  await prisma.workspace.delete({ where: { id: workspace.id } });
}

main()
  .catch(async (error) => {
    console.error(error);
    failures++;
    await prisma.workspace.deleteMany({
      where: { name: { startsWith: NAME } },
    });
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLARON`);
    process.exitCode = failures === 0 ? 0 : 1;
  });
