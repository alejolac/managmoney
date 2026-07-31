import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-surface-2", className)}
      aria-hidden
    />
  );
}

/**
 * Esqueleto generico de pantalla.
 *
 * Existe para que al tocar un link se pinte YA el layout con la forma de lo que
 * viene, en vez de dejar la pantalla anterior congelada hasta que responda la
 * base. La consulta tarda lo mismo; lo que cambia es que la app deja de
 * parecer trabada.
 */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:py-8">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
