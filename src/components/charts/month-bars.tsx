import Link from "next/link";
import { Decimal, formatCompact, formatMoney } from "@/lib/money";
import { formatMonth } from "@/lib/dates";
import type { MonthPoint } from "@/lib/dashboard";
import type { Currency } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";

/**
 * Evolucion mes a mes: gasto contra ingreso.
 *
 * Barras de CSS y no de SVG porque cada una tiene que ser un link a ese mes, y
 * un div con un `<Link>` alrededor navega del lado del cliente. Un `<a>` dentro
 * de un `<svg>` haria una recarga completa.
 */
export function MonthBars({
  points,
  currency,
  hrefFor,
  highlight,
}: {
  points: MonthPoint[];
  currency: Currency;
  hrefFor: (point: MonthPoint) => string;
  /** El mes que esta mirando el dashboard, para marcarlo. */
  highlight?: Date;
}) {
  const peak = points.reduce((max, point) => {
    const biggest = Decimal.max(point.expense, point.income);
    return biggest.gt(max) ? biggest : max;
  }, new Decimal(0));

  if (peak.lte(0)) return null;

  function height(value: Decimal): string {
    // Un minimo visible: una barra de 0,3% no se ve y parece que falta el dato.
    return `${Math.max(value.div(peak).mul(100).toNumber(), value.gt(0) ? 2 : 0)}%`;
  }

  return (
    <div>
      <div className="flex h-40 items-end gap-1.5">
        {points.map((point) => {
          const active =
            highlight && point.month.getTime() === highlight.getTime();

          return (
            <Link
              key={point.month.toISOString()}
              href={hrefFor(point)}
              title={`${formatMonth(point.month)}: gastos ${formatMoney(point.expense, currency)}, ingresos ${formatMoney(point.income, currency)}`}
              className={cn(
                "group flex h-full flex-1 flex-col justify-end gap-1 rounded-lg px-0.5 pb-1 transition-colors",
                active ? "bg-surface-2" : "hover:bg-surface-2/60",
              )}
            >
              <span className="flex h-full items-end justify-center gap-0.5">
                <span
                  className="w-2.5 rounded-t bg-negative/80 transition-opacity group-hover:opacity-100 sm:w-3"
                  style={{ height: height(point.expense) }}
                />
                <span
                  className="w-2.5 rounded-t bg-positive/60 transition-opacity group-hover:opacity-100 sm:w-3"
                  style={{ height: height(point.income) }}
                />
              </span>
              <span
                className={cn(
                  "block truncate text-center text-[10px]",
                  active ? "font-medium text-foreground" : "text-muted",
                )}
              >
                {formatMonth(point.month).replace(/ de /, " ").slice(0, 3)}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-negative/80" />
            Gastos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-positive/60" />
            Ingresos
          </span>
        </span>
        <span className="tabular">pico {formatCompact(peak, currency)}</span>
      </div>
    </div>
  );
}
