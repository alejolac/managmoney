import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import type { InstallmentPlanSummary } from "@/lib/installments.server";
import { DeletePlanButton } from "./delete-plan-button";
import { cn } from "@/lib/cn";

export function PlanCard({ plan }: { plan: InstallmentPlanSummary }) {
  const done = plan.paidCount >= plan.count;
  const progress = Math.round((plan.paidCount / plan.count) * 100);

  return (
    <article
      className={cn(
        "rounded-2xl border border-border bg-surface p-5",
        done && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-medium">{plan.description}</h2>
          <p className="mt-0.5 truncate text-sm text-muted">
            {[plan.merchant, plan.accountName, plan.categoryName]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <span className="text-right">
            <span className="block font-semibold tabular">
              {formatMoney(plan.installmentAmount, plan.currency)}
            </span>
            <span className="block text-xs text-muted">por mes</span>
          </span>
          <DeletePlanButton planId={plan.id} count={plan.count} />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
          <span
            className={cn(
              "block h-full rounded-full transition-all",
              done ? "bg-positive" : "bg-accent",
            )}
            style={{ width: `${progress}%` }}
          />
        </span>
        <span className="shrink-0 text-sm font-medium tabular">
          {plan.paidCount}/{plan.count}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Total</dt>
          <dd className="tabular">{formatMoney(plan.total, plan.currency)}</dd>
        </div>

        <div>
          <dt className="text-xs text-muted">Te falta</dt>
          <dd
            className={cn("tabular", !done && "font-medium text-negative")}
          >
            {formatMoney(plan.remainingAmount, plan.currency)}
          </dd>
        </div>

        <div>
          <dt className="text-xs text-muted">
            {done ? "Termino" : "Proxima cuota"}
          </dt>
          <dd className="tabular">
            {done
              ? plan.lastDueDate
                ? formatDate(plan.lastDueDate)
                : "—"
              : plan.nextDueDate
                ? formatDate(plan.nextDueDate)
                : "—"}
          </dd>
        </div>
      </dl>

      <Link
        href={`/movimientos?plan=${plan.id}`}
        className="mt-4 inline-block text-sm text-accent hover:underline"
      >
        Ver las {plan.count} cuotas
      </Link>
    </article>
  );
}
