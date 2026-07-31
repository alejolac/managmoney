import "server-only";
import { Decimal } from "@/lib/money";
import { saveReferenceRate } from "@/lib/exchange-rate";
import type { Currency } from "@/generated/prisma/enums";

/**
 * Cotizaciones del Banco Central del Uruguay.
 *
 * Es la cotizacion de REFERENCIA, no la que vas a pagar. El BCU publicaba
 * 40,214 por dolar el 28/7/2026; el mismo dia Itau te lo vendia bastante mas
 * caro. Por eso esta cotizacion solo sirve para mirar un reporte en una sola
 * moneda: cuando cambiás plata de verdad, el tipo de cambio sale de los dos
 * montos reales de la transferencia, con el spread del banco ya adentro.
 *
 * El servicio es SOAP y no tiene clave. Se parsea con expresiones regulares en
 * vez de traer un parser de XML: la respuesta son cuatro campos por fila, con
 * un formato que no cambia desde hace anios, y no vale la pena la dependencia.
 */

const ENDPOINT =
  "https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones";

/** Codigos del BCU. Se usan los de "billete", que es lo que toca una persona. */
const BCU_CODES: Partial<Record<Currency, number>> = {
  USD: 2225,
  EUR: 1111,
  BRL: 1001,
  ARS: 501,
};

export const BCU_CURRENCIES = Object.keys(BCU_CODES) as Currency[];

const CODE_TO_CURRENCY = new Map(
  Object.entries(BCU_CODES).map(([currency, code]) => [
    code,
    currency as Currency,
  ]),
);

export type BcuQuote = {
  currency: Currency;
  date: Date;
  /** Cuantos pesos vale una unidad de `currency`. */
  rate: Decimal;
};

function field(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return match ? match[1].trim() : null;
}

function toDateOnlyUTC(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function buildEnvelope(codes: number[], from: string, to: string): string {
  const items = codes.map((code) => `<cot:item>${code}</cot:item>`).join("");

  return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cot="Cotiza">
<soapenv:Body><cot:wsbcucotizaciones.Execute><cot:Entrada>
<cot:Moneda>${items}</cot:Moneda>
<cot:FechaDesde>${from}</cot:FechaDesde>
<cot:FechaHasta>${to}</cot:FechaHasta>
<cot:Grupo>0</cot:Grupo>
</cot:Entrada></cot:wsbcucotizaciones.Execute></soapenv:Body></soapenv:Envelope>`;
}

/**
 * Pide al BCU las cotizaciones de un rango de dias.
 *
 * Se pide un rango y no un dia puntual a proposito: sabados, domingos y
 * feriados no tienen cotizacion, y hoy tampoco la tiene hasta que cierra la
 * jornada. Con una sola llamada que cubra varios dias siempre hay algo.
 */
export async function fetchBcuQuotes(params: {
  currencies?: Currency[];
  from: Date;
  to: Date;
  timeoutMs?: number;
}): Promise<BcuQuote[]> {
  const currencies = params.currencies ?? BCU_CURRENCIES;
  const codes = currencies
    .map((currency) => BCU_CODES[currency])
    .filter((code): code is number => code !== undefined);

  if (codes.length === 0) return [];

  const body = buildEnvelope(
    codes,
    params.from.toISOString().slice(0, 10),
    params.to.toISOString().slice(0, 10),
  );

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/xml;charset=UTF-8" },
    body,
    signal: AbortSignal.timeout(params.timeoutMs ?? 15_000),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`El BCU respondio ${response.status}`);
  }

  const xml = await response.text();

  const status = xml.match(/<status>(\d+)<\/status>/)?.[1];
  if (status && status !== "1") {
    const message = xml.match(/<mensaje>([^<]*)<\/mensaje>/)?.[1];
    throw new Error(`El BCU rechazo la consulta: ${message || `status ${status}`}`);
  }

  const blocks = xml.match(
    /<datoscotizaciones\.dato[^>]*>[\s\S]*?<\/datoscotizaciones\.dato>/g,
  );
  if (!blocks) return [];

  const quotes: BcuQuote[] = [];

  for (const block of blocks) {
    const code = Number(field(block, "Moneda"));
    const currency = CODE_TO_CURRENCY.get(code);
    const fecha = field(block, "Fecha");
    // TCV es la punta vendedora; el BCU publica comprador y vendedor iguales
    // en su cotizacion de referencia, pero si algun dia difieren, la de venta
    // es la que se parece mas a lo que te cuesta comprar dolares.
    const raw = field(block, "TCV") ?? field(block, "TCC");

    if (!currency || !fecha || !raw) continue;

    const rate = new Decimal(raw);
    // El BCU devuelve ceros para una moneda que no cotiza en ese grupo.
    if (!rate.isFinite() || rate.lte(0)) continue;

    quotes.push({ currency, date: toDateOnlyUTC(fecha), rate });
  }

  return quotes;
}

export type SyncResult = {
  saved: number;
  latest: { currency: Currency; date: Date; rate: Decimal }[];
};

/**
 * Trae los ultimos dias y los guarda como cotizacion de referencia.
 *
 * Guarda `moneda -> UYU` (cuantos pesos vale un dolar), que es como lo publica
 * el BCU y como lo piensa cualquiera aca. La direccion inversa la resuelve
 * sola `findReferenceRate`.
 */
export async function syncBcuRates(days = 10): Promise<SyncResult> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);

  const quotes = await fetchBcuQuotes({ from, to });

  for (const quote of quotes) {
    await saveReferenceRate({
      from: quote.currency,
      to: "UYU",
      date: quote.date,
      rate: quote.rate,
      source: "bcu",
    });
  }

  // La ultima de cada moneda, para poder mostrar que quedo guardado.
  const latest = new Map<Currency, BcuQuote>();
  for (const quote of quotes) {
    const current = latest.get(quote.currency);
    if (!current || quote.date > current.date) latest.set(quote.currency, quote);
  }

  return { saved: quotes.length, latest: [...latest.values()] };
}
