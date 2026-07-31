import "server-only";
import { cookies } from "next/headers";
import {
  ACCENT_COOKIE,
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  isAccent,
  isTheme,
  THEME_COOKIE,
  type Accent,
  type Theme,
} from "@/lib/theme";

/**
 * El tema vive en una cookie y no en localStorage.
 *
 * Con localStorage el servidor no sabe que tema elegiste, pinta claro y recien
 * al hidratar salta a oscuro: el flash blanco clasico. Leyendolo de la cookie,
 * el HTML ya sale con el tema correcto.
 */
export async function readThemePreferences(): Promise<{
  theme: Theme;
  accent: Accent;
}> {
  const store = await cookies();

  const theme = store.get(THEME_COOKIE)?.value;
  const accent = store.get(ACCENT_COOKIE)?.value;

  return {
    theme: isTheme(theme) ? theme : DEFAULT_THEME,
    accent: isAccent(accent) ? accent : DEFAULT_ACCENT,
  };
}
