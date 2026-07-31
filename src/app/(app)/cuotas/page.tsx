import Link from "next/link";
import { CreditCard, Plus } from "lucide-react";
import { requireAuth } from "@/lib/auth/guard";
import {
  listInstallmentPlans,
  upcomingInstallmentLoad,
} from "@/lib/installments.server";
import { formatMoney } from "@/lib/money";
import { formatDate, formatMonth } from "@/lib/dates";
import { Card, EmptyState, Page, PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { PlanCard } from "./plan-card";

export const metadata = { title: "Cuotas | Managoney" };

export default async function CuotasPage() {
  const session = await requireAuth();

  const [plans, load] = await Promise.all([
    listInstallmentPlans(session.workspaceId),
    upcomingInstallmentLoad(session.workspaceId),
  ]);

  const active = plans.filter((plan) => plan.paidCount < plan.count);
  const finished = plans.filter((plan) => plan.paidCount >= plan.count);

  // El pico manda: si un mes concentra el doble que el resto, es el que hay
  // que ver venir.
  const peak = load.reduce(
    (max, item) => (item.amount.gt(max) ? item.amount : max),
    load[0]?.amount ?? null,
  );

  const lastDue = active
    .map((plan) => plan.lastDueDate)
    .filter((date): date is Date => date !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <Page>
      <PageHeader
        title="Cuotas"
        description={
          active.length > 0
            ? `${active.length} ${active.length === 1 ? "compra activa" : "compras activas"}`
            : undefined
        }
        action={
          <Link href="/cuotas/nueva">
            <Button size="sm">
              <Plus className="size-4" />
              Nueva compra
            </Button>
          </Link>
        }
      />

      {load.length > 0 && peak ? (
        <Card className="mb-6">
          <p className="text-sm font-medium">Lo que ya tenés comprometido</p>
          <p className="mt-0.5 text-xs text-muted">
            Cuotas que vencen en los proximos meses. Es la plata que ya no
            podés contar.
          </p>

          <ul className="mt-4 space-y-2.5">
            {load.map((item) => (
              <li
                key={`${item.month.toISOString()}-${item.currency}`}
                className="flex items-center gap-3"
              >
                <span className="w-20 shrink-0 text-xs text-muted">
                  {formatMonth(item.month)}
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{
                      width: `${Math.max(item.amount.div(peak).mul(100).toNumber(), 3)}%`,
                    }}
                  />
                </span>
                <span className="shrink-0 text-sm font-medium tabular">
                  {formatMoney(item.amount, item.currency)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {plans.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="size-8" />}
          title="No tenés compras en cuotas"
          description="Cargá una y la app genera sola las cuotas con su vencimiento, para que sepas cuanto te queda comprometido cada mes."
          action={
            <Link href="/cuotas/nueva">
              <Button size="sm">Cargar compra</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {active.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}

          {finished.length > 0 ? (
            <details className="group">
              <summary className="cursor-pointer list-none py-2 text-sm text-muted hover:text-foreground">
                {finished.length}{" "}
                {finished.length === 1 ? "terminada" : "terminadas"}
              </summary>
              <div className="mt-2 space-y-3">
                {finished.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} />
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )}

      {lastDue ? (
        <p className="mt-6 text-xs text-muted">
          Una cuota cuenta como pagada cuando pasa su vencimiento. La ultima de
          estas compras vence el {formatDate(lastDue)}.
        </p>
      ) : null}
    </Page>
  );
}
