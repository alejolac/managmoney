/**
 * Fechas de tarjeta de credito.
 *
 * Es la parte que casi ninguna app casera modela bien: la fecha en la que
 * comprás no es la fecha en la que te sale la plata. Una compra del 3 de marzo
 * puede impactar recién el 15 de abril, y si no lo separás, el saldo de marzo
 * te miente.
 */

/** Ajusta el dia al ultimo del mes cuando no existe (31 en febrero). */
function clampDay(year: number, month: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

/**
 * Cuando vence la compra hecha en `purchaseDate`.
 *
 * 1. Busca el primer cierre en o despues de la compra.
 * 2. Busca el primer vencimiento posterior a ese cierre.
 *
 * Ejemplo con cierre el 25 y vencimiento el 5:
 *   compra el 20 de marzo -> cierra el 25 de marzo -> vence el 5 de abril
 *   compra el 28 de marzo -> cierra el 25 de abril -> vence el 5 de mayo
 */
export function creditCardDueDate(
  purchaseDate: Date,
  closingDay: number,
  dueDay: number,
): Date {
  const year = purchaseDate.getUTCFullYear();
  const month = purchaseDate.getUTCMonth();
  const day = purchaseDate.getUTCDate();

  // Si compraste despues del cierre, entras en el resumen del mes siguiente.
  const closing =
    day <= closingDay
      ? clampDay(year, month, closingDay)
      : clampDay(year, month + 1, closingDay);

  // El vencimiento cae despues del cierre; si el dia es menor, es del mes que viene.
  return dueDay > closingDay
    ? clampDay(closing.getUTCFullYear(), closing.getUTCMonth(), dueDay)
    : clampDay(closing.getUTCFullYear(), closing.getUTCMonth() + 1, dueDay);
}

/** Lo unico que hace falta saber de una cuenta para fechar un movimiento. */
export type SettlementTiming = {
  type: string;
  statementClosingDay: number | null;
  paymentDueDay: number | null;
};

/**
 * Cuando impacta la caja.
 *
 * En una tarjeta de credito, la fecha de vencimiento del resumen. En cualquier
 * otra cuenta, el mismo dia de la operacion.
 *
 * Vive aca y no en el modulo de transacciones porque tambien la necesita el
 * formulario de cuotas para mostrar los vencimientos antes de guardar nada.
 */
export function resolveSettlementDate(
  account: SettlementTiming,
  date: Date,
): Date {
  if (
    account.type !== "CREDIT_CARD" ||
    account.statementClosingDay === null ||
    account.paymentDueDay === null
  ) {
    return date;
  }

  return creditCardDueDate(
    date,
    account.statementClosingDay,
    account.paymentDueDay,
  );
}

/** Suma meses conservando el dia, ajustando cuando el mes destino es mas corto. */
export function addMonths(date: Date, months: number): Date {
  return clampDay(
    date.getUTCFullYear(),
    date.getUTCMonth() + months,
    date.getUTCDate(),
  );
}

/** Fecha sin hora, en UTC, para que un movimiento no cambie de dia por zona horaria. */
export function toDateOnly(value: Date | string): Date {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : value;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** "2026-07-28", el formato que espera un <input type="date">. */
export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** "jul 2026", para agrupar por mes. */
export function formatMonth(date: Date): string {
  return new Intl.DateTimeFormat("es-UY", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}
