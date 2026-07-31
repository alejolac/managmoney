"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Pencil, X } from "lucide-react";
import { updateAllocation } from "./actions";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} aria-label="Guardar">
      {pending ? "..." : <Check className="size-4" />}
    </Button>
  );
}

/**
 * Cambia lo que se asigna al sobre en ESTE mes.
 *
 * Dejarlo vacio borra el ajuste y el sobre vuelve a su monto de siempre; por
 * eso el placeholder muestra ese monto en vez de quedar en blanco.
 */
export function AllocationForm({
  envelopeId,
  year,
  month,
  current,
  overridden,
}: {
  envelopeId: string;
  year: number;
  month: number;
  current: string;
  overridden: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <Pencil className="size-3.5" />
        Ajustar este mes
      </button>
    );
  }

  return (
    <form
      action={async (formData) => {
        await updateAllocation(formData);
        setEditing(false);
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="envelopeId" value={envelopeId} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />

      <Input
        name="amount"
        inputMode="decimal"
        autoFocus
        defaultValue={overridden ? current : ""}
        placeholder={current}
        aria-label="Monto asignado este mes"
        className="h-8 w-28 tabular"
      />

      <SaveButton />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setEditing(false)}
        aria-label="Cancelar"
      >
        <X className="size-4" />
      </Button>
    </form>
  );
}
