import Link from "next/link";
import { ArrowLeftRight, PiggyBank, Plus, Wallet } from "lucide-react";
import { SECONDARY_NAV_ITEMS } from "@/lib/nav";
import { requireAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { getAccountsWithBalances, totalsByCurrency } from "@/lib/accounts";
import { getDashboard } from "@/lib/dashboard";
import {
  parsePeriodKind,
  periodToFilterDates,
  resolvePeriod,
} from "@/lib/periods";
import {
  EMPTY_FILTERS,
  UNCATEGORIZED,
  toQueryString,
} from "@/lib/transaction-filters";
import { formatMoney } from "@/lib/money";
import { Card, EmptyState, Page, PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Donut } from "@/components/charts/donut";
import { CategoryBars } from "@/components/charts/category-bars";
import { MonthBars } from "@/components/charts/month-bars";
import { PeriodNav } from "./period-nav";
import { cn } from "@/lib/cn";
import type { Currency } from "@/generated/prisma/enums";

/** Cuantas categorias entran en la dona antes de agruparse en "Otras". */
const TOP_CATEGORIES = 6;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const params = await searchParams;

  const period = resolvePeriod(
    parsePeriodKind(typeof params.periodo === "string" ? params.periodo : null),
    typeof params.ref === "string" ? params.ref : null,
  );

  const [workspace, accounts, dashboard] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: session.workspaceId },
      select: { baseCurrency: true },
    }),
    getAccountsWithBalances(session.workspaceId),
    getDashboard(session.workspaceId, period),
  ]);

  const base = workspace.baseCurrency as Currency;
  const totals = totalsByCurrency(accounts);
  const savings = accounts.filter((account) => account.isSavings);
  const { summary, categories, months } = dashboard;

  const range = periodToFilterDates(period);

  function movementsHref(extra: Parameters<typeof toQueryString>[0] = {}) {
    return `/movimientos${toQueryString({ ...EMPTY_FILTERS, ...range, ...extra })}`;
  }

  // Las chicas se juntan en "Otras": doce porciones de 2% no dicen nada.
  const top = categories.slice(0, TOP_CATEGORIES);
  const rest = categories.slice(TOP_CATEGORIES);
  const restShare = rest.reduce((sum, slice) => sum + slice.share, 0);

  const donutSlices = [
    ...top.map((slice) => ({
      key: slice.categoryId ?? "sin",
      name: slice.name,
      color: slice.color,
      share: slice.share,
    })),
    ...(rest.length > 0
      ? [
          {
            key: "otras",
            name: `Otras ${rest.length}`,
            color: "#94a3b8",
            share: restShare,
          },
        ]
      : []),
  ];

  const hasData = summary.income.gt(0) || summary.expense.gt(0);

  return (
    <Page>
      <PageHeader
        title={`Hola, ${session.user.name}`}
        action={
          <Link href="/movimientos/nuevo">
            <Button size="sm">
              <Plus className="size-4" />
              Cargar gasto
            </Button>
          </Link>
        }
      />

      <PeriodNav period={period} />

      {hasData ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Ingresos
            </p>
            <p className="mt-1 text-2xl font-semibold tabular text-positive">
              {formatMoney(summary.income, base, { hideDecimals: true })}
            </p>
          </Card>

          <Link
            href={movementsHref({ type: "EXPENSE" })}
            className="rounded-2xl border border-border bg-surface p-5 transition-colors hover:bg-surface-2"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              Gastos
            </p>
            <p className="mt-1 text-2xl font-semibold tabular text-negative">
              {formatMoney(summary.expense, base, { hideDecimals: true })}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {summary.expenseCount}{" "}
              {summary.expenseCount === 1 ? "movimiento" : "movimientos"}
            </p>
          </Link>

          <Card>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {summary.net.isNegative() ? "Te faltaron" : "Te quedaron"}
            </p>
            <p
              className={cn(
                "mt-1 text-2xl font-semibold tabular",
                summary.net.isNegative() ? "text-negative" : "text-foreground",
              )}
            >
              {formatMoney(summary.net.abs(), base, { hideDecimals: true })}
            </p>
          </Card>
        </div>
      ) : null}

      {/* La senal que importa en este flujo: si tuviste que sacar del ahorro,
          el mes no cerro, por mas que el resto de los numeros den bien. */}
      {summary.dissaving.gt(0) ? (
        <Card className="mt-3 border-negative/30 bg-negative/5">
          <div className="flex items-start gap-3">
            <PiggyBank className="mt-0.5 size-5 shrink-0 text-negative" />
            <div>
              <p className="font-medium">
                Sacaste{" "}
                {formatMoney(summary.dissaving, base, { hideDecimals: true })}{" "}
                del ahorro
              </p>
              <p className="mt-0.5 text-sm text-muted">
                No es un gasto, pero es la senal de que lo que entro no alcanzo
                para cubrir el periodo.
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {categories.length > 0 ? (
        <Card className="mt-6">
          <h2 className="mb-4 text-sm font-medium text-muted">
            En que se fue la plata
          </h2>

          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <Donut slices={donutSlices}>
              <span className="text-xs text-muted">Gastaste</span>
              <span className="px-4 text-lg font-semibold tabular leading-tight">
                {formatMoney(summary.expense, base, { hideDecimals: true })}
              </span>
            </Donut>

            <div className="w-full min-w-0 flex-1">
              <CategoryBars
                slices={categories}
                currency={base}
                hrefFor={(slice) =>
                  movementsHref({
                    type: "EXPENSE",
                    // Sin categoria no es "cualquier categoria": va el
                    // centinela para que la lista filtre de verdad.
                    categoryId: slice.categoryId ?? UNCATEGORIZED,
                  })
                }
              />
            </div>
          </div>

          <p className="mt-4 text-xs text-muted">
            Tocá una categoria para ver esos gastos uno por uno.
          </p>
        </Card>
      ) : null}

      {months.length > 1 ? (
        <Card className="mt-6">
          <h2 className="mb-4 text-sm font-medium text-muted">Mes a mes</h2>
          <MonthBars
            points={months}
            currency={base}
            highlight={period.kind === "mes" ? period.from : undefined}
            hrefFor={(point) => {
              const last = new Date(
                Date.UTC(
                  point.month.getUTCFullYear(),
                  point.month.getUTCMonth() + 1,
                  0,
                ),
              );
              return `/movimientos${toQueryString({
                ...EMPTY_FILTERS,
                from: point.month.toISOString().slice(0, 10),
                to: last.toISOString().slice(0, 10),
              })}`;
            }}
          />
        </Card>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-medium text-muted">Donde esta hoy</h2>

        {totals.size === 0 ? (
          <EmptyState
            icon={<Wallet className="size-8" />}
            title="Empeza por tus cuentas"
            description="Carga el saldo que tenes hoy en cada una y a partir de ahi la app lleva la cuenta sola."
            action={
              <Link href="/cuentas">
                <Button size="sm">Ir a cuentas</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {[...totals.entries()].map(([currency, total]) => (
              <Card key={currency}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Disponible en {currency}
                </p>
                <p className="mt-1 text-3xl font-semibold tabular">
                  {formatMoney(total, currency as Currency)}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>

      {savings.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted">
            <PiggyBank className="size-4" />
            Ahorro
          </h2>
          <div className="space-y-2">
            {savings.map((account) => (
              <Card key={account.id} className="flex items-center gap-3 py-3">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: account.color }}
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {account.name}
                </span>
                <span className="shrink-0 font-semibold tabular">
                  {formatMoney(account.balance, account.currency)}
                </span>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Las secciones que no entran en la barra de abajo del celular. */}
      <nav className="mt-6 grid gap-3 sm:grid-cols-2">
        {SECONDARY_NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-2"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <item.icon className="size-4.5" />
            </span>
            <span className="text-sm font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      {!hasData && totals.size > 0 ? (
        <EmptyState
          icon={<ArrowLeftRight className="size-8" />}
          title={`Sin movimientos en ${period.label}`}
          description="Carga un gasto o un ingreso y el resumen se arma solo."
          action={
            <Link href="/movimientos/nuevo">
              <Button size="sm">Cargar movimiento</Button>
            </Link>
          }
        />
      ) : null}
    </Page>
  );
}
