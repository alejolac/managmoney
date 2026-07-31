import { Decimal } from "@/lib/money";
import type { Frequency } from "@/generated/prisma/enums";

/**
 * Compromisos: todo lo que se repite mes a mes.
 *
 * Suscripciones, alquiler, seguros, el sueldo. La gracia de tenerlos juntos no
 * es cargarlos mas rapido sino ver el numero que importa: cuanto de lo que
 * entra cada mes ya esta comprometido antes de que decidas nada.
 *
 * Este modulo no toca la base para que el formulario pueda mostrar las
 * proximas fechas mientras escribis.
 */

/** Cada cuantos meses cae, o null si la frecuencia se cuenta en semanas. */
const MONTHS_PER: Partial<Record<Frequency, number>> = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  YEARLY: 12,
};

const DAYS_PER: Partial<Record<Frequency, number>> = {
  WEEKLY: 7,
  BIWEEKLY: 14,
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  WEEKLY: "Por semana",
  BIWEEKLY: "Cada dos semanas",
  MONTHLY: "Por mes",
  BIMONTHLY: "Cada dos meses",
  QUARTERLY: "Por trimestre",
  SEMIANNUAL: "Cada seis meses",
  YEARLY: "Por año",
};

/**
 * Cuantas veces al mes cae, en promedio.
 *
 * Sirve para poder sumar peras con manzanas: una suscripcion anual de $12.000 y
 * una mensual de $500 no se pueden comparar hasta que las dos estan expresadas
 * en lo mismo. Las semanas se pasan a meses con 365,25/12 dias, que absorbe los
 * meses de 28 y de 31 y los anios bisiestos.
 */
export function occurrencesPerMonth(
  frequency: Frequency,
  interval = 1,
): Decimal {
  const step = Math.max(interval, 1);

  const months = MONTHS_PER[frequency];
  if (months) return new Decimal(1).div(months * step);

  const days = DAYS_PER[frequency];
  if (days) return new Decimal("365.25").div(12).div(days * step);

  return new Decimal(1);
}

/**
 * El costo llevado a un numero por mes, para poder sumar todo junto.
 *
 * Divide el monto directamente en vez de multiplicarlo por
 * `occurrencesPerMonth`: 1/3 en decimal es 0,333...3 con veinte digitos, y
 * multiplicar eso por 3.000 da 999,99...9, no 1.000. Dividiendo al final,
 * 3.000 / 3 da 1.000 exacto.
 */
export function monthlyCost(
  amount: Decimal,
  frequency: Frequency,
  interval = 1,
): Decimal {
  const step = Math.max(interval, 1);

  const months = MONTHS_PER[frequency];
  if (months) return amount.div(months * step);

  const days = DAYS_PER[frequency];
  if (days) {
    return amount.mul(new Decimal("365.25").div(12)).div(days * step);
  }

  return amount;
}

/** Ajusta el dia al ultimo del mes cuando no existe (31 en febrero). */
function clampDay(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

/**
 * La fecha siguiente despues de `from`.
 *
 * En las frecuencias mensuales se respeta `dayOfMonth`: un alquiler que vence
 * el 31 tiene que caer el 28 en febrero y volver al 31 en marzo, no quedarse
 * pegado al 28 para siempre. Por eso el dia se recalcula desde el original en
 * vez de ir sumando sobre el anterior.
 */
export function nextOccurrence(params: {
  frequency: Frequency;
  interval?: number;
  from: Date;
  dayOfMonth?: number | null;
  weekday?: number | null;
}): Date {
  const step = Math.max(params.interval ?? 1, 1);
  const months = MONTHS_PER[params.frequency];

  if (months) {
    const jump = months * step;
    const day = params.dayOfMonth ?? params.from.getUTCDate();
    return clampDay(
      params.from.getUTCFullYear(),
      params.from.getUTCMonth() + jump,
      day,
    );
  }

  const days = (DAYS_PER[params.frequency] ?? 30) * step;
  return new Date(params.from.getTime() + days * 86_400_000);
}

/**
 * Todas las fechas pendientes hasta hoy, incluida la de hoy.
 *
 * Devuelve una lista y no solo la proxima porque un compromiso puede quedar sin
 * registrar varios periodos: si abris la app despues de tres meses, hay tres
 * cuotas para confirmar, no una.
 */
export function pendingOccurrences(params: {
  frequency: Frequency;
  interval?: number;
  nextRunDate: Date;
  endDate?: Date | null;
  until: Date;
  dayOfMonth?: number | null;
  /** Corte de seguridad para no generar miles de fechas por un dato malo. */
  max?: number;
}): Date[] {
  const dates: Date[] = [];
  let cursor = params.nextRunDate;
  const limit = params.max ?? 60;

  while (cursor <= params.until && dates.length < limit) {
    if (params.endDate && cursor > params.endDate) break;
    dates.push(cursor);
    cursor = nextOccurrence({
      frequency: params.frequency,
      interval: params.interval,
      from: cursor,
      dayOfMonth: params.dayOfMonth,
    });
  }

  return dates;
}

/** Las proximas `count` fechas, para la vista previa del formulario. */
export function upcomingOccurrences(params: {
  frequency: Frequency;
  interval?: number;
  startDate: Date;
  dayOfMonth?: number | null;
  count?: number;
}): Date[] {
  const dates: Date[] = [params.startDate];

  for (let i = 1; i < (params.count ?? 4); i++) {
    dates.push(
      nextOccurrence({
        frequency: params.frequency,
        interval: params.interval,
        from: dates[i - 1],
        dayOfMonth: params.dayOfMonth,
      }),
    );
  }

  return dates;
}

/** Cuantos dias faltan para una fecha (negativo si ya paso). */
export function daysUntil(date: Date, today = new Date()): number {
  const a = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const b = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Math.round((a - b) / 86_400_000);
}
