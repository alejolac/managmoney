"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guard";
import { parseAmount } from "@/lib/money";
import { toDateOnly } from "@/lib/dates";
import { createInstallmentPlan } from "@/lib/installments.server";

export type PlanFormState = { error?: string };

const schema = z.object({
  accountId: z.string().min(1, "Elegi la tarjeta o cuenta"),
  totalAmount: z.string().min(1, "Poné el total de la compra"),
  count: z.coerce.number().int().min(2, "Un plan tiene al menos 2 cuotas").max(120),
  purchaseDate: z.string().min(1, "Falta la fecha de la compra"),
  description: z.string().trim().min(1, "Poné que compraste").max(140),
  merchant: z.string().trim().max(80).optional(),
  categoryId: z.string().optional(),
  rate: z.string().optional(),
});

export async function createPlan(
  _prev: PlanFormState,
  formData: FormData,
): Promise<PlanFormState> {
  const session = await requireAuth();

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const input = parsed.data;

  const total = parseAmount(input.totalAmount);
  if (!total || total.lte(0)) {
    return { error: "El total tiene que ser mayor a cero." };
  }

  const [workspace, account] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({
      where: { id: session.workspaceId },
      select: { baseCurrency: true },
    }),
    prisma.account.findFirst({
      where: { id: input.accountId, workspaceId: session.workspaceId },
    }),
  ]);

  if (!account) return { error: "No encontramos esa cuenta." };

  try {
    await createInstallmentPlan(
      {
        workspaceId: session.workspaceId,
        account,
        totalAmount: total,
        count: input.count,
        purchaseDate: toDateOnly(input.purchaseDate),
        description: input.description,
        merchant: input.merchant || null,
        categoryId: input.categoryId || null,
        rate: input.rate ? parseAmount(input.rate) : null,
      },
      workspace.baseCurrency,
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo guardar.",
    };
  }

  revalidatePath("/cuotas");
  revalidatePath("/movimientos");
  revalidatePath("/cuentas");
  revalidatePath("/");
  redirect("/cuotas");
}

/**
 * Borra el plan y sus cuotas, incluidas las que ya vencieron.
 *
 * Es para arreglar una carga mal hecha, no para "cancelar" una compra: la
 * relacion borra en cascada las N transacciones.
 */
export async function deletePlan(formData: FormData) {
  const session = await requireAuth();
  const planId = String(formData.get("planId") ?? "");

  await prisma.installmentPlan.deleteMany({
    where: { id: planId, workspaceId: session.workspaceId },
  });

  revalidatePath("/cuotas");
  revalidatePath("/movimientos");
  revalidatePath("/cuentas");
  revalidatePath("/");
}
