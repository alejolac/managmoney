import { Wallet } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Wallet className="size-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Managoney</h1>
            <p className="text-sm text-muted">Tus finanzas, en un solo lugar</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          {children}
        </div>
      </div>
    </main>
  );
}
