import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteAccount, toggleArchiveAccount } from "../actions";

/**
 * Archivar vs borrar.
 *
 * Una cuenta con movimientos NO se borra: se archiva. Borrarla dejaria
 * transacciones huerfanas y los saldos de meses ya cerrados dejarian de
 * cuadrar. Solo se puede eliminar de verdad si nunca se uso.
 */
export function AccountDangerZone({
  accountId,
  archived,
  movements,
}: {
  accountId: string;
  archived: boolean;
  movements: number;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-border p-5">
      <h2 className="font-medium">Dar de baja</h2>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <form action={toggleArchiveAccount.bind(null, accountId)}>
          <Button type="submit" variant="secondary" size="sm">
            {archived ? (
              <>
                <ArchiveRestore className="size-4" />
                Reactivar
              </>
            ) : (
              <>
                <Archive className="size-4" />
                Archivar
              </>
            )}
          </Button>
        </form>

        {movements === 0 ? (
          <form action={deleteAccount.bind(null, accountId)}>
            <Button type="submit" variant="danger" size="sm">
              <Trash2 className="size-4" />
              Eliminar
            </Button>
          </form>
        ) : null}
      </div>

      <p className="mt-3 text-sm text-muted">
        {movements === 0
          ? "Como no tiene movimientos, se puede eliminar del todo."
          : "Tiene movimientos, asi que solo se puede archivar: se esconde de las listas pero el historial queda intacto."}
      </p>
    </section>
  );
}
