import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatMoney } from "@/lib/money";
import type { CategorySlice } from "@/lib/dashboard";
import type { Currency } from "@/generated/prisma/enums";

/**
 * El ranking de gastos, que es el grafico con el que de verdad se interactua.
 *
 * Cada fila es un link a la lista de movimientos ya filtrada por esa categoria
 * y ese rango de fechas: es el "hago click y veo en que se fue la plata".
 */
export function CategoryBars({
  slices,
  currency,
  hrefFor,
}: {
  slices: CategorySlice[];
  currency: Currency;
  hrefFor: (slice: CategorySlice) => string;
}) {
  // Las barras se miden contra la categoria mas grande y no contra el total:
  // si la primera se lleva el 30%, con el total todas quedarian diminutas.
  const top = slices[0]?.share ?? 0;

  return (
    <ul className="space-y-1">
      {slices.map((slice) => (
        <li key={slice.categoryId ?? "sin"}>
          <Link
            href={hrefFor(slice)}
            className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="truncate text-sm font-medium">
                    {slice.name}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular">
                  {formatMoney(slice.amount, currency, { hideDecimals: true })}
                </span>
              </span>

              <span className="mt-1.5 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${top > 0 ? Math.max((slice.share / top) * 100, 2) : 0}%`,
                      backgroundColor: slice.color,
                    }}
                  />
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-muted tabular">
                  {slice.share}% · {slice.count}
                </span>
              </span>
            </span>

            <ChevronRight className="size-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
