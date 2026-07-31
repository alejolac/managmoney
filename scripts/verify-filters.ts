/**
 * Verifica que cada filtro de la lista de movimientos devuelva exactamente lo
 * que tiene que devolver. Uso: npm run verify:filters
 *
 * Crea un workspace de prueba con movimientos conocidos, consulta, y borra todo
 * al terminar.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { buildWhere } from "../src/lib/transaction-list";
import { EMPTY_FILTERS, parseFilters } from "../src/lib/transaction-filters";
import { toDateOnly } from "../src/lib/dates";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) failures++;
}

const NAME = "__verify_filters__";

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

  const comida = await prisma.category.create({
    data: {
      workspaceId: workspace.id,
      name: "Supermercado",
      kind: "EXPENSE",
    },
  });

  const sueldo = await prisma.category.create({
    data: { workspaceId: workspace.id, name: "Sueldo", kind: "INCOME" },
  });

  const base = { workspaceId: workspace.id, baseRate: "1" };

  await prisma.transaction.createMany({
    data: [
      {
        ...base,
        type: "INCOME",
        accountId: pesos.id,
        categoryId: sueldo.id,
        amount: "50000",
        amountBase: "50000",
        currency: "UYU",
        description: "Sueldo de marzo",
        date: toDateOnly("2026-03-01"),
        settlementDate: toDateOnly("2026-03-01"),
      },
      {
        ...base,
        type: "EXPENSE",
        accountId: pesos.id,
        categoryId: comida.id,
        amount: "3500",
        amountBase: "3500",
        currency: "UYU",
        description: "Compra grande",
        merchant: "Tienda Inglesa",
        date: toDateOnly("2026-03-10"),
        settlementDate: toDateOnly("2026-03-10"),
      },
      {
        ...base,
        type: "EXPENSE",
        accountId: pesos.id,
        categoryId: comida.id,
        amount: "1200",
        amountBase: "1200",
        currency: "UYU",
        description: "Feria",
        date: toDateOnly("2026-04-02"),
        settlementDate: toDateOnly("2026-04-02"),
      },
      {
        ...base,
        type: "EXPENSE",
        accountId: dolares.id,
        amount: "20",
        amountBase: "800",
        baseRate: "40",
        currency: "USD",
        description: "Suscripcion",
        date: toDateOnly("2026-03-15"),
        settlementDate: toDateOnly("2026-03-15"),
      },
      {
        ...base,
        type: "TRANSFER",
        accountId: pesos.id,
        toAccountId: dolares.id,
        toAmount: "500",
        toCurrency: "USD",
        amount: "20000",
        amountBase: "20000",
        currency: "UYU",
        description: "Paso a dolares",
        date: toDateOnly("2026-03-20"),
        settlementDate: toDateOnly("2026-03-20"),
      },
    ],
  });

  async function descriptions(filters: Partial<typeof EMPTY_FILTERS>) {
    const rows = await prisma.transaction.findMany({
      where: buildWhere(workspace.id, { ...EMPTY_FILTERS, ...filters }),
      orderBy: { settlementDate: "asc" },
      select: { description: true },
    });
    return rows.map((row) => row.description).join(", ");
  }

  async function countRows(filters: Partial<typeof EMPTY_FILTERS>) {
    return prisma.transaction.count({
      where: buildWhere(workspace.id, { ...EMPTY_FILTERS, ...filters }),
    });
  }

  console.log("-- filtros sueltos --");

  check("sin filtros trae los 5", (await countRows({})) === 5, await descriptions({}));

  check(
    "tipo=EXPENSE deja fuera el sueldo y la transferencia",
    (await descriptions({ type: "EXPENSE" })) ===
      "Compra grande, Suscripcion, Feria",
    await descriptions({ type: "EXPENSE" }),
  );

  check(
    "categoria trae solo esa categoria",
    (await descriptions({ categoryId: comida.id })) ===
      "Compra grande, Feria",
    await descriptions({ categoryId: comida.id }),
  );

  check(
    "moneda=USD incluye la transferencia por su lado de destino",
    (await descriptions({ currency: "USD" })) ===
      "Suscripcion, Paso a dolares",
    await descriptions({ currency: "USD" }),
  );

  check(
    "cuenta=dolares agarra las dos puntas de la transferencia",
    (await descriptions({ accountId: dolares.id })) ===
      "Suscripcion, Paso a dolares",
    await descriptions({ accountId: dolares.id }),
  );

  check(
    "texto busca tambien en el comercio",
    (await descriptions({ q: "inglesa" })) === "Compra grande",
    await descriptions({ q: "inglesa" }),
  );

  check(
    "el texto no distingue mayusculas",
    (await descriptions({ q: "SUELDO" })) === "Sueldo de marzo",
    await descriptions({ q: "SUELDO" }),
  );

  console.log("\n-- rangos de fecha --");

  check(
    "marzo entero: 4 movimientos",
    (await descriptions({ from: "2026-03-01", to: "2026-03-31" })) ===
      "Sueldo de marzo, Compra grande, Suscripcion, Paso a dolares",
    await descriptions({ from: "2026-03-01", to: "2026-03-31" }),
  );

  check(
    "el 'hasta' incluye ese mismo dia",
    (await descriptions({ from: "2026-03-10", to: "2026-03-10" })) ===
      "Compra grande",
    await descriptions({ from: "2026-03-10", to: "2026-03-10" }),
  );

  check(
    "el 'desde' incluye ese mismo dia",
    (await descriptions({ from: "2026-04-02" })) === "Feria",
    await descriptions({ from: "2026-04-02" }),
  );

  console.log("\n-- filtros combinados (el AND tiene que acumular) --");

  check(
    "gastos de supermercado en marzo: solo uno",
    (await descriptions({
      type: "EXPENSE",
      categoryId: comida.id,
      from: "2026-03-01",
      to: "2026-03-31",
    })) === "Compra grande",
    await descriptions({
      type: "EXPENSE",
      categoryId: comida.id,
      from: "2026-03-01",
      to: "2026-03-31",
    }),
  );

  check(
    "texto + cuenta no se pisan entre si",
    (await descriptions({ q: "compra", accountId: dolares.id })) === "",
    `"${await descriptions({ q: "compra", accountId: dolares.id })}"`,
  );

  check(
    "una combinacion sin resultados devuelve vacio, no todo",
    (await descriptions({ type: "INCOME", categoryId: comida.id })) === "",
    `"${await descriptions({ type: "INCOME", categoryId: comida.id })}"`,
  );

  console.log("\n-- lo que llega por la URL no se cree --");

  const hostile = parseFilters({
    tipo: "DROP TABLE",
    moneda: "BTC",
    desde: "no-es-fecha",
    pagina: "-5",
    q: ["primero", "segundo"],
  });

  check("un tipo inventado queda en null", hostile.type === null);
  check("una moneda inventada queda en null", hostile.currency === null);
  check("una fecha con formato raro queda en null", hostile.from === null);
  check("una pagina negativa vuelve a 1", hostile.page === 1);
  check("de un parametro repetido se toma el primero", hostile.q === "primero");

  // Todos los parametros de `hostile` son invalidos salvo `q`, que aca se saca
  // para comprobar lo que importa: que ninguno de los otros llegue a filtrar.
  check(
    "con los filtros basura la consulta trae todo igual",
    (await countRows({ ...hostile, q: null })) === 5,
    String(await countRows({ ...hostile, q: null })),
  );

  const injection = await descriptions({ q: "%' OR '1'='1" });
  check(
    "un intento de inyeccion se busca como texto literal",
    injection === "",
    `"${injection}"`,
  );

  await prisma.workspace.delete({ where: { id: workspace.id } });

  console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLARON`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch(async (error) => {
    console.error(error);
    await prisma.workspace.deleteMany({ where: { name: NAME } });
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
