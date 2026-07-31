import "server-only";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@/lib/money";
import type { Currency } from "@/generated/prisma/enums";

/**
 * Cotizaciones de REFERENCIA.
 *
 * Ojo con la distincion, que es la que mas confunde:
 *
 *   - Cuando cambias plata de verdad en Itau, la cotizacion NO sale de aca.
 *     Cargas los dos montos reales de la transferencia y sale sola, con el
 *     spread del banco incluido.
 *
 *   - Esta tabla existe para otra cosa: mostrar en dolares un gasto que
 *     hiciste en pesos, o al reves. Ahi no se mueve plata, solo cambia como
 *     mirás el numero, y una referencia oficial alcanza.
 */

/** Cuantos dias para atras se acepta una cotizacion vieja (fines de semana, feriados). */
const MAX_STALENESS_DAYS = 7;

function startOfDayUTC(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/**
 * Busca la cotizacion aplicable a una fecha.
 *
 * Devuelve null si no hay ninguna razonablemente cercana: preferimos pedirtela
 * antes que inventar un numero y ensuciar el historial.
 */
export async function findReferenceRate(
  from: Currency,
  to: Currency,
  date: Date,
): Promise<Decimal | null> {
  if (from === to) return new Decimal(1);

  const day = startOfDayUTC(date);
  const floor = new Date(day);
  floor.setUTCDate(floor.getUTCDate() - MAX_STALENESS_DAYS);

  // La cotizacion del dia, o la mas reciente anterior.
  const direct = await prisma.exchangeRate.findFirst({
    where: { from, to, date: { lte: day, gte: floor } },
    orderBy: { date: "desc" },
  });

  if (direct) return new Decimal(direct.rate);

  // Si guardamos UYU->USD tambien sabemos USD->UYU: es su inversa.
  const inverse = await prisma.exchangeRate.findFirst({
    where: { from: to, to: from, date: { lte: day, gte: floor } },
    orderBy: { date: "desc" },
  });

  if (inverse) {
    const rate = new Decimal(inverse.rate);
    if (!rate.isZero()) return new Decimal(1).div(rate);
  }

  return null;
}

export async function saveReferenceRate(params: {
  from: Currency;
  to: Currency;
  date: Date;
  rate: Decimal;
  source?: string;
}) {
  const date = startOfDayUTC(params.date);

  return prisma.exchangeRate.upsert({
    where: {
      date_from_to: { date, from: params.from, to: params.to },
    },
    create: {
      date,
      from: params.from,
      to: params.to,
      rate: params.rate.toString(),
      source: params.source ?? "manual",
    },
    update: {
      rate: params.rate.toString(),
      source: params.source ?? "manual",
    },
  });
}

export async function latestRate(
  from: Currency,
  to: Currency,
): Promise<{ rate: Decimal; date: Date } | null> {
  const row = await prisma.exchangeRate.findFirst({
    where: { from, to },
    orderBy: { date: "desc" },
  });

  return row ? { rate: new Decimal(row.rate), date: row.date } : null;
}
