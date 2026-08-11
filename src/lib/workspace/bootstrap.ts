import type { Prisma } from "@/generated/prisma/client";
import { CategoryKind } from "@/generated/prisma/enums";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  type CategorySeed,
} from "@/lib/data/default-categories";

/**
 * Crea las categorias iniciales de un workspace.
 *
 * Se corre una sola vez, al registrarse. A partir de ahi el catalogo lo
 * manejas vos: nada del sistema agrega categorias despues de esto.
 */
async function createCategories(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  kind: CategoryKind,
  seeds: CategorySeed[],
) {
  // Una sola query y no una por categoria: creando de a una eran ~30 idas y
  // vueltas a la base y la transaccion se pasaba de los 5s de timeout.
  await tx.category.createMany({
    data: seeds.map((seed, index) => ({
      workspaceId,
      kind,
      name: seed.name,
      color: seed.color,
      icon: seed.icon,
      isSystem: seed.system ?? false,
      sortOrder: index,
    })),
  });
}

/**
 * Arma un workspace vacio pero usable: categorias y las dos cuentas con las
 * que arranca cualquiera aca (pesos y dolares). El resto lo agregas vos.
 */
export async function bootstrapWorkspace(
  tx: Prisma.TransactionClient,
  opts: { userId: string; name: string },
) {
  const workspace = await tx.workspace.create({
    data: {
      name: opts.name,
      baseCurrency: "UYU",
      members: { create: { userId: opts.userId, role: "OWNER" } },
    },
  });

  await createCategories(
    tx,
    workspace.id,
    CategoryKind.EXPENSE,
    DEFAULT_EXPENSE_CATEGORIES,
  );
  await createCategories(
    tx,
    workspace.id,
    CategoryKind.INCOME,
    DEFAULT_INCOME_CATEGORIES,
  );

  await tx.account.createMany({
    data: [
      {
        workspaceId: workspace.id,
        name: "Cuenta en pesos",
        type: "CHECKING",
        currency: "UYU",
        color: "#22c55e",
        sortOrder: 0,
      },
      {
        workspaceId: workspace.id,
        name: "Ahorro en dolares",
        type: "SAVINGS",
        currency: "USD",
        // Marcarla como ahorro es lo que habilita la deteccion de desahorro.
        isSavings: true,
        color: "#0ea5e9",
        sortOrder: 1,
      },
      {
        workspaceId: workspace.id,
        name: "Efectivo",
        type: "CASH",
        currency: "UYU",
        color: "#f59e0b",
        sortOrder: 2,
      },
    ],
  });

  return workspace;
}
