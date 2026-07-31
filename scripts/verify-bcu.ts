/**
 * Verifica el cliente del BCU contra el servicio real y la cotizacion contra
 * la base. Uso: npm run verify:bcu
 *
 * Es el unico verificador que depende de internet: si el BCU esta caido, falla
 * aunque el codigo este bien. Lo dice al final para no confundir.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { fetchBcuQuotes, syncBcuRates } from "../src/lib/bcu";
import { findReferenceRate } from "../src/lib/exchange-rate";
import { Decimal } from "../src/lib/money";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  console.log("-- consulta al BCU --");

  const to = new Date();
  const from = new Date(to.getTime() - 10 * 86_400_000);

  const quotes = await fetchBcuQuotes({ currencies: ["USD"], from, to });

  check("devuelve al menos una cotizacion", quotes.length > 0, `${quotes.length}`);

  if (quotes.length === 0) {
    console.log("\nSin datos del BCU, no se puede seguir.");
    process.exitCode = 1;
    return;
  }

  check(
    "todas son del dolar",
    quotes.every((quote) => quote.currency === "USD"),
  );

  check(
    "los valores son plausibles para el peso uruguayo (20 a 90)",
    quotes.every((quote) => quote.rate.gt(20) && quote.rate.lt(90)),
    quotes.map((quote) => quote.rate.toString()).join(", "),
  );

  check(
    "las fechas caen dentro del rango pedido",
    quotes.every(
      (quote) =>
        quote.date >= new Date(from.toISOString().slice(0, 10)) &&
        quote.date <= to,
    ),
  );

  check(
    "no hay fines de semana (el BCU no cotiza sabado ni domingo)",
    quotes.every((quote) => {
      const day = quote.date.getUTCDay();
      return day !== 0 && day !== 6;
    }),
    quotes
      .map((quote) => `${quote.date.toISOString().slice(0, 10)}`)
      .join(", "),
  );

  check(
    "las fechas no se repiten",
    new Set(quotes.map((quote) => quote.date.getTime())).size === quotes.length,
  );

  const ordered = [...quotes].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const jumps = ordered.slice(1).map((quote, index) =>
    quote.rate.minus(ordered[index].rate).abs().div(ordered[index].rate),
  );
  check(
    "no salta mas de 10% de un dia al otro (si salta, algo se parseo mal)",
    jumps.every((jump) => jump.lt("0.1")),
    jumps.map((jump) => jump.mul(100).toFixed(2) + "%").join(", "),
  );

  console.log("-- pedir una moneda que el BCU no cotiza --");

  const vacio = await fetchBcuQuotes({
    currencies: ["UYU"],
    from,
    to,
  });
  check("UYU no tiene codigo en el BCU y devuelve vacio", vacio.length === 0);

  console.log("\n-- guardado y lectura --");

  const result = await syncBcuRates();
  check("sincroniza y guarda", result.saved > 0, `${result.saved} filas`);

  const usd = result.latest.find((quote) => quote.currency === "USD");
  check("queda la ultima del dolar", usd !== undefined);

  if (usd) {
    const stored = await findReferenceRate("USD", "UYU", usd.date);
    check(
      "lo guardado se lee igual",
      stored !== null && stored.equals(usd.rate),
      `${stored} vs ${usd.rate}`,
    );

    // La direccion inversa no se guarda: se deriva.
    const inverse = await findReferenceRate("UYU", "USD", usd.date);
    const expected = new Decimal(1).div(usd.rate);
    check(
      "la direccion inversa sale de la inversa del numero",
      inverse !== null && inverse.minus(expected).abs().lt("0.000001"),
      `${inverse} vs ${expected}`,
    );

    check(
      "guardar dos veces no duplica",
      (await prisma.exchangeRate.count({
        where: { from: "USD", to: "UYU", date: usd.date },
      })) === 1,
    );

    check("queda marcada como del bcu",
      (await prisma.exchangeRate.findFirst({
        where: { from: "USD", to: "UYU", date: usd.date },
        select: { source: true },
      }))?.source === "bcu",
    );
  }

  console.log("\n-- cuando el BCU no contesta --");

  let threw = false;
  try {
    await fetchBcuQuotes({ currencies: ["USD"], from, to, timeoutMs: 1 });
  } catch {
    threw = true;
  }
  check("un timeout tira error en vez de devolver datos falsos", threw);

  const stillThere = await findReferenceRate("USD", "UYU", new Date());
  check(
    "y las cotizaciones ya guardadas siguen estando",
    stillThere !== null,
    stillThere?.toString(),
  );
}

main()
  .catch((error) => {
    console.error(error);
    failures++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLARON`);
    process.exitCode = failures === 0 ? 0 : 1;
  });
