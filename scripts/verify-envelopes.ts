/**
 * Verifica los sobres: cuanto queda, el arrastre mes a mes y que un sobre no
 * cuente plata de otra moneda. Uso: npm run verify:envelopes
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { getEnvelopeStatus, setAllocation } from "../src/lib/envelopes";
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

const NAME = "__verify_envelopes__";

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

  // El sobre se crea con fecha vieja para que el arrastre tenga meses que
  // recorrer: el recorrido arranca en el mes en que nacio el sobre.
  const nacimiento = toDateOnly("2026-05-01");

  const salidas = await prisma.envelope.create({
    data: {
      workspaceId: workspace.id,
      name: "Salidas",
      kind: "MONTHLY",
      currency: "UYU",
      monthlyAmount: "4000",
      rollover: "RESET",
      createdAt: nacimiento,
    },
  });

  const nafta = await prisma.envelope.create({
    data: {
      workspaceId: workspace.id,
      name: "Nafta",
      kind: "MONTHLY",
      currency: "UYU",
      monthlyAmount: "3000",
      rollover: "CARRY_OVER",
      createdAt: nacimiento,
    },
  });

  const viaje = await prisma.envelope.create({
    data: {
      workspaceId: workspace.id,
      name: "Viaje",
      kind: "GOAL",
      currency: "USD",
      targetAmount: "3000",
      createdAt: nacimiento,
    },
  });

  const base = { workspaceId: workspace.id, baseRate: "1" };

  function gasto(
    envelopeId: string,
    amount: string,
    date: string,
    currency: "UYU" | "USD" = "UYU",
    accountId = pesos.id,
  ) {
    const day = toDateOnly(date);
    return {
      ...base,
      type: "EXPENSE" as const,
      accountId,
      envelopeId,
      amount,
      currency,
      amountBase: currency === "UYU" ? amount : "0",
      date: day,
      settlementDate: day,
    };
  }

  await prisma.transaction.createMany({
    data: [
      // Salidas (RESET, 4.000/mes)
      gasto(salidas.id, "1500", "2026-06-05"),
      gasto(salidas.id, "1000", "2026-06-20"),
      gasto(salidas.id, "500", "2026-07-03"),

      // Nafta (CARRY_OVER, 3.000/mes): mayo 1.000, junio 2.000
      gasto(nafta.id, "1000", "2026-05-10"),
      gasto(nafta.id, "2000", "2026-06-10"),

      // Un gasto en dolares apuntado a un sobre de pesos: NO tiene que contar.
      gasto(salidas.id, "50", "2026-07-04", "USD", dolares.id),
    ],
  });

  // Aportes a la meta: una transferencia de pesos a dolares cuenta lo que
  // ENTRA, en la moneda del sobre.
  await prisma.transaction.create({
    data: {
      ...base,
      type: "TRANSFER",
      accountId: pesos.id,
      currency: "UYU",
      amount: "20000",
      amountBase: "20000",
      toAccountId: dolares.id,
      toAmount: "500",
      toCurrency: "USD",
      envelopeId: viaje.id,
      isDissaving: false,
      date: toDateOnly("2026-06-15"),
      settlementDate: toDateOnly("2026-06-15"),
    },
  });

  console.log("-- sobre que se reinicia cada mes --");

  const junio = await getEnvelopeStatus(workspace.id, 2026, 6);
  const salidasJunio = junio.find((item) => item.id === salidas.id)!;

  check(
    "junio: asignado 4.000",
    salidasJunio.allocated.equals(4000),
    salidasJunio.allocated.toString(),
  );
  check(
    "junio: gastado 2.500",
    salidasJunio.spent.equals(2500),
    salidasJunio.spent.toString(),
  );
  check(
    "junio: queda 1.500",
    salidasJunio.available.equals(1500),
    salidasJunio.available.toString(),
  );
  check(
    "junio: uso 62,5%",
    salidasJunio.usedPercent === 62.5,
    String(salidasJunio.usedPercent),
  );

  const julio = await getEnvelopeStatus(workspace.id, 2026, 7);
  const salidasJulio = julio.find((item) => item.id === salidas.id)!;

  check(
    "julio: el sobrante de junio NO pasa (queda 3.500, no 5.000)",
    salidasJulio.available.equals(3500),
    salidasJulio.available.toString(),
  );
  check(
    "julio: el gasto en dolares no ensucia un sobre de pesos",
    salidasJulio.spent.equals(500),
    salidasJulio.spent.toString(),
  );

  console.log("\n-- sobre que arrastra --");

  const naftaJunio = junio.find((item) => item.id === nafta.id)!;
  check(
    "junio: arrastra los 2.000 que sobraron de mayo",
    naftaJunio.carriedIn.equals(2000),
    naftaJunio.carriedIn.toString(),
  );
  check(
    "junio: 3.000 + 2.000 - 2.000 = 3.000 disponibles",
    naftaJunio.available.equals(3000),
    naftaJunio.available.toString(),
  );

  const naftaJulio = julio.find((item) => item.id === nafta.id)!;
  check(
    "julio: el arrastre se acumula (2.000 de mayo + 1.000 de junio = 3.000)",
    naftaJulio.carriedIn.equals(3000),
    naftaJulio.carriedIn.toString(),
  );
  check(
    "julio: quedan 6.000 sin gastar nada",
    naftaJulio.available.equals(6000),
    naftaJulio.available.toString(),
  );

  console.log("\n-- meta de ahorro --");

  const viajeJulio = julio.find((item) => item.id === viaje.id)!;
  check(
    "cuenta los 500 que ENTRARON, no los 20.000 que salieron",
    viajeJulio.saved.equals(500),
    viajeJulio.saved.toString(),
  );
  check(
    "avance 500 de 3000 = 16,7%",
    viajeJulio.progress === 16.7,
    String(viajeJulio.progress),
  );
  check(
    "una meta no arrastra ni resetea: es el total de siempre",
    viajeJulio.saved.equals(
      junio.find((item) => item.id === viaje.id)!.saved,
    ),
  );

  console.log("\n-- ajuste de un mes puntual --");

  await setAllocation({
    workspaceId: workspace.id,
    envelopeId: salidas.id,
    year: 2026,
    month: 7,
    amount: new Decimal("10000"),
  });

  const julioAjustado = await getEnvelopeStatus(workspace.id, 2026, 7);
  const salidasAjustado = julioAjustado.find((item) => item.id === salidas.id)!;

  check(
    "julio pisado a 10.000",
    salidasAjustado.allocated.equals(10000),
    salidasAjustado.allocated.toString(),
  );
  check("queda marcado como ajuste del mes", salidasAjustado.overridden);
  check(
    "quedan 9.500",
    salidasAjustado.available.equals(9500),
    salidasAjustado.available.toString(),
  );

  const agosto = await getEnvelopeStatus(workspace.id, 2026, 8);
  const salidasAgosto = agosto.find((item) => item.id === salidas.id)!;
  check(
    "agosto vuelve a los 4.000 de siempre",
    salidasAgosto.allocated.equals(4000) && !salidasAgosto.overridden,
    salidasAgosto.allocated.toString(),
  );

  console.log("\n-- gastar de mas --");

  await prisma.transaction.create({
    data: gasto(salidas.id, "6000", "2026-08-10"),
  });

  const agosto2 = await getEnvelopeStatus(workspace.id, 2026, 8);
  const pasado = agosto2.find((item) => item.id === salidas.id)!;
  check(
    "el disponible queda en negativo",
    pasado.available.equals(-2000),
    pasado.available.toString(),
  );
  check("el uso pasa de 100%", pasado.usedPercent === 150, String(pasado.usedPercent));

  // Un sobre que arrastra no puede empezar el mes debiendo: eso ya se vio.
  await prisma.transaction.create({
    data: gasto(nafta.id, "20000", "2026-08-10"),
  });
  const setiembre = await getEnvelopeStatus(workspace.id, 2026, 9);
  const naftaSetiembre = setiembre.find((item) => item.id === nafta.id)!;
  check(
    "un arrastre negativo se corta en cero",
    naftaSetiembre.carriedIn.isZero(),
    naftaSetiembre.carriedIn.toString(),
  );

  console.log("\n-- un sobre ajeno no se toca --");

  const otro = await prisma.workspace.create({
    data: { name: `${NAME}_otro`, baseCurrency: "UYU" },
  });

  let blocked = false;
  try {
    await setAllocation({
      workspaceId: otro.id,
      envelopeId: salidas.id,
      year: 2026,
      month: 7,
      amount: new Decimal("1"),
    });
  } catch {
    blocked = true;
  }
  check("no se puede cambiar el sobre de otro workspace", blocked);

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
