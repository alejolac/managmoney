import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PERIODS, type Period, type PeriodKind } from "@/lib/periods";
import { LinkPending } from "@/components/ui/link-pending";
import { cn } from "@/lib/cn";

const LABELS: Record<PeriodKind, string> = {
  mes: "Mes",
  semestre: "Semestre",
  ano: "Año",
};

/**
 * Cambiar de periodo son links: no hace falta javascript para navegar, y se
 * pueden abrir en otra pestana o compartir. Lo unico que agrega javascript es
 * el `LinkPending`, que avisa que el click salio mientras vuelve la consulta.
 */
export function PeriodNav({ period }: { period: Period }) {
  function href(kind: PeriodKind, ref: string) {
    return `/?periodo=${kind}&ref=${ref}`;
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
        {PERIODS.map((kind) => (
          <Link
            key={kind}
            href={href(kind, period.ref)}
            aria-current={period.kind === kind ? "page" : undefined}
            className={cn(
              "relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              period.kind === kind
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            {LABELS[kind]}
            <LinkPending />
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <Link
          href={href(period.kind, period.previousRef)}
          aria-label="Periodo anterior"
          className="relative rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          <LinkPending className="bottom-1" />
        </Link>

        <span className="min-w-32 text-center text-sm font-medium capitalize">
          {period.label}
        </span>

        {period.hasNext ? (
          <Link
            href={href(period.kind, period.nextRef)}
            aria-label="Periodo siguiente"
            className="relative rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <ChevronRight className="size-4" />
            <LinkPending className="bottom-1" />
          </Link>
        ) : (
          // Sin periodo siguiente el boton se deja en su lugar, apagado, para
          // que la fecha no se corra de posicion al navegar.
          <span className="p-2 opacity-25" aria-hidden>
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </div>
  );
}
