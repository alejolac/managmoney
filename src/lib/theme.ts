/**
 * Constantes del tema. Sin imports de servidor: este modulo lo consumen los
 * componentes del navegador, y traer `next/headers` aca romperia el bundle.
 * La lectura de las cookies vive en `theme.server.ts`.
 */

export const THEME_COOKIE = "managoney_theme";
export const ACCENT_COOKIE = "managoney_accent";

export const THEMES = ["light", "dark"] as const;
export const ACCENTS = [
  "emerald",
  "indigo",
  "violet",
  "rose",
  "amber",
  "cyan",
] as const;

export type Theme = (typeof THEMES)[number];
export type Accent = (typeof ACCENTS)[number];

export const ACCENT_LABELS: Record<Accent, string> = {
  emerald: "Verde",
  indigo: "Indigo",
  violet: "Violeta",
  rose: "Rosa",
  amber: "Ambar",
  cyan: "Celeste",
};

export const DEFAULT_THEME: Theme = "dark";
export const DEFAULT_ACCENT: Accent = "emerald";

export function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme);
}

export function isAccent(value: unknown): value is Accent {
  return ACCENTS.includes(value as Accent);
}
