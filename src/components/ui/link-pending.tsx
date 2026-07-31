"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/cn";

/**
 * Un punto que late abajo del link recien clickeado mientras viaja la respuesta.
 *
 * Cambiar de periodo en el inicio no cambia de ruta, solo de parametros, asi
 * que el `loading.tsx` del segmento no vuelve a dispararse: la pantalla se
 * queda quieta con los numeros viejos los ~350 ms que tarda la consulta y
 * parece que el click no hizo nada. Esto es la senal de que si hizo algo.
 *
 * Tiene que ir *adentro* de un `<Link>`: `useLinkStatus` lee el estado de la
 * navegacion de su link mas cercano y afuera devuelve siempre `false`. Por eso
 * marca el control clickeado en vez de apagar el contenido como hace la lista
 * de movimientos, donde los filtros son `select` y el pendiente vive arriba.
 *
 * Va absoluto y con tamano fijo para no correr nada de lugar al aparecer, y
 * arranca con retraso (ver `.pending-dot` en globals.css): si la respuesta
 * llega rapido no se ve nada, que es mejor que un parpadeo.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden
      data-pending={pending}
      className={cn(
        "pending-dot absolute bottom-0.5 left-1/2 -translate-x-1/2",
        className,
      )}
    />
  );
}
