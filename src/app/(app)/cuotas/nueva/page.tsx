import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { latestRate } from "@/lib/exchange-rate";
import { toDateInputValue } from "@/lib/dates";
import { Card, EmptyState, Page, PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { PlanForm } from "./plan-form";

export const metadata = { title: "Nueva compra en cuotas | Managoney" };

export default async function NuevaCompraPage() {
  const session = await requireAuth();

  const [workspace, accounts, categories] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: session.workspaceId },
      select: { baseCurrency: true },
    }),
    prisma.account.findMany({
      where: { workspaceId: session.workspaceId, archivedAt: null },
      // Las tarjetas primero: es donde caen casi todas las compras en cuotas.
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        currency: true,
        type: true,
        statementClosingDay: true,
        paymentDueDay: true,
      },
    }),
    prisma.category.findMany({
      where: {
        workspaceId: session.workspaceId,
        archivedAt: null,
        kind: "EXPENSE",
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, parent: { select: { name: true } } },
    }),
  ]);

  if (accounts.length === 0) {
    return (
      <Page className="max-w-2xl">
        <PageHeader title="Nueva compra en cuotas" />
        <EmptyState
          title="Primero necesitas una cuenta"
          description="Idealmente la tarjeta con la que compras, con su dia de cierre y de vencimiento."
          action={
            <Link href="/cuentas/nueva">
              <Button size="sm">Crear cuenta</Button>
            </Link>
          }
        />
      </Page>
    );
  }

  const foreign = accounts.find(
    (account) => account.currency !== workspace.baseCurrency,
  );
  const rate = foreign
    ? await latestRate(foreign.currency, workspace.baseCurrency)
    : null;

  return (
    <Page className="max-w-2xl">
      <Link
        href="/cuotas"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Cuotas
      </Link>

      <PageHeader
        title="Nueva compra en cuotas"
        description="Se generan las cuotas de una, cada una con su vencimiento."
      />

      <Card>
        <PlanForm
          accounts={accounts}
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            parentName: category.parent?.name ?? null,
          }))}
          baseCurrency={workspace.baseCurrency}
          today={toDateInputValue(new Date())}
          knownRate={rate ? rate.rate.toString() : null}
        />
      </Card>
    </Page>
  );
}
