import { formatMonth } from "@/lib/dates";

/**
 * Los tres cortes de tiempo del dashboard.
 *
 * El rango va sobre la fecha de impacto, igual que los saldos y la lista: la
 * cuota de agosto de algo comprado en marzo pesa en agosto, que es cuando te
 * sale la plata.
 */
export const PERIODS = ["mes", "semestre", "ano"] as const;
export type PeriodKind = (typeof PERIODS)[number];

export type Period = {
  kind: PeriodKind;
  /** Inclusive. */
  from: Date;
  /** Exclusivo: el primer instante que ya no entra. */
  to: Date;
  label: string;
  /** `ref` del periodo anterior y del siguiente, para las flechas. */
  previousRef: string;
  nextRef: string;
  ref: string;
  /** Si el periodo siguiente ya cae entero en el futuro no tiene sentido ir. */
  hasNext: boolean;
};

const MONTH_RE = /^(\d{4})-(\d{2})$/;

function monthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

function toRef(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function parsePeriodKind(value: string | null | undefined): PeriodKind {
  return PERIODS.includes(value as PeriodKind) ? (value as PeriodKind) : "mes";
}

/**
 * Traduce `periodo` + `ref` a un rango concreto.
 *
 * `ref` es siempre un mes ("2026-07") aunque el periodo sea anual: alcanza para
 * ubicarse y evita tener dos formatos distintos dando vueltas.
 */
export function resolvePeriod(
  kind: PeriodKind,
  ref: string | null | undefined,
  today = new Date(),
): Period {
  const match = ref?.match(MONTH_RE);
  const year = match ? Number(match[1]) : today.getUTCFullYear();
  const month = match ? Number(match[2]) - 1 : today.getUTCMonth();

  const anchor = monthStart(year, month);

  if (kind === "ano") {
    const from = monthStart(year, 0);
    const to = monthStart(year + 1, 0);
    return {
      kind,
      from,
      to,
      label: String(year),
      ref: toRef(anchor),
      previousRef: `${year - 1}-01`,
      nextRef: `${year + 1}-01`,
      hasNext: to <= today,
    };
  }

  if (kind === "semestre") {
    // Seis meses que terminan en el mes de referencia, ese incluido.
    const from = monthStart(year, month - 5);
    const to = monthStart(year, month + 1);
    return {
      kind,
      from,
      to,
      label: `${formatMonth(from)} a ${formatMonth(monthStart(year, month))}`,
      ref: toRef(anchor),
      previousRef: toRef(monthStart(year, month - 6)),
      nextRef: toRef(monthStart(year, month + 6)),
      hasNext: to <= today,
    };
  }

  const from = anchor;
  const to = monthStart(year, month + 1);
  return {
    kind,
    from,
    to,
    label: formatMonth(from),
    ref: toRef(anchor),
    previousRef: toRef(monthStart(year, month - 1)),
    nextRef: toRef(monthStart(year, month + 1)),
    hasNext: to <= today,
  };
}

/** El rango como lo esperan los filtros de la lista de movimientos. */
export function periodToFilterDates(period: Period): {
  from: string;
  to: string;
} {
  // `to` es exclusivo aca pero inclusivo alla, asi que se resta un dia.
  const lastDay = new Date(period.to.getTime() - 86_400_000);
  return {
    from: period.from.toISOString().slice(0, 10),
    to: lastDay.toISOString().slice(0, 10),
  };
}
