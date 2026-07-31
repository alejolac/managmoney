import { Decimal, roundMoney } from "@/lib/money";
import { addMonths, resolveSettlementDate, type SettlementTiming } from "@/lib/dates";
import type { Currency } from "@/generated/prisma/enums";

/**
 * Compras en cuotas: la parte que es solo cuentas.
 *
 * Una compra en 12 cuotas no es un gasto, son doce: cada una vence un mes
 * distinto y hay que verla llegar. Este modulo no toca la base a proposito,
 * asi el formulario puede mostrar los vencimientos y el monto de cada cuota
 * mientras escribis, antes de guardar nada.
 */

/**
 * Reparte el total en `count` cuotas sin perder ni un centavo.
 *
 * Dividir y redondear cada cuota por separado no cierra: $100 en 3 dan 33,33
 * y tres veces eso son 99,99. La diferencia va toda a la primera cuota, que es
 * lo que hacen las tarjetas de aca.
 */
export function splitInstallments(
  total: Decimal,
  count: number,
  currency: Currency,
): Decimal[] {
  if (count < 1) throw new Error("Un plan tiene al menos una cuota.");

  const each = roundMoney(total.div(count), currency);
  const rounded = roundMoney(total, currency);
  const remainder = rounded.minus(each.mul(count));

  return Array.from({ length: count }, (_, index) =>
    index === 0 ? each.plus(remainder) : each,
  );
}

/**
 * Cuando vence cada cuota.
 *
 * La primera sale de la fecha de la compra pasada por el cierre de la tarjeta;
 * las demas son un mes despues cada una. Si la cuenta no es una tarjeta, la
 * primera vence el dia de la compra.
 */
export function installmentDueDates(
  account: SettlementTiming,
  purchaseDate: Date,
  count: number,
): Date[] {
  const first = resolveSettlementDate(account, purchaseDate);
  return Array.from({ length: count }, (_, index) => addMonths(first, index));
}
