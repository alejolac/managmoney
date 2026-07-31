"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  ACCENT_COOKIE,
  ACCENTS,
  THEME_COOKIE,
  THEMES,
  type Accent,
  type Theme,
} from "@/lib/theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setTheme(theme: Theme) {
  if (!THEMES.includes(theme)) return;

  const store = await cookies();
  store.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });

  // El tema se aplica en <html>, en el layout raiz: hay que revalidar el
  // layout entero y no solo la pagina.
  revalidatePath("/", "layout");
}

export async function setAccent(accent: Accent) {
  if (!ACCENTS.includes(accent)) return;

  const store = await cookies();
  store.set(ACCENT_COOKIE, accent, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
}
