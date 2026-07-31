import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { Card, Page, PageHeader } from "@/components/ui/page";
import { EnvelopeForm } from "./envelope-form";
import type { Currency } from "@/generated/prisma/enums";

export const metadata = { title: "Nuevo sobre | Managoney" };

export default async function NuevoSobrePage() {
  const session = await requireAuth();

  const [workspace, accounts] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: session.workspaceId },
      select: { baseCurrency: true },
    }),
    prisma.account.findMany({
      where: { workspaceId: session.workspaceId, archivedAt: null },
      select: { currency: true },
      distinct: ["currency"],
    }),
  ]);

  // Solo tiene sentido ofrecer monedas en las que realmente tenés plata.
  const currencies = [
    ...new Set([
      workspace.baseCurrency,
      ...accounts.map((account) => account.currency),
    ]),
  ] as Currency[];

  return (
    <Page className="max-w-2xl">
      <Link
        href="/sobres"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Sobres
      </Link>

      <PageHeader title="Nuevo sobre" />

      <Card>
        <EnvelopeForm
          currencies={currencies}
          baseCurrency={workspace.baseCurrency}
        />
      </Card>
    </Page>
  );
}
