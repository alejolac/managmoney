import Link from "next/link";
import { Decimal, formatMoney, ZERO } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { EMPTY_FILTERS, toQueryString } from "@/lib/transaction-filters";
import type { EnvelopeStatus } from "@/lib/envelopes";
import { AllocationForm } from "./allocation-form";
import { cn } from "@/lib/cn";

export function EnvelopeCard({
  envelope,
  year,
  month,
  range,
}: {
  envelope: EnvelopeStatus;
  year: number;
  month: number;
  range: { from: string; to: string };
}) {
  const isGoal = envelope.kind === "GOAL";
  const overspent = envelope.available.isNegative();

  const percent = isGoal ? envelope.progress : envelope.usedPercent;
  const barWidth = Math.min(percent, 100);

  // Una meta acumula desde siempre, asi que su link no lleva rango de fechas;
  // un sobre mensual solo muestra lo del mes que se esta mirando.
  const movements = `/movimientos${toQueryString({
    ...EMPTY_FILTERS,
    envelopeId: envelope.id,
    ...(isGoal ? {} : range),
  })}`;

  const missing = envelope.target
    ? Decimal.max(envelope.target.minus(envelope.saved), ZERO)
    : null;

  return (
    <article className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: envelope.color }}
          />
          <div className="min-w-0">
            <h2 className="truncate font-medium">{envelope.name}</h2>
            <p className="text-xs text-muted">
              {isGoal
                ? envelope.targetDate
                  ? `Meta para ${formatDate(envelope.targetDate)}`
                  : "Meta de ahorro"
                : envelope.rollover === "CARRY_OVER"
                  ? "Lo que sobra pasa al mes siguiente"
                  : "Se reinicia cada mes"}
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          {isGoal ? (
            <>
              <p className="font-semibold tabular">
                {formatMoney(envelope.saved, envelope.currency, {
                  hideDecimals: true,
                })}
              </p>
              <p className="text-xs text-muted">
                de{" "}
                {envelope.target
                  ? formatMoney(envelope.target, envelope.currency, {
                      hideDecimals: true,
                    })
                  : "—"}
              </p>
            </>
          ) : (
            <>
              <p
                className={cn(
                  "font-semibold tabular",
                  overspent ? "text-negative" : "text-positive",
                )}
              >
                {formatMoney(envelope.available, envelope.currency)}
              </p>
              <p className="text-xs text-muted">
                {overspent ? "te pasaste" : "te queda"}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2">
        <span
          className={cn(
            "block h-full rounded-full transition-all",
            isGoal
              ? "bg-positive"
              : overspent
                ? "bg-negative"
                : percent > 80
                  ? "bg-warning"
                  : "bg-accent",
          )}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        {isGoal ? (
          <>
            <div>
              <dt className="text-xs text-muted">Juntado</dt>
              <dd className="tabular">
                {formatMoney(envelope.saved, envelope.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Falta</dt>
              <dd className="tabular">
                {missing ? formatMoney(missing, envelope.currency) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Avance</dt>
              <dd className="tabular">{envelope.progress}%</dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt className="text-xs text-muted">Asignado</dt>
              <dd className="tabular">
                {formatMoney(envelope.allocated, envelope.currency, {
                  hideDecimals: true,
                })}
                {envelope.overridden ? (
                  <span className="ml-1 text-xs text-muted">(este mes)</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Gastado</dt>
              <dd className="tabular">
                {formatMoney(envelope.spent, envelope.currency, {
                  hideDecimals: true,
                })}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">
                {envelope.carriedIn.gt(0) ? "Venia de antes" : "Uso"}
              </dt>
              <dd className="tabular">
                {envelope.carriedIn.gt(0)
                  ? formatMoney(envelope.carriedIn, envelope.currency, {
                      hideDecimals: true,
                    })
                  : `${envelope.usedPercent}%`}
              </dd>
            </div>
          </>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {isGoal ? (
          <span />
        ) : (
          <AllocationForm
            envelopeId={envelope.id}
            year={year}
            month={month}
            current={envelope.allocated.toString()}
            overridden={envelope.overridden}
          />
        )}

        <Link
          href={movements}
          className="text-sm text-accent hover:underline"
        >
          Ver movimientos
        </Link>
      </div>
    </article>
  );
}
