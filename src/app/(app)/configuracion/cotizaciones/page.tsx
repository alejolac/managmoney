import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { BCU_CURRENCIES } from "@/lib/bcu";
import { Decimal } from "@/lib/money";
import { formatDate, toDateInputValue } from "@/lib/dates";
import { Card, Page, PageHeader } from "@/components/ui/page";
import { ManualRateForm, RefreshRatesForm } from "./rate-forms";

export const metadata = { title: "Cotizaciones | Managoney" };

export default async function CotizacionesPage() {
  await requireAuth();

  // La ultima cotizacion guardada de cada moneda, y las de los ultimos dias
  // para ver como se viene moviendo.
  const rates = await prisma.exchangeRate.findMany({
    where: { to: "UYU" },
    orderBy: { date: "desc" },
    take: 40,
  });

  const latest = new Map<string, (typeof rates)[number]>();
  for (const rate of rates) {
    if (!latest.has(rate.from)) latest.set(rate.from, rate);
  }

  const history = rates.filter((rate) => rate.from === "USD").slice(0, 8);

  return (
    <Page className="max-w-2xl">
      <Link
        href="/configuracion"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Ajustes
      </Link>

      <PageHeader
        title="Cotizaciones"
        description="Solo de referencia, para poder mirar los reportes en una sola moneda."
      />

      <Card className="border-accent/30 bg-accent-soft">
        <p className="text-sm">
          <span className="font-medium">Esta no es la cotizacion que pagás.</span>{" "}
          Cuando pasás pesos a dolares en Itau, el tipo de cambio sale solo de
          los dos montos reales que cargás en la transferencia, con el spread
          del banco adentro. La del BCU sirve para otra cosa: mostrar en dolares
          un gasto que hiciste en pesos.
        </p>
      </Card>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-medium text-muted">Ultima conocida</h2>

        {latest.size === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              Todavia no hay ninguna. Traelas del BCU con el boton de abajo.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {[...latest.values()].map((rate) => (
              <Card key={rate.id}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                  1 {rate.from}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular">
                  $ {new Decimal(rate.rate.toString()).toFixed(3)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {formatDate(rate.date)} · {rate.source}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-medium text-muted">Actualizar</h2>
        <Card>
          <RefreshRatesForm />
          <p className="mt-3 text-xs text-muted">
            En produccion esto corre solo una vez por dia. El boton esta para
            cuando no querés esperar.
          </p>
        </Card>
      </section>

      {history.length > 1 ? (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-medium text-muted">
            Ultimos dias del dolar
          </h2>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {history.map((rate) => (
              <li
                key={rate.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span className="text-muted">{formatDate(rate.date)}</span>
                <span className="font-medium tabular">
                  $ {new Decimal(rate.rate.toString()).toFixed(3)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-medium text-muted">Cargar a mano</h2>
        <Card>
          <ManualRateForm
            currencies={BCU_CURRENCIES}
            today={toDateInputValue(new Date())}
          />
        </Card>
      </section>
    </Page>
  );
}
