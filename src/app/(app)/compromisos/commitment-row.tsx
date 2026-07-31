import { Pause, Play, Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { FREQUENCY_LABELS } from "@/lib/recurrences";
import type { Commitment } from "@/lib/recurrences.server";
import { Button } from "@/components/ui/button";
import {
  archiveCommitment,
  registerCommitment,
  togglePause,
} from "./actions";
import { cn } from "@/lib/cn";

/** Como se lee la proxima fecha, que es el dato que uno mira primero. */
function whenLabel(commitment: Commitment): string {
  if (commitment.paused) return "En pausa";
  if (commitment.overdue > 1) return `${commitment.overdue} sin registrar`;
  if (commitment.daysLeft < 0) return `Vencio hace ${-commitment.daysLeft} dias`;
  if (commitment.daysLeft === 0) return "Vence hoy";
  if (commitment.daysLeft === 1) return "Vence maniana";
  if (commitment.daysLeft <= 30) return `En ${commitment.daysLeft} dias`;
  return formatDate(commitment.nextRunDate);
}

export function CommitmentRow({ commitment }: { commitment: Commitment }) {
  const isIncome = commitment.type === "INCOME";
  const due = !commitment.paused && commitment.daysLeft <= 0;

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3",
        commitment.paused && "opacity-55",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {commitment.description}
        </span>
        <span className="block truncate text-sm text-muted">
          {[
            FREQUENCY_LABELS[commitment.frequency],
            commitment.accountName,
            commitment.categoryName,
            commitment.mode === "AUTO" ? "automatico" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span
          className={cn(
            "block font-semibold tabular",
            isIncome ? "text-positive" : "text-foreground",
          )}
        >
          {formatMoney(commitment.amount, commitment.currency)}
        </span>
        <span
          className={cn(
            "block text-xs",
            due ? "font-medium text-negative" : "text-muted",
          )}
        >
          {whenLabel(commitment)}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-1">
        {due ? (
          <form action={registerCommitment}>
            <input
              type="hidden"
              name="recurrenceId"
              value={commitment.id}
            />
            <Button type="submit" size="sm" variant="secondary">
              Registrar
              {commitment.overdue > 1 ? ` (${commitment.overdue})` : ""}
            </Button>
          </form>
        ) : null}

        <form action={togglePause}>
          <input type="hidden" name="recurrenceId" value={commitment.id} />
          <button
            type="submit"
            aria-label={commitment.paused ? "Reanudar" : "Pausar"}
            className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            {commitment.paused ? (
              <Play className="size-4" />
            ) : (
              <Pause className="size-4" />
            )}
          </button>
        </form>

        <form action={archiveCommitment}>
          <input type="hidden" name="recurrenceId" value={commitment.id} />
          <button
            type="submit"
            aria-label="Dar de baja"
            className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-negative"
          >
            <Trash2 className="size-4" />
          </button>
        </form>
      </span>
    </li>
  );
}
