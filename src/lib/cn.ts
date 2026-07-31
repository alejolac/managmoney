/**
 * Une clases ignorando falsy. Suficiente para este proyecto: no hay clases de
 * Tailwind compitiendo entre si como para necesitar tailwind-merge.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
