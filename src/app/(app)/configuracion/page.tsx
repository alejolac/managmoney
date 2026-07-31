import Link from "next/link";
import {
  ChevronRight,
  DollarSign,
  Palette,
  ShieldCheck,
  Tags,
} from "lucide-react";
import { Page, PageHeader } from "@/components/ui/page";
import { getSession } from "@/lib/auth/session";

export const metadata = { title: "Ajustes | Managoney" };

export default async function ConfiguracionPage() {
  const session = await getSession();

  const sections = [
    {
      href: "/configuracion/categorias",
      icon: Tags,
      title: "Categorias",
      description: "Crear, renombrar y ordenar en que gastas tu plata.",
    },
    {
      href: "/configuracion/cotizaciones",
      icon: DollarSign,
      title: "Cotizaciones",
      description: "La referencia del BCU para ver los reportes en una moneda.",
    },
    {
      href: "/configuracion/apariencia",
      icon: Palette,
      title: "Apariencia",
      description: "Modo claro u oscuro y color de acento.",
    },
    {
      href: "/configuracion/seguridad",
      icon: ShieldCheck,
      title: "Seguridad",
      description: session?.user.totpEnabled
        ? "Verificacion en dos pasos activa."
        : "Verificacion en dos pasos sin activar.",
    },
  ];

  return (
    <Page>
      <PageHeader title="Ajustes" />

      <div className="space-y-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-2"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <section.icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{section.title}</span>
              <span className="block text-sm text-muted">
                {section.description}
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted" />
          </Link>
        ))}
      </div>
    </Page>
  );
}
