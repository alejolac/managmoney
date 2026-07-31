import Link from "next/link";
import { CalendarClock, Plus, Repeat } from "lucide-react";
import { requireAuth } from "@/lib/auth/guard";
import { listCommitments, totalPerMonth } from "@/lib/recurrences.server";
import { formatMoney } from "@/lib/money";
import { Card, EmptyState, Page, PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { CommitmentRow } from "./commitment-row";

export const metadata = { title: "Compromisos | Managoney" };

const GROUPS = [
  {
    kind: "SUBSCRIPTION" as const,
    title: "Suscripciones",
    hint: "Lo que se cobra solo todos los meses y nadie mira.",
  },
  {
    kind: "FIXED_EXPENSE" as const,
    title: "Gastos fijos",
    hint: "Alquiler, seguros, servicios.",
  },
  { kind: "INCOME" as const, title: "Ingresos", hint: "Sueldo y demas." },
];

export default async function CompromisosPage() {
  const session = await requireAuth();

  const commitments = await listCommitments(session.workspaceId);
  const totals = totalPerMonth(commitments);

  const pending = commitments.filter(
    (item) => !item.paused && item.daysLeft <= 0,
  );

  return (
    <Page>
      <PageHeader
        title="Compromisos"
        description="Todo lo que se repite, en un solo lugar."
        action={
          <Link href="/compromisos/nuevo">
            <Button size="sm">
              <Plus className="size-4" />
              Nuevo
            </Button>
          </Link>
        }
      />

      {commitments.length === 0 ? (
        <EmptyState
          icon={<Repeat className="size-8" />}
          title="Todavia no cargaste nada que se repita"
          description="Netflix, el gimnasio, el alquiler, el sueldo. Cargalos una vez y sabés cuanto de tu mes ya esta comprometido antes de decidir nada."
          action={
            <Link href="/compromisos/nuevo">
              <Button size="sm">Cargar el primero</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {[...totals.expense.entries()].map(([currency, amount]) => (
              <Card key={`gasto-${currency}`}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Comprometido por mes
                </p>
                <p className="mt-1 text-3xl font-semibold tabular">
                  {formatMoney(amount, currency, { hideDecimals: true })}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {totals.subscriptions > 0
                    ? `Incluye ${totals.subscriptions} ${totals.subscriptions === 1 ? "suscripcion" : "suscripciones"}.`
                    : "Suma todo llevado a un numero mensual."}
                </p>
              </Card>
            ))}

            {[...totals.income.entries()].map(([currency, amount]) => (
              <Card key={`ingreso-${currency}`}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  Ingreso fijo por mes
                </p>
                <p className="mt-1 text-3xl font-semibold tabular text-positive">
                  {formatMoney(amount, currency, { hideDecimals: true })}
                </p>
              </Card>
            ))}
          </div>

          {pending.length > 0 ? (
            <Card className="mt-3 border-accent/30 bg-accent-soft">
              <div className="flex items-start gap-3">
                <CalendarClock className="mt-0.5 size-5 shrink-0 text-accent" />
                <p className="text-sm">
                  <span className="font-medium">
                    {pending.length}{" "}
                    {pending.length === 1 ? "venció" : "vencieron"} y{" "}
                    {pending.length === 1 ? "falta" : "faltan"} registrar.
                  </span>{" "}
                  Tocá &quot;Registrar&quot; y se cargan los movimientos con la
                  fecha que les corresponde, no la de hoy.
                </p>
              </div>
            </Card>
          ) : null}

          {GROUPS.map((group) => {
            const items = commitments.filter(
              (item) => item.kind === group.kind,
            );
            if (items.length === 0) return null;

            return (
              <section key={group.kind} className="mt-6">
                <h2 className="mb-1 text-sm font-medium">{group.title}</h2>
                <p className="mb-3 text-xs text-muted">{group.hint}</p>
                <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                  {items.map((item) => (
                    <CommitmentRow key={item.id} commitment={item} />
                  ))}
                </ul>
              </section>
            );
          })}

          <p className="mt-6 text-xs text-muted">
            El total mensual normaliza las frecuencias: algo anual de $12.000
            cuenta como $1.000 por mes, para poder sumarlo con el resto.
          </p>
        </>
      )}
    </Page>
  );
}
