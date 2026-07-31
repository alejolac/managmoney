import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { Card, Page, PageHeader } from "@/components/ui/page";
import { AccountForm } from "../account-form";
import { updateAccount } from "../actions";
import { AccountDangerZone } from "./danger-zone";

export const metadata = { title: "Editar cuenta | Managoney" };

export default async function EditarCuentaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth();

  // El workspaceId en el where es lo que impide leer una cuenta ajena
  // cambiando el id en la URL.
  const account = await prisma.account.findFirst({
    where: { id, workspaceId: session.workspaceId },
  });

  if (!account) notFound();

  const movements = await prisma.transaction.count({
    where: {
      workspaceId: session.workspaceId,
      OR: [{ accountId: id }, { toAccountId: id }],
    },
  });

  return (
    <Page className="max-w-2xl">
      <Link
        href="/cuentas"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Cuentas
      </Link>

      <PageHeader
        title={account.name}
        description={
          movements === 0
            ? "Sin movimientos todavia."
            : `${movements} ${movements === 1 ? "movimiento" : "movimientos"}.`
        }
      />

      <Card>
        <AccountForm
          action={updateAccount.bind(null, account.id)}
          account={account}
        />
      </Card>

      <AccountDangerZone
        accountId={account.id}
        archived={account.archivedAt !== null}
        movements={movements}
      />
    </Page>
  );
}
