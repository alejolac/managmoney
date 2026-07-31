import Link from "next/link";
import QRCode from "qrcode";
import { ArrowLeft, ShieldCheck, ShieldOff } from "lucide-react";
import { requireAuth } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/auth/crypto";
import { buildOtpAuthUri } from "@/lib/auth/totp";
import { Button } from "@/components/ui/button";
import { Card, Page, PageHeader } from "@/components/ui/page";
import { ConfirmTotpForm } from "./confirm-totp-form";
import { DisableTotpForm, RegenerateCodesForm } from "./password-forms";
import { cancelTotpSetup, startTotpSetup } from "./actions";

export const metadata = { title: "Seguridad | Managoney" };

export default async function SeguridadPage() {
  const session = await requireAuth();

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { email: true, totpSecret: true, totpEnabledAt: true },
  });

  const enabled = user.totpEnabledAt !== null;
  // Secreto guardado pero sin activar: hay una activacion a medio camino.
  const pending = !enabled && user.totpSecret !== null;

  let qr: string | null = null;
  let manualKey: string | null = null;

  if (pending && user.totpSecret) {
    const secret = decrypt(user.totpSecret);
    manualKey = secret;
    qr = await QRCode.toDataURL(buildOtpAuthUri(secret, user.email), {
      margin: 1,
      width: 220,
    });
  }

  return (
    <Page className="max-w-xl">
      <Link
        href="/configuracion"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Ajustes
      </Link>

      <PageHeader
        title="Seguridad"
        description="Aca vive la plata: conviene tenerlo bien cerrado."
      />

      <Card>
        <div className="flex items-start gap-3">
          {enabled ? (
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-positive" />
          ) : (
            <ShieldOff className="mt-0.5 size-5 shrink-0 text-muted" />
          )}
          <div className="flex-1">
            <h2 className="font-medium">Verificacion en dos pasos</h2>
            <p className="text-sm text-muted">
              {enabled
                ? "Activa. Al entrar te pedimos un codigo de tu app de autenticacion."
                : "Sin activar. Con solo la contrasena alcanza para entrar."}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          {!enabled && !pending ? (
            <form action={startTotpSetup}>
              <Button type="submit" size="sm">
                Activar 2FA
              </Button>
            </form>
          ) : null}

          {pending && qr ? (
            <div className="space-y-4">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
                <li>Abri Google Authenticator, Authy o 1Password.</li>
                <li>Escanea este QR.</li>
                <li>Ingresa el codigo de 6 digitos que te muestra.</li>
              </ol>

              {/* eslint-disable-next-line @next/next/no-img-element -- data URI generada en el server */}
              <img
                src={qr}
                alt="Codigo QR para la app de autenticacion"
                className="rounded-xl border border-border bg-white p-2"
                width={220}
                height={220}
              />

              <details className="text-sm">
                <summary className="cursor-pointer text-muted hover:text-foreground">
                  No podes escanear el QR?
                </summary>
                <p className="mt-2 break-all rounded-lg bg-surface-2 p-3 font-mono text-xs">
                  {manualKey}
                </p>
              </details>

              <ConfirmTotpForm />

              <form action={cancelTotpSetup}>
                <button
                  type="submit"
                  className="text-sm text-muted hover:text-foreground"
                >
                  Cancelar
                </button>
              </form>
            </div>
          ) : null}

          {enabled ? (
            <div className="space-y-6">
              <div className="border-t border-border pt-5">
                <h3 className="mb-3 text-sm font-medium">
                  Codigos de recuperacion
                </h3>
                <RegenerateCodesForm />
              </div>

              <div className="border-t border-border pt-5">
                <DisableTotpForm />
              </div>
            </div>
          ) : null}
        </div>
      </Card>
    </Page>
  );
}
