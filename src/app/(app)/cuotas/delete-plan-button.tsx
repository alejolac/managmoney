"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Trash2 } from "lucide-react";
import { deletePlan } from "./actions";
import { Button } from "@/components/ui/button";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="danger" size="sm" disabled={pending}>
      {pending ? "Borrando..." : "Si, borrar todo"}
    </Button>
  );
}

/**
 * Confirmacion en dos pasos, sin `confirm()` del navegador.
 *
 * Borrar un plan se lleva puestas todas sus cuotas, incluidas las ya vencidas,
 * asi que conviene que cueste un click de mas.
 */
export function DeletePlanButton({
  planId,
  count,
}: {
  planId: string;
  count: number;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label="Eliminar plan"
        className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-negative"
      >
        <Trash2 className="size-4" />
      </button>
    );
  }

  return (
    <form action={deletePlan} className="flex items-center gap-2">
      <input type="hidden" name="planId" value={planId} />
      <span className="text-xs text-muted">
        Se borran las {count} cuotas
      </span>
      <ConfirmButton />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(false)}
      >
        Cancelar
      </Button>
    </form>
  );
}
