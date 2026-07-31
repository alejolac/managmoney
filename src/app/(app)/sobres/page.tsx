import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Wallet } from "lucide-react";
import { requireAuth } from "@/lib/auth/guard";
import { getEnvelopeStatus } from "@/lib/envelopes";
import { formatMoney, ZERO } from "@/lib/money";
import { formatMonth } from "@/lib/dates";
import { resolvePeriod, periodToFilterDates } from "@/lib/periods";
import { Card, EmptyState, Page, PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { EnvelopeCard } from "./envelope-card";
import type { Currency } from "@/generated/prisma/enums";

export const metadata = { title: "Sobres | Managoney" };

export default async function SobresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAuth();
  const params = await searchParams;

  const period = resolvePeriod(
    "mes",
    typeof params.ref === "string" ? params.ref : null,
  );
  const year = period.from.getUTCFullYear();
  const month = period.from.getUTCMonth() + 1;

  const envelopes = await getEnvelopeStatus(session.workspaceId, year, month);

  const monthly = envelopes.filter((envelope) => envelope.kind === "MONTHLY");
  const goals = envelopes.filter((envelope) => envelope.kind === "GOAL");
  const range = periodToFilterDates(period);

  // El total de lo que queda, por moneda: es el numero que uno mira antes de
  // decidir si sale a comer afuera.
  const remaining = new Map<Currency, ReturnType<typeof ZERO.plus>>();
  for (const envelope of monthly) {
    remaining.set(
      envelope.currency,
      (remaining.get(envelope.currency) ?? ZERO).plus(envelope.available),
    );
  }

  return (
    <Page>
      <PageHeader
        title="Sobres"
        action={
          <Link href="/sobres/nuevo">
            <Button size="sm">
              <Plus className="size-4" />
              Nuevo sobre
            </Button>
          </Link>
        }
      />

      <div className="mb-6 flex items-center justify-center gap-1">
        <Link
          href={`/sobres?ref=${period.previousRef}`}
          aria-label="Mes anterior"
          className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </Link>
        <span className="min-w-32 text-center text-sm font-medium capitalize">
          {formatMonth(period.from)}
        </span>
        <Link
          href={`/sobres?ref=${period.nextRef}`}
          aria-label="Mes siguiente"
          className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <ChevronRight className="size-4" />
        </Link>
      </div>

      {envelopes.length === 0 ? (
        <EmptyState
          icon={<Wallet className="size-8" />}
          title="Todavia no tenés sobres"
          description="Separá parte del mes en baldes con nombre —Salidas, Nafta, Regalos— y mirá cuanto te queda en cada uno sin hacer la cuenta de cabeza."
          action={
            <Link href="/sobres/nuevo">
              <Button size="sm">Crear el primero</Button>
            </Link>
          }
        />
      ) : (
        <>
          {remaining.size > 0 ? (
            <div className="mb-6 grid gap-3 sm:grid-cols-2">
              {[...remaining.entries()].map(([currency, total]) => (
                <Card key={currency}>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    Te queda en sobres
                  </p>
                  <p className="mt-1 text-3xl font-semibold tabular">
                    {formatMoney(total, currency)}
                  </p>
                </Card>
              ))}
            </div>
          ) : null}

          {monthly.length > 0 ? (
            <section className="space-y-3">
              {monthly.map((envelope) => (
                <EnvelopeCard
                  key={envelope.id}
                  envelope={envelope}
                  year={year}
                  month={month}
                  range={range}
                />
              ))}
            </section>
          ) : null}

          {goals.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-medium text-muted">
                Metas de ahorro
              </h2>
              <div className="space-y-3">
                {goals.map((envelope) => (
                  <EnvelopeCard
                    key={envelope.id}
                    envelope={envelope}
                    year={year}
                    month={month}
                    range={range}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <p className="mt-6 text-xs text-muted">
            Un sobre cuenta solo movimientos de su misma moneda, y suma cuando
            le asignás el sobre al cargar el gasto.
          </p>
        </>
      )}
    </Page>
  );
}
