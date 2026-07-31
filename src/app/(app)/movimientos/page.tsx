import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  PiggyBank,
  Plus,
  Receipt,
  SearchX,
} from "lucide-react";
import { requireAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { Decimal, formatMoney } from "@/lib/money";
import { formatDate, toDateInputValue } from "@/lib/dates";
import {
  countActiveFilters,
  parseFilters,
  toQueryString,
} from "@/lib/transaction-filters";
import { listTransactions } from "@/lib/transaction-list";
import { EmptyState, Page, PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { LinkPending } from "@/components/ui/link-pending";
import { FilterBar } from "./filter-bar";
import { cn } from "@/lib/cn";

export const metadata = { title: "Movimientos | Managoney" };

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const filters = parseFilters(await searchParams);

  const [workspace, accounts, categories, result, plan] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: session.workspaceId },
      select: { baseCurrency: true },
    }),
    prisma.account.findMany({
      where: { workspaceId: session.workspaceId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, currency: true },
    }),
    prisma.category.findMany({
      where: { workspaceId: session.workspaceId, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, parent: { select: { name: true } } },
    }),
    listTransactions(session.workspaceId, filters),
    // El filtro por plan llega desde la pantalla de cuotas: conviene decir de
    // que compra son estas cuotas en vez de dejar la lista sin contexto.
    filters.planId
      ? prisma.installmentPlan.findFirst({
          where: { id: filters.planId, workspaceId: session.workspaceId },
          select: { description: true, count: true },
        })
      : null,
  ]);

  const activeCount = countActiveFilters(filters);
  const net = result.income.minus(result.expense);

  return (
    <Page>
      <PageHeader
        title="Movimientos"
        action={
          <Link href="/movimientos/nuevo">
            <Button size="sm">
              <Plus className="size-4" />
              Nuevo
            </Button>
          </Link>
        }
      />

      {plan ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/30 bg-accent-soft px-4 py-2.5 text-sm">
          <span>
            Las {plan.count} cuotas de{" "}
            <span className="font-medium">{plan.description}</span>
          </span>
          <Link
            href={`/movimientos${toQueryString({ ...filters, planId: null })}`}
            className="text-muted hover:text-foreground hover:underline"
          >
            Ver todo
          </Link>
        </div>
      ) : null}

      <FilterBar
        filters={filters}
        accounts={accounts.map((account) => ({
          id: account.id,
          label: `${account.name} (${account.currency})`,
        }))}
        categories={categories.map((category) => ({
          id: category.id,
          label: category.parent
            ? `${category.parent.name} › ${category.name}`
            : category.name,
        }))}
        currencies={[...new Set(accounts.map((account) => account.currency))]}
        today={toDateInputValue(new Date())}
      >
        {result.total > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
            <span className="text-muted">
              {result.total} {result.total === 1 ? "movimiento" : "movimientos"}
            </span>

            {result.expense.gt(0) ? (
              <span>
                <span className="text-muted">Gastos </span>
                <span className="font-medium tabular text-negative">
                  {formatMoney(result.expense, workspace.baseCurrency)}
                </span>
              </span>
            ) : null}

            {result.income.gt(0) ? (
              <span>
                <span className="text-muted">Ingresos </span>
                <span className="font-medium tabular text-positive">
                  {formatMoney(result.income, workspace.baseCurrency)}
                </span>
              </span>
            ) : null}

            {result.income.gt(0) && result.expense.gt(0) ? (
              <span>
                <span className="text-muted">Neto </span>
                <span
                  className={cn(
                    "font-medium tabular",
                    net.isNegative() ? "text-negative" : "text-positive",
                  )}
                >
                  {formatMoney(net, workspace.baseCurrency, { signed: true })}
                </span>
              </span>
            ) : null}
          </div>
        ) : null}

        {result.transactions.length === 0 ? (
          activeCount > 0 ? (
            <EmptyState
              icon={<SearchX className="size-8" />}
              title="Ningun movimiento coincide"
              description="Probá con menos filtros o un rango de fechas mas amplio."
              action={
                <Link href="/movimientos">
                  <Button size="sm" variant="secondary">
                    Limpiar filtros
                  </Button>
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={<Receipt className="size-8" />}
              title="Todavia no hay movimientos"
              description="Carga el primero y empeza a ver a donde se va tu plata."
              action={
                <Link href="/movimientos/nuevo">
                  <Button size="sm">Cargar movimiento</Button>
                </Link>
              }
            />
          )
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {result.transactions.map((tx) => {
              const isExpense = tx.type === "EXPENSE";
              const isTransfer = tx.type === "TRANSFER";
              const pending = tx.settlementDate > new Date();

              const Icon = isTransfer
                ? tx.isDissaving
                  ? PiggyBank
                  : ArrowLeftRight
                : isExpense
                  ? ArrowUpRight
                  : ArrowDownLeft;

              const title =
                tx.description ||
                tx.merchant ||
                (isTransfer
                  ? `${tx.account.name} → ${tx.toAccount?.name ?? ""}`
                  : (tx.category?.name ?? "Sin categorizar"));

              const details = [
                formatDate(tx.settlementDate),
                tx.account.name,
                !isTransfer && tx.category ? tx.category.name : null,
                tx.installmentNumber && tx.installmentPlan
                  ? `cuota ${tx.installmentNumber}/${tx.installmentPlan.count}`
                  : null,
                tx.isDissaving ? "desahorro" : null,
              ].filter(Boolean);

              return (
                <li
                  key={tx.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3",
                    pending && "bg-surface-2/40",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      isTransfer
                        ? "bg-surface-2 text-muted"
                        : isExpense
                          ? "bg-negative/10 text-negative"
                          : "bg-positive/10 text-positive",
                    )}
                  >
                    <Icon className="size-4.5" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{title}</span>
                    <span className="block truncate text-sm text-muted">
                      {details.join(" · ")}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span
                      className={cn(
                        "block font-semibold tabular",
                        isTransfer
                          ? "text-foreground"
                          : isExpense
                            ? "text-negative"
                            : "text-positive",
                      )}
                    >
                      {/* En la base los montos son positivos y el signo lo da el
                        tipo; en pantalla hay que devolverselo. */}
                      {isTransfer
                        ? formatMoney(tx.amount, tx.currency)
                        : formatMoney(
                            isExpense
                              ? new Decimal(tx.amount).neg()
                              : tx.amount,
                            tx.currency,
                            { signed: !isExpense },
                          )}
                    </span>
                    {pending ? (
                      <span className="block text-xs text-muted">
                        todavia no vencio
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {result.pageCount > 1 ? (
          <nav className="mt-4 flex items-center justify-between gap-3">
            {result.page > 1 ? (
              <Link
                href={`/movimientos${toQueryString({ ...filters, page: result.page - 1 })}`}
                className="relative"
              >
                <Button variant="secondary" size="sm">
                  Anteriores
                </Button>
                {/* Cambiar de pagina no cambia de ruta, asi que el
                    `loading.tsx` no se dispara y la lista se queda quieta
                    mientras vuelve la consulta. */}
                <LinkPending className="-bottom-1.5" />
              </Link>
            ) : (
              <span />
            )}

            <span className="text-sm text-muted">
              Pagina {result.page} de {result.pageCount}
            </span>

            {result.page < result.pageCount ? (
              <Link
                href={`/movimientos${toQueryString({ ...filters, page: result.page + 1 })}`}
                className="relative"
              >
                <Button variant="secondary" size="sm">
                  Siguientes
                </Button>
                <LinkPending className="-bottom-1.5" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </FilterBar>
    </Page>
  );
}
