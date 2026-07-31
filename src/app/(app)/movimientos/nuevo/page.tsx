import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { latestRate } from "@/lib/exchange-rate";
import { toDateInputValue } from "@/lib/dates";
import { Card, EmptyState, Page, PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { TransactionForm } from "./transaction-form";

export const metadata = { title: "Nuevo movimiento | Managoney" };

export default async function NuevoMovimientoPage() {
  const session = await requireAuth();

  const [workspace, accounts, categories, envelopes] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: session.workspaceId },
      select: { baseCurrency: true },
    }),
    prisma.account.findMany({
      where: { workspaceId: session.workspaceId, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, currency: true, type: true },
    }),
    prisma.category.findMany({
      where: { workspaceId: session.workspaceId, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        kind: true,
        parent: { select: { name: true } },
      },
    }),
    prisma.envelope.findMany({
      where: { workspaceId: session.workspaceId, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, kind: true, currency: true },
    }),
  ]);

  if (accounts.length === 0) {
    return (
      <Page className="max-w-2xl">
        <PageHeader title="Nuevo movimiento" />
        <EmptyState
          title="Primero necesitas una cuenta"
          description="Un movimiento siempre sale o entra de algun lado."
          action={
            <Link href="/cuentas/nueva">
              <Button size="sm">Crear cuenta</Button>
            </Link>
          }
        />
      </Page>
    );
  }

  // Se precarga la ultima cotizacion conocida para no tener que buscarla.
  const foreign = accounts.find(
    (account) => account.currency !== workspace.baseCurrency,
  );
  const rate = foreign
    ? await latestRate(foreign.currency, workspace.baseCurrency)
    : null;

  return (
    <Page className="max-w-2xl">
      <Link
        href="/movimientos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Movimientos
      </Link>

      <PageHeader title="Nuevo movimiento" />

      <Card>
        <TransactionForm
          accounts={accounts}
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            kind: category.kind,
            parentName: category.parent?.name ?? null,
          }))}
          envelopes={envelopes}
          baseCurrency={workspace.baseCurrency}
          today={toDateInputValue(new Date())}
          knownRate={rate ? rate.rate.toString() : null}
        />
      </Card>
    </Page>
  );
}
