"use client";

import { useActionState, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { createCategory, type CategoryFormState } from "./actions";
import { Field, FormError, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const COLORS = [
  "#f97316",
  "#22c55e",
  "#3b82f6",
  "#ef4444",
  "#a855f7",
  "#06b6d4",
  "#ec4899",
  "#8b5cf6",
  "#f59e0b",
  "#64748b",
];

export function NewCategoryForm({
  kind,
  parents,
}: {
  kind: "EXPENSE" | "INCOME";
  parents: { id: string; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<CategoryFormState, FormData>(
    async (prev, formData) => {
      const result = await createCategory(prev, formData);
      // Limpiar solo si guardo: si fallo, no se pierde lo que escribiste.
      if (!result.error) formRef.current?.reset();
      return result;
    },
    {},
  );

  const [color, setColor] = useState(COLORS[0]);
  const [parentId, setParentId] = useState("");

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="color" value={color} />

      <FormError>{state.error}</FormError>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor={`name-${kind}`}>
          <Input
            id={`name-${kind}`}
            name="name"
            required
            maxLength={50}
            placeholder={kind === "EXPENSE" ? "Farmacia" : "Alquiler cobrado"}
          />
        </Field>

        <Field label="Dentro de" htmlFor={`parent-${kind}`}>
          <Select
            id={`parent-${kind}`}
            name="parentId"
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">Categoria principal</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {parentId === "" ? (
        <Field label="Color">
          <div className="flex flex-wrap gap-2">
            {COLORS.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={`Color ${option}`}
                aria-pressed={color === option}
                onClick={() => setColor(option)}
                style={{ backgroundColor: option }}
                className={cn(
                  "size-7 rounded-full border-2 transition-transform",
                  color === option
                    ? "scale-110 border-foreground"
                    : "border-transparent hover:scale-105",
                )}
              />
            ))}
          </div>
        </Field>
      ) : (
        <p className="text-xs text-muted">
          Las subcategorias toman el color de su categoria madre, asi los
          graficos agrupan bien.
        </p>
      )}

      <Button type="submit" size="sm">
        <Plus className="size-4" />
        Agregar
      </Button>
    </form>
  );
}
