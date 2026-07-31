import Link from "next/link";
import { CreditCard, Plus, Wallet } from "lucide-react";
import { requireAuth } from "@/lib/auth/guard";
import { getAccountsWithBalances, totalsByCurrency } from "@/lib/accounts";
import { formatMoney } from "@/lib/money";
import { Card, EmptyState, Page, PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import type { Currency } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";

export const metadata = { title: "Cuentas | Managoney" };

const TYPE_LABELS: Record<string, string> = {
  CHECKING: "Cuenta bancaria",
  SAVINGS: "Caja de ahorro",
  CASH: "Efectivo",
  CREDIT_CARD: "Tarjeta de credito",
  DIGITAL_WALLET: "Billetera digital",
  INVESTMENT: "Inversion",
};

export default async function CuentasPage() {
  const session = await requireAuth();
  const accounts = await getAccountsWithBalances(session.workspaceId);
  const totals = totalsByCurrency(accounts);

  return (
    <Page>
      <PageHeader
        title="Cuentas"
        description="Donde esta tu plata hoy."
        action={
          <Link href="/cuentas/nueva">
            <Button size="sm">
              <Plus className="size-4" />
              Nueva cuenta
            </Button>
          </Link>
        }
      />

      {totals.size > 0 ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {[...totals.entries()].map(([currency, total]) => (
            <Card key={currency} className="py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Total en {currency}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular">
                {formatMoney(total, currency as Currency)}
              </p>
            </Card>
          ))}
        </div>
      ) : null}

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Wallet className="size-8" />}
          title="Todavia no hay cuentas"
          description="Crea una para empezar a cargar movimientos."
          action={
            <Link href="/cuentas/nueva">
              <Button size="sm">Nueva cuenta</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2">
          {accounts.map((account) => {
            const isCard = account.type === "CREDIT_CARD";
            const negative = account.balance.isNegative();

            return (
              <li key={account.id}>
                <Link
                  href={`/cuentas/${account.id}`}
                  className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-2"
                >
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: account.color }}
                  >
                    {isCard ? (
                      <CreditCard className="size-5" />
                    ) : (
                      <Wallet className="size-5" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {account.name}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      {TYPE_LABELS[account.type] ?? account.type}
                      {account.institution ? ` · ${account.institution}` : ""}
                      {account.isSavings ? " · ahorro" : ""}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span
                      className={cn(
                        "block font-semibold tabular",
                        isCard || negative ? "text-negative" : "text-foreground",
                      )}
                    >
                      {formatMoney(account.balance, account.currency)}
                    </span>
                    {!account.upcoming.isZero() ? (
                      <span className="block text-xs text-muted tabular">
                        {formatMoney(account.upcoming, account.currency, {
                          signed: true,
                        })}{" "}
                        por vencer
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
