"use client";

import { useTransition } from "react";
import { Moon, Sun } from "lucide-react";
import { setAccent, setTheme } from "./theme-actions";
import { ACCENT_LABELS, ACCENTS, type Accent, type Theme } from "@/lib/theme";
import { cn } from "@/lib/cn";

export function ThemeToggle({ theme }: { theme: Theme }) {
  const [pending, startTransition] = useTransition();
  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      aria-label={next === "dark" ? "Activar modo oscuro" : "Activar modo claro"}
      disabled={pending}
      onClick={() => startTransition(() => setTheme(next))}
      className="flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
    >
      {theme === "dark" ? (
        <Sun className="size-4.5" />
      ) : (
        <Moon className="size-4.5" />
      )}
    </button>
  );
}

export function AccentPicker({ accent }: { accent: Accent }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      {ACCENTS.map((option) => (
        <button
          key={option}
          type="button"
          title={ACCENT_LABELS[option]}
          aria-label={ACCENT_LABELS[option]}
          aria-pressed={accent === option}
          disabled={pending}
          onClick={() => startTransition(() => setAccent(option))}
          data-accent={option}
          className={cn(
            "size-8 rounded-full border-2 transition-transform disabled:opacity-50",
            accent === option
              ? "scale-110 border-foreground"
              : "border-transparent hover:scale-105",
          )}
          // Usa la variable --accent que define el propio data-accent del boton,
          // asi cada muestra se pinta sola con el color que representa.
          style={{ backgroundColor: "var(--accent)" }}
        />
      ))}
    </div>
  );
}
