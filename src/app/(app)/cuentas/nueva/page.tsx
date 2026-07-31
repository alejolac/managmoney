import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, Page, PageHeader } from "@/components/ui/page";
import { AccountForm } from "../account-form";
import { createAccount } from "../actions";

export const metadata = { title: "Nueva cuenta | Managoney" };

export default function NuevaCuentaPage() {
  return (
    <Page className="max-w-2xl">
      <Link
        href="/cuentas"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Cuentas
      </Link>

      <PageHeader title="Nueva cuenta" />

      <Card>
        <AccountForm action={createAccount} />
      </Card>
    </Page>
  );
}
