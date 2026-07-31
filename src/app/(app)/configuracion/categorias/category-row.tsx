"use client";

import { useActionState, useState } from "react";
import { Archive, ArchiveRestore, Check, Lock, Pencil, Trash2, X } from "lucide-react";
import {
  deleteCategory,
  renameCategory,
  toggleArchiveCategory,
  type CategoryFormState,
} from "./actions";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";

export type CategoryNode = {
  id: string;
  name: string;
  color: string;
  isSystem: boolean;
  archived: boolean;
  usage: number;
  children: CategoryNode[];
};

function IconButton({
  label,
  onClick,
  children,
  danger,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2",
        danger ? "hover:text-negative" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function CategoryRow({
  category,
  depth = 0,
}: {
  category: CategoryNode;
  depth?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<CategoryFormState, FormData>(
    async (prev, formData) => {
      const result = await renameCategory(category.id, prev, formData);
      if (!result.error) setEditing(false);
      return result;
    },
    {},
  );

  return (
    <>
      <li
        className={cn(
          "flex items-center gap-3 px-4 py-2.5",
          category.archived && "opacity-50",
        )}
        style={{ paddingLeft: `${16 + depth * 24}px` }}
      >
        <span
          aria-hidden
          className="size-3 shrink-0 rounded-full"
          style={{ backgroundColor: category.color }}
        />

        {editing ? (
          <form action={formAction} className="flex flex-1 items-center gap-2">
            <Input
              name="name"
              defaultValue={category.name}
              autoFocus
              maxLength={50}
              className="h-8"
            />
            <IconButton label="Guardar">
              <Check className="size-4" />
            </IconButton>
            <button
              type="button"
              aria-label="Cancelar"
              onClick={() => setEditing(false)}
              className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2"
            >
              <X className="size-4" />
            </button>
          </form>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-sm">
              {category.name}
              {category.usage > 0 ? (
                <span className="ml-2 text-xs text-muted">
                  {category.usage}
                </span>
              ) : null}
            </span>

            {category.isSystem ? (
              <span
                title="Categoria del sistema: no se puede borrar"
                className="flex size-8 items-center justify-center text-muted"
              >
                <Lock className="size-3.5" />
              </span>
            ) : (
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  aria-label="Renombrar"
                  title="Renombrar"
                  onClick={() => setEditing(true)}
                  className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
                >
                  <Pencil className="size-4" />
                </button>

                <form action={toggleArchiveCategory.bind(null, category.id)}>
                  <IconButton
                    label={category.archived ? "Reactivar" : "Archivar"}
                  >
                    {category.archived ? (
                      <ArchiveRestore className="size-4" />
                    ) : (
                      <Archive className="size-4" />
                    )}
                  </IconButton>
                </form>

                {category.usage === 0 && category.children.length === 0 ? (
                  <form action={deleteCategory.bind(null, category.id)}>
                    <IconButton label="Eliminar" danger>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </form>
                ) : null}
              </div>
            )}
          </>
        )}
      </li>

      {state.error ? (
        <li className="px-4 pb-2 text-xs text-negative">{state.error}</li>
      ) : null}

      {category.children.map((child) => (
        <CategoryRow key={child.id} category={child} depth={depth + 1} />
      ))}
    </>
  );
}
