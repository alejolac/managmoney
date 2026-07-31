import Link from "next/link";
import { LogOut, Wallet } from "lucide-react";
import { requireAuth } from "@/lib/auth/guard";
import { readThemePreferences } from "@/lib/theme.server";
import { logout } from "@/app/(auth)/actions";
import { BottomNav, Sidebar } from "@/components/nav/nav-menu";
import { ThemeToggle } from "@/components/theme/theme-switcher";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Una sola verificacion de sesion para todo lo privado: cualquier pagina que
  // viva bajo (app) queda protegida sin tener que acordarse de llamar al guard.
  const session = await requireAuth();
  const { theme } = await readThemePreferences();

  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface p-4 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-1">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Wallet className="size-4.5" />
          </span>
          <span className="font-semibold tracking-tight">Managoney</span>
        </Link>

        <Sidebar />

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{session.user.name}</p>
            <p className="truncate text-xs text-muted">{session.user.email}</p>
          </div>
          <form action={logout}>
            <button
              type="submit"
              aria-label="Cerrar sesion"
              className="flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <LogOut className="size-4.5" />
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/90 px-4 py-3 backdrop-blur md:justify-end">
          <Link href="/" className="flex items-center gap-2 md:hidden">
            <span className="flex size-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Wallet className="size-4" />
            </span>
            <span className="font-semibold tracking-tight">Managoney</span>
          </Link>

          <ThemeToggle theme={theme} />
        </header>

        {/* pb-20 en mobile deja lugar para la barra inferior fija. */}
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
      </div>

      <BottomNav />
    </div>
  );
}
