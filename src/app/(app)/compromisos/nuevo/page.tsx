import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { toDateInputValue } from "@/lib/dates";
import { Card, EmptyState, Page, PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { CommitmentForm } from "./commitment-form";

export const metadata = { title: "Nuevo compromiso | Managoney" };

export default async function NuevoCompromisoPage() {
  const session = await requireAuth();

  const [accounts, categories] = await Promise.all([
    prisma.account.findMany({
      where: { workspaceId: session.workspaceId, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, currency: true },
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
  ]);

  if (accounts.length === 0) {
    return (
      <Page className="max-w-2xl">
        <PageHeader title="Nuevo compromiso" />
        <EmptyState
          title="Primero necesitas una cuenta"
          description="Un compromiso siempre se paga o se cobra en algun lado."
          action={
            <Link href="/cuentas/nueva">
              <Button size="sm">Crear cuenta</Button>
            </Link>
          }
        />
      </Page>
    );
  }

  return (
    <Page className="max-w-2xl">
      <Link
        href="/compromisos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Compromisos
      </Link>

      <PageHeader title="Nuevo compromiso" />

      <Card>
        <CommitmentForm
          accounts={accounts}
          categories={categories.map((category) => ({
            id: category.id,
            name: category.name,
            kind: category.kind,
            parentName: category.parent?.name ?? null,
          }))}
          today={toDateInputValue(new Date())}
        />
      </Card>
    </Page>
  );
}
