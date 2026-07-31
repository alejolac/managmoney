import type { Prisma } from "@/generated/prisma/client";
import { CategoryKind } from "@/generated/prisma/enums";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  type CategorySeed,
} from "@/lib/data/default-categories";

/**
 * Crea el arbol de categorias inicial de un workspace.
 *
 * Se corre una sola vez, al registrarse. A partir de ahi el catalogo lo
 * manejas vos: nada del sistema agrega categorias despues de esto.
 */
async function createCategoryTree(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  kind: CategoryKind,
  seeds: CategorySeed[],
) {
  // Tres queries y no una por categoria: creando de a una eran ~30 idas y
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

  // Los hijos necesitan el id del padre, que solo conocemos despues de crearlos.
  const parents = await tx.category.findMany({
    where: { workspaceId, kind, parentId: null },
    select: { id: true, name: true },
  });
  const idByName = new Map(parents.map((parent) => [parent.name, parent.id]));

  const children = seeds.flatMap((seed) => {
    const parentId = idByName.get(seed.name);
    if (!parentId || !seed.children?.length) return [];

    return seed.children.map((child, childIndex) => ({
      workspaceId,
      kind,
      parentId,
      name: child.name,
      // Las subcategorias heredan el color del padre para que los graficos
      // se lean como bloques coherentes al agrupar por categoria madre.
      color: seed.color,
      icon: child.icon,
      sortOrder: childIndex,
    }));
  });

  if (children.length) await tx.category.createMany({ data: children });
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

  await createCategoryTree(
    tx,
    workspace.id,
    CategoryKind.EXPENSE,
    DEFAULT_EXPENSE_CATEGORIES,
  );
  await createCategoryTree(
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
