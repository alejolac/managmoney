"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Boton de submit que se deshabilita solo mientras corre la action.
 *
 * Ademas de dar feedback, evita el doble submit: sin esto un doble click en
 * "Guardar gasto" carga el gasto dos veces.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "w-full",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className={className} disabled={pending}>

      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {pendingLabel ?? "Un momento..."}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
