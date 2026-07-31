/**
 * Verifica el reparto en cuotas, el fechado de los vencimientos y que un plan
 * guardado genere las N transacciones correctas.
 * Uso: npm run verify:installments
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { Decimal } from "../src/lib/money";
import { installmentDueDates, splitInstallments } from "../src/lib/installments";
import {
  createInstallmentPlan,
  listInstallmentPlans,
} from "../src/lib/installments.server";
import { toDateOnly } from "../src/lib/dates";

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) failures++;
}

const card = {
  type: "CREDIT_CARD",
  statementClosingDay: 25,
  paymentDueDay: 5,
};

const cash = { type: "CHECKING", statementClosingDay: null, paymentDueDay: null };

console.log("-- reparto: las cuotas siempre suman el total --");

const cases: [string, number][] = [
  ["100", 3],
  ["10000", 3],
  ["100", 6],
  ["100", 8],
  ["99999.99", 12],
  ["1", 2],
  ["45990", 10],
  ["0.05", 3],
  ["123456.78", 24],
  ["7", 7],
];

for (const [total, count] of cases) {
  const amount = new Decimal(total);
  const parts = splitInstallments(amount, count, "UYU");
  const sum = parts.reduce((acc, part) => acc.plus(part), new Decimal(0));

  check(
    `${total} en ${count}: suma exacta`,
    sum.equals(amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)),
    `suma ${sum}`,
  );
  check(
    `${total} en ${count}: son ${count} cuotas`,
    parts.length === count,
  );
  check(
    `${total} en ${count}: ninguna cuota es negativa`,
    parts.every((part) => part.gte(0)),
  );
  check(
    `${total} en ${count}: solo la primera puede diferir`,
    new Set(parts.slice(1).map((part) => part.toString())).size <= 1,
    parts.slice(0, 3).map((part) => part.toString()).join(" / "),
  );
}

console.log("\n-- casos puntuales del redondeo --");

const tres = splitInstallments(new Decimal("100"), 3, "UYU");
check(
  "100 en 3 = 33,34 + 33,33 + 33,33",
  tres.map((part) => part.toString()).join("+") === "33.34+33.33+33.33",
  tres.map((part) => part.toString()).join("+"),
);

const seis = splitInstallments(new Decimal("100"), 6, "UYU");
check(
  "100 en 6: la primera baja a 16,65 porque 16,67 x 6 se pasa",
  seis[0].toString() === "16.65" && seis[1].toString() === "16.67",
  seis.slice(0, 2).map((part) => part.toString()).join(" / "),
);

const exacto = splitInstallments(new Decimal("120"), 12, "UYU");
check(
  "120 en 12: cuando divide exacto no hay cuota rara",
  exacto.every((part) => part.equals(10)),
);

console.log("\n-- vencimientos con tarjeta que cierra el 25 y vence el 5 --");

// Compra antes del cierre: entra en el resumen de este mes.
const antes = installmentDueDates(card, toDateOnly("2026-03-20"), 3);
check(
  "compra 20/mar: primera cuota vence 5/abr",
  antes[0].toISOString().slice(0, 10) === "2026-04-05",
  antes[0].toISOString().slice(0, 10),
);
check(
  "compra 20/mar: tercera cuota vence 5/jun",
  antes[2].toISOString().slice(0, 10) === "2026-06-05",
  antes[2].toISOString().slice(0, 10),
);

// Compra despues del cierre: se va al resumen siguiente.
const despues = installmentDueDates(card, toDateOnly("2026-03-28"), 3);
check(
  "compra 28/mar (post cierre): primera cuota vence 5/may",
  despues[0].toISOString().slice(0, 10) === "2026-05-05",
  despues[0].toISOString().slice(0, 10),
);

// Meses cortos: el dia 31 no existe en todos lados.
const largo = installmentDueDates(
  { type: "CREDIT_CARD", statementClosingDay: 25, paymentDueDay: 31 },
  toDateOnly("2026-01-10"),
  3,
);
check(
  "vencimiento el 31: en febrero cae el 28",
  largo[1].toISOString().slice(0, 10) === "2026-02-28",
  largo[1].toISOString().slice(0, 10),
);

// Sin tarjeta: la primera cuota es el dia de la compra.
const sinTarjeta = installmentDueDates(cash, toDateOnly("2026-03-20"), 3);
check(
  "cuenta comun: primera cuota el dia de la compra",
  sinTarjeta[0].toISOString().slice(0, 10) === "2026-03-20",
  sinTarjeta[0].toISOString().slice(0, 10),
);
check(
  "cuenta comun: las cuotas van mes a mes",
  sinTarjeta[1].toISOString().slice(0, 10) === "2026-04-20",
  sinTarjeta[1].toISOString().slice(0, 10),
);

check(
  "los vencimientos siempre van hacia adelante",
  installmentDueDates(card, toDateOnly("2026-01-15"), 24).every(
    (date, index, all) => index === 0 || date > all[index - 1],
  ),
);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const NAME = "__verify_installments__";

async function againstTheDatabase() {
  console.log("\n-- un plan guardado de verdad --");

  const workspace = await prisma.workspace.create({
    data: { name: NAME, baseCurrency: "UYU" },
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

  const plan = await createInstallmentPlan(
    {
      workspaceId: workspace.id,
      account: tarjeta,
      totalAmount: new Decimal("45000"),
      count: 6,
      purchaseDate: toDateOnly("2026-03-20"),
      description: "Heladera",
    },
    "UYU",
  );

  const cuotas = await prisma.transaction.findMany({
    where: { installmentPlanId: plan.id },
    orderBy: { installmentNumber: "asc" },
  });

  check("se generaron las 6 cuotas", cuotas.length === 6, String(cuotas.length));

  check(
    "van numeradas del 1 al 6",
    cuotas.every((cuota, index) => cuota.installmentNumber === index + 1),
  );

  const suma = cuotas.reduce(
    (acc, cuota) => acc.plus(cuota.amount.toString()),
    new Decimal(0),
  );
  check("las cuotas suman el total", suma.equals(45000), suma.toString());

  check(
    "el total del plan coincide con la suma de sus cuotas",
    new Decimal(plan.totalAmount.toString()).equals(suma),
  );

  check(
    "todas conservan la fecha de la compra",
    cuotas.every(
      (cuota) => cuota.date.toISOString().slice(0, 10) === "2026-03-20",
    ),
  );

  check(
    "los vencimientos van de abril a setiembre",
    cuotas.map((c) => c.settlementDate.toISOString().slice(0, 10)).join(",") ===
      "2026-04-05,2026-05-05,2026-06-05,2026-07-05,2026-08-05,2026-09-05",
    cuotas.map((c) => c.settlementDate.toISOString().slice(0, 10)).join(","),
  );

  // El saldo de la tarjeta solo cuenta lo ya vencido: es lo que evita que una
  // compra en cuotas te aparezca entera el dia que la hiciste.
  const now = new Date();
  const vencidas = cuotas.filter((cuota) => cuota.settlementDate <= now);

  const [resumen] = await listInstallmentPlans(workspace.id);
  check(
    "el resumen cuenta como pagadas solo las vencidas",
    resumen.paidCount === vencidas.length,
    `${resumen.paidCount} de ${resumen.count}`,
  );
  check(
    "pagado + pendiente = total",
    resumen.paidAmount.plus(resumen.remainingAmount).equals(resumen.total),
  );
  check(
    "la proxima cuota es la primera que todavia no vencio",
    resumen.paidCount === resumen.count ||
      resumen.nextDueDate?.getTime() ===
        cuotas.find((cuota) => cuota.settlementDate > now)?.settlementDate.getTime(),
  );

  // Borrar el plan tiene que llevarse las cuotas: si quedan sueltas, el saldo
  // de la tarjeta sigue arrastrando plata de una compra que ya no existe.
  await prisma.installmentPlan.delete({ where: { id: plan.id } });
  const huerfanas = await prisma.transaction.count({
    where: { workspaceId: workspace.id },
  });
  check("borrar el plan borra sus cuotas", huerfanas === 0, String(huerfanas));

  await prisma.workspace.delete({ where: { id: workspace.id } });
}

againstTheDatabase()
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
