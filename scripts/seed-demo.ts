/**
 * Carga datos de prueba realistas para ver la app funcionando.
 *
 *   npm run seed:demo          carga seis meses de movimientos
 *   npm run seed:demo -- clean borra SOLO lo que cargo este script
 *
 * Todo lo que crea queda anotado en scripts/.demo-data.json y los movimientos
 * llevan un `externalId` que arranca con "demo:", asi que la limpieza es exacta
 * y no puede llevarse por delante nada cargado a mano.
 */
import "dotenv/config";
import { writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { Decimal } from "../src/lib/money";
import { toDateOnly, resolveSettlementDate } from "../src/lib/dates";
import { createInstallmentPlan } from "../src/lib/installments.server";
import { createTransfer } from "../src/lib/transactions";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const MANIFEST = join(import.meta.dirname, ".demo-data.json");

type Manifest = {
  accountIds: string[];
  envelopeIds: string[];
  recurrenceIds: string[];
  planIds: string[];
};

/**
 * Numeros pseudoaleatorios con semilla fija.
 *
 * Los montos varian mes a mes para que los graficos no sean seis barras
 * iguales, pero corriendo el script dos veces sale lo mismo: si algo se ve
 * raro, se puede volver a reproducir.
 */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const random = makeRandom(20260729);

/** Un monto cerca de `base`, con hasta `spread` de diferencia. */
function around(base: number, spread: number): string {
  const delta = (random() * 2 - 1) * spread;
  return String(Math.round((base + delta) / 10) * 10);
}

function pick<T>(items: T[]): T {
  return items[Math.floor(random() * items.length)];
}

/** Las cotizaciones reales se mueven despacio; esto las imita. */
function rateFor(month: number): string {
  const table: Record<number, string> = {
    2: "39.10",
    3: "39.45",
    4: "39.60",
    5: "39.85",
    6: "40.05",
    7: "40.21",
  };
  return table[month] ?? "40.00";
}

async function clean() {
  if (!existsSync(MANIFEST)) {
    console.log("No hay nada que limpiar: falta scripts/.demo-data.json");
    return;
  }

  const manifest: Manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

  // Primero los movimientos: las cuotas se van solas con su plan, pero el
  // resto apunta a cuentas y sobres que se borran despues.
  const movements = await prisma.transaction.deleteMany({
    where: { externalId: { startsWith: "demo:" } },
  });

  const plans = await prisma.installmentPlan.deleteMany({
    where: { id: { in: manifest.planIds } },
  });
  const recurrences = await prisma.recurrence.deleteMany({
    where: { id: { in: manifest.recurrenceIds } },
  });
  const envelopes = await prisma.envelope.deleteMany({
    where: { id: { in: manifest.envelopeIds } },
  });
  const accounts = await prisma.account.deleteMany({
    where: { id: { in: manifest.accountIds } },
  });

  rmSync(MANIFEST);

  console.log(
    `Borrado: ${movements.count} movimientos, ${plans.count} planes, ` +
      `${recurrences.count} compromisos, ${envelopes.count} sobres, ` +
      `${accounts.count} cuentas.`,
  );
}

async function seed() {
  if (existsSync(MANIFEST)) {
    console.log(
      "Ya hay datos de prueba cargados. Corre `npm run seed:demo -- clean` primero.",
    );
    return;
  }

  const workspace = await prisma.workspace.findFirstOrThrow({
    select: { id: true, baseCurrency: true },
  });

  const accounts = await prisma.account.findMany({
    where: { workspaceId: workspace.id },
  });

  const pesos = accounts.find((a) => a.name === "Cuenta en pesos")!;
  const ahorro = accounts.find((a) => a.name === "Ahorro en dolares")!;
  const efectivo = accounts.find((a) => a.name === "Efectivo")!;

  const categories = await prisma.category.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true, name: true },
  });

  function cat(name: string): string {
    const found = categories.find((c) => c.name === name);
    if (!found) throw new Error(`No existe la categoria "${name}"`);
    return found.id;
  }

  const manifest: Manifest = {
    accountIds: [],
    envelopeIds: [],
    recurrenceIds: [],
    planIds: [],
  };

  console.log("Creando la tarjeta...");

  // Hace falta una tarjeta para que las cuotas tengan sentido: es la unica
  // cuenta donde la fecha de compra y la de pago no coinciden.
  const tarjeta = await prisma.account.create({
    data: {
      workspaceId: workspace.id,
      name: "Tarjeta de credito",
      type: "CREDIT_CARD",
      currency: "UYU",
      openingBalance: "0",
      color: "#a855f7",
      statementClosingDay: 25,
      paymentDueDay: 5,
      sortOrder: 10,
    },
  });
  manifest.accountIds.push(tarjeta.id);

  console.log("Generando seis meses de movimientos...");

  type Row = {
    type: "EXPENSE" | "INCOME";
    accountId: string;
    categoryId: string;
    amount: string;
    day: number;
    description?: string;
    merchant?: string;
    envelope?: "salidas" | "nafta";
  };

  const months = [2, 3, 4, 5, 6, 7];
  const rows: (Row & { month: number })[] = [];

  for (const month of months) {
    const push = (row: Row) => rows.push({ ...row, month });

    // Sueldo el 1. Sube un poco a mitad de anio, como pasa de verdad.
    push({
      type: "INCOME",
      accountId: pesos.id,
      categoryId: cat("Sueldo"),
      amount: month >= 5 ? "92000" : "85000",
      day: 1,
      description: "Sueldo",
    });

    if (month === 6) {
      push({
        type: "INCOME",
        accountId: pesos.id,
        categoryId: cat("Aguinaldo"),
        amount: "42000",
        day: 20,
        description: "Aguinaldo",
      });
    }

    if (month === 4 || month === 7) {
      push({
        type: "INCOME",
        accountId: pesos.id,
        categoryId: cat("Freelance"),
        amount: around(15000, 4000),
        day: 18,
        description: "Laburo aparte",
      });
    }

    // Fijos
    push({ type: "EXPENSE", accountId: pesos.id, categoryId: cat("Casa"), amount: "24000", day: 5, description: "Alquiler" });
    push({ type: "EXPENSE", accountId: pesos.id, categoryId: cat("Casa"), amount: "3800", day: 5, description: "Gastos comunes" });
    push({ type: "EXPENSE", accountId: pesos.id, categoryId: cat("Servicios"), amount: around(2600, 900), day: 12, description: "UTE", merchant: "UTE" });
    push({ type: "EXPENSE", accountId: pesos.id, categoryId: cat("Servicios"), amount: around(950, 200), day: 14, description: "OSE", merchant: "OSE" });
    push({ type: "EXPENSE", accountId: pesos.id, categoryId: cat("Servicios"), amount: "1690", day: 10, description: "Internet", merchant: "Antel" });
    push({ type: "EXPENSE", accountId: pesos.id, categoryId: cat("Salud"), amount: "3450", day: 8, description: "Mutualista" });

    // Suscripciones, en la tarjeta como en la vida real
    push({ type: "EXPENSE", accountId: tarjeta.id, categoryId: cat("Suscripciones"), amount: "590", day: 15, description: "Netflix", merchant: "Netflix" });
    push({ type: "EXPENSE", accountId: tarjeta.id, categoryId: cat("Suscripciones"), amount: "350", day: 16, description: "Spotify", merchant: "Spotify" });
    push({ type: "EXPENSE", accountId: tarjeta.id, categoryId: cat("Deporte"), amount: "1900", day: 3, description: "Gimnasio" });

    // Supermercado: cuatro o cinco compras
    const compras = 4 + Math.round(random());
    for (let i = 0; i < compras; i++) {
      push({
        type: "EXPENSE",
        accountId: random() > 0.4 ? pesos.id : tarjeta.id,
        categoryId: cat("Supermercado"),
        amount: around(4200, 2200),
        day: 3 + i * 6,
        description: "Supermercado",
        merchant: pick(["Tienda Inglesa", "Disco", "Devoto", "Tata"]),
      });
    }

    // Transporte
    push({ type: "EXPENSE", accountId: pesos.id, categoryId: cat("Transporte"), amount: around(1900, 400), day: 2, description: "Carga STM" });
    for (let i = 0; i < 2; i++) {
      push({
        type: "EXPENSE",
        accountId: pesos.id,
        categoryId: cat("Transporte"),
        amount: around(2900, 700),
        day: 9 + i * 13,
        description: "Nafta",
        merchant: "Ancap",
        envelope: "nafta",
      });
    }
    if (random() > 0.5) {
      push({ type: "EXPENSE", accountId: efectivo.id, categoryId: cat("Transporte"), amount: around(700, 300), day: 22, description: "Uber" });
    }

    // Salidas: lo que se lleva el sobre
    const salidas = 2 + Math.round(random() * 2);
    for (let i = 0; i < salidas; i++) {
      push({
        type: "EXPENSE",
        accountId: random() > 0.5 ? tarjeta.id : efectivo.id,
        categoryId: cat(pick(["Comida", "Salidas", "Comida"])),
        amount: around(1800, 900),
        day: 6 + i * 7,
        description: pick(["Salida", "Cena afuera", "Pedido", "Birras"]),
        envelope: "salidas",
      });
    }

    // Varios que aparecen y desaparecen
    push({ type: "EXPENSE", accountId: pesos.id, categoryId: cat("Comida"), amount: around(900, 400), day: 11, description: "Cafe" });
    if (random() > 0.4) {
      push({ type: "EXPENSE", accountId: pesos.id, categoryId: cat("Salud"), amount: around(1200, 600), day: 19, description: "Farmacia" });
    }
    if (random() > 0.6) {
      push({ type: "EXPENSE", accountId: tarjeta.id, categoryId: cat("Compras"), amount: around(4500, 2500), day: 21, description: "Ropa" });
    }
    if (random() > 0.7) {
      push({ type: "EXPENSE", accountId: pesos.id, categoryId: cat("Prestar plata"), amount: "1500", day: 24, description: "Le preste a un amigo" });
    }
  }

  console.log(`  ${rows.length} movimientos comunes`);

  // Se insertan todos juntos: uno por uno serian 150 idas y vueltas a Ohio.
  await prisma.transaction.createMany({
    data: rows.map((row, index) => {
      const date = toDateOnly(
        `2026-${String(row.month).padStart(2, "0")}-${String(row.day).padStart(2, "0")}`,
      );
      const account = row.accountId === tarjeta.id ? tarjeta : pesos;

      return {
        workspaceId: workspace.id,
        type: row.type,
        date,
        settlementDate: resolveSettlementDate(account, date),
        accountId: row.accountId,
        categoryId: row.categoryId,
        amount: row.amount,
        currency: "UYU" as const,
        amountBase: row.amount,
        baseRate: "1",
        description: row.description ?? null,
        merchant: row.merchant ?? null,
        externalId: `demo:${index}`,
        source: "MANUAL" as const,
      };
    }),
  });

  console.log("Creando sobres y metas...");

  const salidas = await prisma.envelope.create({
    data: {
      workspaceId: workspace.id,
      name: "Salidas",
      kind: "MONTHLY",
      currency: "UYU",
      monthlyAmount: "7000",
      rollover: "RESET",
      color: "#ec4899",
      createdAt: toDateOnly("2026-02-01"),
    },
  });

  const nafta = await prisma.envelope.create({
    data: {
      workspaceId: workspace.id,
      name: "Nafta",
      kind: "MONTHLY",
      currency: "UYU",
      monthlyAmount: "6500",
      rollover: "CARRY_OVER",
      color: "#f59e0b",
      createdAt: toDateOnly("2026-02-01"),
    },
  });

  const viaje = await prisma.envelope.create({
    data: {
      workspaceId: workspace.id,
      name: "Viaje",
      kind: "GOAL",
      currency: "USD",
      targetAmount: "3000",
      targetDate: toDateOnly("2027-01-15"),
      accountId: ahorro.id,
      color: "#0ea5e9",
      createdAt: toDateOnly("2026-02-01"),
    },
  });

  manifest.envelopeIds.push(salidas.id, nafta.id, viaje.id);

  // Los movimientos ya cargados se enganchan al sobre que les toca.
  const envelopeByKind = { salidas: salidas.id, nafta: nafta.id };
  for (const [kind, envelopeId] of Object.entries(envelopeByKind)) {
    const ids = rows
      .map((row, index) => (row.envelope === kind ? `demo:${index}` : null))
      .filter((id): id is string => id !== null);

    await prisma.transaction.updateMany({
      where: { workspaceId: workspace.id, externalId: { in: ids } },
      data: { envelopeId },
    });
  }

  console.log("Creando compras en cuotas...");

  const heladera = await createInstallmentPlan(
    {
      workspaceId: workspace.id,
      account: tarjeta,
      totalAmount: new Decimal("45000"),
      count: 6,
      purchaseDate: toDateOnly("2026-03-20"),
      description: "Heladera",
      merchant: "Tienda Inglesa",
      categoryId: cat("Compras"),
    },
    workspace.baseCurrency,
  );

  const notebook = await createInstallmentPlan(
    {
      workspaceId: workspace.id,
      account: tarjeta,
      totalAmount: new Decimal("78000"),
      count: 12,
      purchaseDate: toDateOnly("2026-05-08"),
      description: "Notebook",
      merchant: "Mercado Libre",
      categoryId: cat("Compras"),
    },
    workspace.baseCurrency,
  );

  manifest.planIds.push(heladera.id, notebook.id);

  console.log("Sacando plata del cajero...");

  // Sin esto el efectivo queda en negativo: se gastaba plata que nunca habia
  // entrado. La plata en la mano sale de algun lado.
  for (const month of months) {
    const retiro = await createTransfer(
      {
        workspaceId: workspace.id,
        from: pesos,
        to: efectivo,
        amount: new Decimal("6000"),
        toAmount: new Decimal("6000"),
        date: toDateOnly(`2026-${String(month).padStart(2, "0")}-04`),
        description: "Cajero",
      },
      workspace.baseCurrency,
    );

    await prisma.transaction.update({
      where: { id: retiro.id },
      data: { externalId: `demo:cajero-${month}` },
    });
  }

  console.log("Pasando plata a dolares mes a mes...");

  // El flujo de Alejo: entra el sueldo, paga lo que tiene que pagar y manda
  // una parte a la cuenta en dolares.
  for (const month of months) {
    const rate = new Decimal(rateFor(month));
    const usd = new Decimal(month === 6 ? "700" : "450");
    const uyu = usd.mul(rate).toDecimalPlaces(2);

    const transfer = await createTransfer(
      {
        workspaceId: workspace.id,
        from: pesos,
        to: ahorro,
        amount: uyu,
        toAmount: usd,
        date: toDateOnly(`2026-${String(month).padStart(2, "0")}-06`),
        description: "Paso a dolares",
        envelopeId: viaje.id,
      },
      workspace.baseCurrency,
    );

    await prisma.transaction.update({
      where: { id: transfer.id },
      data: { externalId: `demo:transfer-${month}` },
    });
  }

  console.log("Un mes que no cerro: sacando del ahorro...");

  // Mayo se fue de mano por la notebook. Sacar del ahorro es la senal que
  // el dashboard tiene que marcar.
  const desahorro = await createTransfer(
    {
      workspaceId: workspace.id,
      from: ahorro,
      to: pesos,
      amount: new Decimal("200"),
      toAmount: new Decimal("200").mul(rateFor(5)).toDecimalPlaces(2),
      date: toDateOnly("2026-05-27"),
      description: "Saque del ahorro para llegar",
    },
    workspace.baseCurrency,
  );
  await prisma.transaction.update({
    where: { id: desahorro.id },
    data: { externalId: "demo:desahorro" },
  });

  console.log("Creando compromisos...");

  const commitments = [
    { kind: "SUBSCRIPTION" as const, type: "EXPENSE" as const, description: "Netflix", amount: "590", accountId: tarjeta.id, categoryId: cat("Suscripciones"), frequency: "MONTHLY" as const, day: 15, mode: "AUTO" as const },
    { kind: "SUBSCRIPTION" as const, type: "EXPENSE" as const, description: "Spotify", amount: "350", accountId: tarjeta.id, categoryId: cat("Suscripciones"), frequency: "MONTHLY" as const, day: 16, mode: "AUTO" as const },
    { kind: "SUBSCRIPTION" as const, type: "EXPENSE" as const, description: "Gimnasio", amount: "1900", accountId: tarjeta.id, categoryId: cat("Deporte"), frequency: "MONTHLY" as const, day: 3, mode: "CONFIRM" as const },
    { kind: "SUBSCRIPTION" as const, type: "EXPENSE" as const, description: "Dominio y hosting", amount: "9600", accountId: tarjeta.id, categoryId: cat("Suscripciones"), frequency: "YEARLY" as const, day: 12, mode: "CONFIRM" as const },
    { kind: "FIXED_EXPENSE" as const, type: "EXPENSE" as const, description: "Alquiler", amount: "24000", accountId: pesos.id, categoryId: cat("Casa"), frequency: "MONTHLY" as const, day: 5, mode: "CONFIRM" as const },
    { kind: "FIXED_EXPENSE" as const, type: "EXPENSE" as const, description: "Mutualista", amount: "3450", accountId: pesos.id, categoryId: cat("Salud"), frequency: "MONTHLY" as const, day: 8, mode: "CONFIRM" as const },
    { kind: "INCOME" as const, type: "INCOME" as const, description: "Sueldo", amount: "92000", accountId: pesos.id, categoryId: cat("Sueldo"), frequency: "MONTHLY" as const, day: 1, mode: "CONFIRM" as const },
  ];

  for (const item of commitments) {
    // Se apunta a agosto: los de julio ya estan cargados como movimientos, y
    // duplicarlos seria contar dos veces el mismo gasto.
    const next = toDateOnly(`2026-08-${String(item.day).padStart(2, "0")}`);

    const created = await prisma.recurrence.create({
      data: {
        workspaceId: workspace.id,
        kind: item.kind,
        type: item.type,
        accountId: item.accountId,
        categoryId: item.categoryId,
        description: item.description,
        amount: item.amount,
        currency: "UYU",
        frequency: item.frequency,
        dayOfMonth: item.day,
        startDate: next,
        nextRunDate: next,
        mode: item.mode,
      },
    });
    manifest.recurrenceIds.push(created.id);
  }

  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

  const total = await prisma.transaction.count({
    where: { workspaceId: workspace.id },
  });

  console.log(`\nListo. El workspace quedo con ${total} movimientos.`);
  console.log("Para borrarlo todo: npm run seed:demo -- clean");
}

const action = process.argv[2] === "clean" ? clean : seed;

action()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
