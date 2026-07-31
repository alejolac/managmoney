import DecimalJs from "decimal.js";
import type { Currency } from "@/generated/prisma/enums";

/**
 * Toda la plata de la app pasa por aca.
 *
 * Se usa Decimal y nunca number: en punto flotante 0.1 + 0.2 no da 0.3, y en
 * una app de finanzas eso se convierte en centavos que no cuadran y en un
 * saldo que no coincide con el banco.
 *
 * Se importa de decimal.js y no del cliente de Prisma a proposito: este modulo
 * lo usan tambien los formularios del navegador, y tomarlo de Prisma arrastra
 * todo el runtime del ORM al bundle del cliente. Es la misma clase; Prisma
 * usa decimal.js por dentro.
 */
export const Decimal = DecimalJs;
export type Decimal = DecimalJs;

export const ZERO = new Decimal(0);

type CurrencyInfo = {
  code: Currency;
  symbol: string;
  name: string;
  decimals: number;
};

export const CURRENCIES: Record<Currency, CurrencyInfo> = {
  UYU: { code: "UYU", symbol: "$", name: "Peso uruguayo", decimals: 2 },
  USD: { code: "USD", symbol: "US$", name: "Dolar", decimals: 2 },
  EUR: { code: "EUR", symbol: "€", name: "Euro", decimals: 2 },
  BRL: { code: "BRL", symbol: "R$", name: "Real", decimals: 2 },
  ARS: { code: "ARS", symbol: "AR$", name: "Peso argentino", decimals: 2 },
};

/**
 * Convierte lo que escribiste en un Decimal.
 *
 * Acepta las dos formas en las que se escribe un monto en Uruguay:
 * "1.234,56" (miles con punto) y "1234.56" (como lo tira una planilla).
 * Distinguirlas mal es la diferencia entre mil pesos y un peso con veinte.
 *
 * Devuelve null si no es un numero valido.
 */
export function parseAmount(input: string): Decimal | null {
  const cleaned = input.trim().replace(/\s/g, "").replace(/[^\d.,-]/g, "");
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  let normalized: string;

  if (lastComma !== -1 && lastDot !== -1) {
    // Estan los dos: el que va mas a la derecha es el separador decimal.
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (lastComma !== -1) {
    // Solo comas. Con exactamente 3 digitos despues asumimos miles ("1,500"),
    // salvo que haya mas de una coma, que ahi seguro son miles.
    const decimals = cleaned.length - lastComma - 1;
    const commaCount = (cleaned.match(/,/g) ?? []).length;
    normalized =
      decimals === 3 && commaCount >= 1
        ? cleaned.replace(/,/g, "")
        : cleaned.replace(",", ".");
  } else if (lastDot !== -1) {
    const decimals = cleaned.length - lastDot - 1;
    const dotCount = (cleaned.match(/\./g) ?? []).length;
    // "1.500" es mil quinientos; "1.50" es uno con cincuenta.
    normalized =
      decimals === 3 && dotCount >= 1 ? cleaned.replace(/\./g, "") : cleaned;
  } else {
    normalized = cleaned;
  }

  try {
    const value = new Decimal(normalized);
    return value.isFinite() ? value : null;
  } catch {
    return null;
  }
}

type FormatOptions = {
  /** Muestra el codigo de moneda cuando conviven varias en pantalla. */
  showCode?: boolean;
  /** Oculta los centavos. Util en graficos y totales grandes. */
  hideDecimals?: boolean;
  /** Antepone el signo tambien cuando es positivo. */
  signed?: boolean;
};

export function formatMoney(
  amount: Decimal | number | string,
  currency: Currency,
  options: FormatOptions = {},
): string {
  const value = new Decimal(amount);
  const info = CURRENCIES[currency];
  const decimals = options.hideDecimals ? 0 : info.decimals;

  const formatted = new Intl.NumberFormat("es-UY", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value.abs().toNumber());

  const sign = value.isNegative() ? "-" : options.signed ? "+" : "";
  const code = options.showCode ? ` ${info.code}` : "";

  return `${sign}${info.symbol} ${formatted}${code}`;
}

/** Version corta para ejes de graficos: "$ 12,5 k". */
export function formatCompact(
  amount: Decimal | number,
  currency: Currency,
): string {
  const value = new Decimal(amount);
  const abs = value.abs();
  const info = CURRENCIES[currency];

  const scale =
    abs.gte(1_000_000)
      ? { divisor: 1_000_000, suffix: " M" }
      : abs.gte(1_000)
        ? { divisor: 1_000, suffix: " k" }
        : { divisor: 1, suffix: "" };

  const scaled = value.div(scale.divisor);
  const formatted = new Intl.NumberFormat("es-UY", {
    maximumFractionDigits: scale.divisor === 1 ? 0 : 1,
  }).format(scaled.toNumber());

  return `${info.symbol} ${formatted}${scale.suffix}`;
}

/**
 * Redondea al numero de decimales de la moneda.
 *
 * ROUND_HALF_UP es lo que hace un banco y lo que espera cualquiera: 0,005
 * sube a 0,01. El default de decimal.js redondea al par mas cercano y da
 * resultados que parecen equivocados aunque no lo sean.
 */
export function roundMoney(amount: Decimal, currency: Currency): Decimal {
  return amount.toDecimalPlaces(
    CURRENCIES[currency].decimals,
    Decimal.ROUND_HALF_UP,
  );
}

/**
 * Convierte un monto a la moneda base con una cotizacion dada.
 * `rate` es cuantas unidades de la moneda base vale UNA de la moneda origen.
 */
export function toBaseAmount(
  amount: Decimal,
  rate: Decimal,
  baseCurrency: Currency,
): Decimal {
  return roundMoney(amount.mul(rate), baseCurrency);
}

/**
 * Deriva la cotizacion efectiva de un cambio real de moneda.
 *
 * Cuando pasas pesos a dolares en Itau no cargamos una cotizacion: cargas los
 * dos montos que se movieron de verdad y el tipo de cambio sale de ahi, con el
 * spread del banco ya incluido. Es el unico numero que refleja lo que paso.
 */
export function deriveRate(from: Decimal, to: Decimal): Decimal {
  if (to.isZero()) return ZERO;
  return from.div(to);
}

export function isSameCurrency(a: Currency, b: Currency): boolean {
  return a === b;
}
