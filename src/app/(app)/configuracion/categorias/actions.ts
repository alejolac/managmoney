"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guard";
import { CategoryKind } from "@/generated/prisma/enums";

const PATH = "/configuracion/categorias";

export type CategoryFormState = { error?: string };

const schema = z.object({
  name: z.string().trim().min(1, "Poné un nombre").max(50),
  kind: z.enum(CategoryKind),
  parentId: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color invalido"),
});

export async function createCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const session = await requireAuth();

  const parsed = schema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    parentId: formData.get("parentId") || undefined,
    color: formData.get("color") || "#64748b",
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { name, kind, parentId, color } = parsed.data;

  // Una subcategoria hereda el color del padre para que los graficos agrupen
  // bien, y tiene que colgar de un padre del mismo tipo.
  let resolvedColor = color;

  if (parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: parentId, workspaceId: session.workspaceId, kind },
      select: { color: true, parentId: true },
    });

    if (!parent) return { error: "Esa categoria madre no existe." };
    // Dos niveles alcanzan: mas profundidad complica los reportes sin aportar.
    if (parent.parentId) return { error: "No se pueden anidar mas de dos niveles." };

    resolvedColor = parent.color;
  }

  const duplicate = await prisma.category.findFirst({
    where: {
      workspaceId: session.workspaceId,
      parentId: parentId ?? null,
      name,
    },
  });

  if (duplicate) return { error: "Ya existe una categoria con ese nombre." };

  const count = await prisma.category.count({
    where: { workspaceId: session.workspaceId, parentId: parentId ?? null },
  });

  await prisma.category.create({
    data: {
      workspaceId: session.workspaceId,
      name,
      kind,
      parentId: parentId ?? null,
      color: resolvedColor,
      sortOrder: count,
    },
  });

  revalidatePath(PATH);
  return {};
}

export async function renameCategory(
  categoryId: string,
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const session = await requireAuth();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Poné un nombre" };
  if (name.length > 50) return { error: "Nombre demasiado largo" };

  const updated = await prisma.category.updateMany({
    where: { id: categoryId, workspaceId: session.workspaceId },
    data: { name },
  });

  if (updated.count === 0) return { error: "No encontramos esa categoria." };

  revalidatePath(PATH);
  return {};
}

export async function toggleArchiveCategory(categoryId: string) {
  const session = await requireAuth();

  const category = await prisma.category.findFirst({
    where: { id: categoryId, workspaceId: session.workspaceId },
    select: { archivedAt: true, isSystem: true },
  });

  // "Sin categorizar" es el destino de todo lo que el OCR o el import no
  // logran mapear: si se archiva, esos movimientos se quedan sin donde caer.
  if (!category || category.isSystem) return;

  const archivedAt = category.archivedAt ? null : new Date();

  await prisma.$transaction([
    prisma.category.updateMany({
      where: { id: categoryId, workspaceId: session.workspaceId },
      data: { archivedAt },
    }),
    // Archivar una categoria madre archiva sus hijas: dejarlas sueltas en la
    // lista sin su padre confunde mas de lo que ayuda.
    prisma.category.updateMany({
      where: { parentId: categoryId, workspaceId: session.workspaceId },
      data: { archivedAt },
    }),
  ]);

  revalidatePath(PATH);
}

/**
 * Borrar de verdad solo si nunca se uso. Si tiene movimientos, se archiva:
 * borrarla dejaria gastos historicos sin categoria y rompe los reportes viejos.
 */
export async function deleteCategory(categoryId: string) {
  const session = await requireAuth();

  const category = await prisma.category.findFirst({
    where: { id: categoryId, workspaceId: session.workspaceId },
    select: { isSystem: true },
  });

  if (!category || category.isSystem) return;

  const [used, children] = await Promise.all([
    prisma.transaction.count({
      where: { workspaceId: session.workspaceId, categoryId },
    }),
    prisma.category.count({
      where: { workspaceId: session.workspaceId, parentId: categoryId },
    }),
  ]);

  if (used > 0 || children > 0) {
    await toggleArchiveCategory(categoryId);
    return;
  }

  await prisma.category.deleteMany({
    where: { id: categoryId, workspaceId: session.workspaceId },
  });

  revalidatePath(PATH);
}
