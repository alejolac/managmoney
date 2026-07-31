import { readThemePreferences } from "@/lib/theme.server";
import { Card, Page, PageHeader } from "@/components/ui/page";
import { AccentPicker, ThemeToggle } from "@/components/theme/theme-switcher";

export const metadata = { title: "Apariencia | Managoney" };

export default async function AparienciaPage() {
  const { theme, accent } = await readThemePreferences();

  return (
    <Page className="max-w-xl">
      <PageHeader
        title="Apariencia"
        description="Se guarda en tu navegador y se aplica desde el servidor, asi la pagina nunca parpadea en blanco al cargar."
      />

      <Card className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Modo</p>
            <p className="text-sm text-muted">
              {theme === "dark" ? "Oscuro" : "Claro"}
            </p>
          </div>
          <ThemeToggle theme={theme} />
        </div>

        <div className="border-t border-border pt-6">
          <p className="font-medium">Color de acento</p>
          <p className="mb-3 text-sm text-muted">
            No toca el verde de los ingresos ni el rojo de los gastos: esos
            significan siempre lo mismo.
          </p>
          <AccentPicker accent={accent} />
        </div>
      </Card>
    </Page>
  );
}
