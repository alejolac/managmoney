/**
 * Verificacion del nucleo de dinero. Uso: npm run verify:money
 *
 * parseAmount es la funcion mas peligrosa del proyecto: si interpreta mal un
 * separador, "1.500" pasa de mil quinientos a uno con cinco.
 */
import {
  Decimal,
  deriveRate,
  formatCompact,
  formatMoney,
  parseAmount,
  roundMoney,
  toBaseAmount,
} from "../src/lib/money";

let failures = 0;

function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? ` -> ${detail}` : ""}`);
  if (!ok) failures++;
}

function expectAmount(input: string, expected: string) {
  const parsed = parseAmount(input);
  const actual = parsed ? parsed.toString() : "null";
  check(`"${input}" = ${expected}`, actual === expected, actual !== expected ? actual : undefined);
}

console.log("\n-- parseAmount: formato uruguayo --");
expectAmount("1.234,56", "1234.56");
expectAmount("1.500", "1500");
expectAmount("1.234.567", "1234567");
expectAmount("1.234.567,89", "1234567.89");
expectAmount("0,5", "0.5");
expectAmount("1,50", "1.5");

console.log("\n-- parseAmount: formato de planilla --");
expectAmount("1234.56", "1234.56");
expectAmount("1234", "1234");
expectAmount("12.5", "12.5");
expectAmount("0.05", "0.05");

console.log("\n-- parseAmount: formato ingles --");
expectAmount("1,234.56", "1234.56");
expectAmount("1,500", "1500");

console.log("\n-- parseAmount: ruido y negativos --");
expectAmount("$ 1.234,56", "1234.56");
expectAmount("US$ 250", "250");
expectAmount("  980  ", "980");
expectAmount("-50,25", "-50.25");

console.log("\n-- parseAmount: entradas invalidas --");
check('"" es null', parseAmount("") === null);
check('"abc" es null', parseAmount("abc") === null);
check('"$" es null', parseAmount("$") === null);

console.log("\n-- redondeo --");
check(
  "0,005 sube a 0,01 (half up, como el banco)",
  roundMoney(new Decimal("0.005"), "UYU").toString() === "0.01",
  roundMoney(new Decimal("0.005"), "UYU").toString(),
);
check(
  "0,015 sube a 0,02 y no baja a 0,01 (half even daria 0,02 tambien)",
  roundMoney(new Decimal("0.015"), "UYU").toString() === "0.02",
);
check(
  "0,025 sube a 0,03 (half even daria 0,02)",
  roundMoney(new Decimal("0.025"), "UYU").toString() === "0.03",
  roundMoney(new Decimal("0.025"), "UYU").toString(),
);
check(
  "0.1 + 0.2 da exactamente 0.3",
  new Decimal("0.1").plus("0.2").equals(new Decimal("0.3")),
);

console.log("\n-- cotizacion efectiva de un cambio real --");
// El caso concreto: salen $40.000 de la cuenta en pesos, entran USD 1.000.
const rate = deriveRate(new Decimal(40000), new Decimal(1000));
check("$40.000 por USD 1.000 da 40", rate.toString() === "40", rate.toString());

const spread = deriveRate(new Decimal("41250.75"), new Decimal("1000"));
check(
  "captura el spread del banco con decimales",
  spread.toString() === "41.25075",
  spread.toString(),
);
check("dividir por cero no explota", deriveRate(new Decimal(100), new Decimal(0)).isZero());

console.log("\n-- conversion a moneda base --");
const base = toBaseAmount(new Decimal("250.50"), new Decimal("40.25"), "UYU");
check(
  "USD 250,50 a 40,25 son $ 10.082,63",
  base.toString() === "10082.63",
  base.toString(),
);

console.log("\n-- formato --");
const formatted = formatMoney(new Decimal("1234567.891"), "UYU");
check("miles con punto y decimales con coma", formatted.includes("1.234.567,89"), formatted);
check("USD usa US$", formatMoney(new Decimal(250), "USD").startsWith("US$"), formatMoney(new Decimal(250), "USD"));
check(
  "negativo lleva el signo adelante",
  formatMoney(new Decimal(-500), "UYU").startsWith("-"),
  formatMoney(new Decimal(-500), "UYU"),
);
check(
  "signed muestra el + en positivos",
  formatMoney(new Decimal(500), "UYU", { signed: true }).startsWith("+"),
);
check(
  "hideDecimals corta los centavos",
  !formatMoney(new Decimal("1234.56"), "UYU", { hideDecimals: true }).includes(","),
  formatMoney(new Decimal("1234.56"), "UYU", { hideDecimals: true }),
);
check(
  "compacto usa k",
  formatCompact(new Decimal(12500), "UYU").includes("k"),
  formatCompact(new Decimal(12500), "UYU"),
);
check(
  "compacto usa M",
  formatCompact(new Decimal(2_400_000), "UYU").includes("M"),
  formatCompact(new Decimal(2_400_000), "UYU"),
);

console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLARON`);
process.exitCode = failures === 0 ? 0 : 1;
