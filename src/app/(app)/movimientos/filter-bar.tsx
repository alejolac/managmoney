"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import {
  countActiveFilters,
  datePresets,
  toQueryString,
  UNCATEGORIZED,
  type TransactionFilters,
} from "@/lib/transaction-filters";
import { Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type Option = { id: string; label: string };

/**
 * Los filtros y, abajo, los resultados que le llegan como `children`.
 *
 * Van juntos en el mismo componente por una razon concreta: aplicar un filtro
 * es una navegacion al servidor y tarda lo suyo, asi que mientras llega la
 * respuesta hay que apagar la lista vieja. Si no, la pantalla queda mostrando
 * los datos anteriores como si nada y parece que el filtro no hizo efecto. El
 * estado de "cargando" vive aca, y los resultados son un componente de
 * servidor que entra como hijo.
 */
export function FilterBar({
  filters,
  accounts,
  categories,
  currencies,
  today,
  children,
}: {
  filters: TransactionFilters;
  accounts: Option[];
  categories: Option[];
  currencies: string[];
  today: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const activeCount = countActiveFilters(filters);
  const [open, setOpen] = useState(activeCount > 0 && !filters.q);
  const [q, setQ] = useState(filters.q ?? "");

  /** Cualquier cambio vuelve a la pagina 1: si no, quedas en una pagina 7 vacia. */
  function apply(changes: Partial<TransactionFilters>) {
    const next = { ...filters, ...changes, page: 1 };
    startTransition(() => {
      // `scroll: false` para no saltar arriba: si estas mirando el final de la
      // lista y cambias la categoria, querés seguir donde estabas.
      router.push(`/movimientos${toQueryString(next)}`, { scroll: false });
    });
  }

  const presets = datePresets(new Date(`${today}T00:00:00Z`));
  const activePreset = presets.find(
    (preset) => preset.from === filters.from && preset.to === filters.to,
  );

  return (
    <>
      <div className="mb-4 space-y-3">
        <div className="flex gap-2">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              apply({ q: q.trim() || null });
            }}
            className="relative flex-1"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onBlur={() => {
                if ((q.trim() || null) !== filters.q)
                  apply({ q: q.trim() || null });
              }}
              placeholder="Buscar por descripcion o comercio"
              className="pl-9"
              aria-label="Buscar movimientos"
            />
            {q ? (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  apply({ q: null });
                }}
                aria-label="Limpiar busqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </form>

          <Button
            type="button"
            variant={open ? "primary" : "secondary"}
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            <SlidersHorizontal className="size-4" />
            {activeCount > 0 ? activeCount : "Filtros"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => apply({ from: preset.from, to: preset.to })}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                activePreset?.key === preset.key
                  ? "bg-accent text-accent-foreground font-medium"
                  : "bg-surface-2 text-muted hover:text-foreground",
              )}
            >
              {preset.label}
            </button>
          ))}

          {pending ? (
            <Loader2 className="ml-1 size-4 animate-spin text-muted" />
          ) : null}
        </div>

        {open ? (
          <div className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-muted">Tipo</span>
              <Select
                value={filters.type ?? ""}
                onChange={(event) =>
                  apply({
                    type: (event.target.value ||
                      null) as TransactionFilters["type"],
                  })
                }
              >
                <option value="">Todos</option>
                <option value="EXPENSE">Gastos</option>
                <option value="INCOME">Ingresos</option>
                <option value="TRANSFER">Transferencias</option>
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-muted">
                Cuenta
              </span>
              <Select
                value={filters.accountId ?? ""}
                onChange={(event) =>
                  apply({ accountId: event.target.value || null })
                }
              >
                <option value="">Todas</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-muted">
                Categoria
              </span>
              <Select
                value={filters.categoryId ?? ""}
                onChange={(event) =>
                  apply({ categoryId: event.target.value || null })
                }
              >
                <option value="">Todas</option>
                <option value={UNCATEGORIZED}>Sin categorizar</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-muted">
                Moneda
              </span>
              <Select
                value={filters.currency ?? ""}
                onChange={(event) =>
                  apply({
                    currency: (event.target.value ||
                      null) as TransactionFilters["currency"],
                  })
                }
              >
                <option value="">Todas</option>
                {currencies.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </Select>
            </label>

            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-muted">
                Desde
              </span>
              <Input
                type="date"
                value={filters.from ?? ""}
                onChange={(event) =>
                  apply({ from: event.target.value || null })
                }
                className="tabular"
              />
            </label>

            <label className="space-y-1.5">
              <span className="block text-xs font-medium text-muted">
                Hasta
              </span>
              <Input
                type="date"
                value={filters.to ?? ""}
                onChange={(event) => apply({ to: event.target.value || null })}
                className="tabular"
              />
            </label>

            {activeCount > 0 ? (
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={() => {
                    setQ("");
                    startTransition(() => router.push("/movimientos"));
                  }}
                  className="text-sm text-muted hover:text-foreground hover:underline"
                >
                  Limpiar los {activeCount} filtros
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Los resultados se apagan mientras viaja la consulta. Los filtros de
        arriba quedan vivos: podés seguir cambiando cosas sin esperar. */}
      <div
        aria-busy={pending}
        className={cn(
          "transition-opacity duration-150",
          pending && "pointer-events-none opacity-40",
        )}
      >
        {children}
      </div>
    </>
  );
}
