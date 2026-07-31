"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guard";
import { parseAmount } from "@/lib/money";
import { toDateOnly } from "@/lib/dates";
import { createExpenseOrIncome, createTransfer } from "@/lib/transactions";

export type TxFormState = { error?: string };

const schema = z.object({
  type: z.enum(["EXPENSE", "INCOME", "TRANSFER"]),
  accountId: z.string().min(1, "Elegi una cuenta"),
  amount: z.string().min(1, "Poné un monto"),
  date: z.string().min(1, "Falta la fecha"),
  categoryId: z.string().optional(),
  description: z.string().trim().max(140).optional(),
  merchant: z.string().trim().max(80).optional(),
  toAccountId: z.string().optional(),
  toAmount: z.string().optional(),
  rate: z.string().optional(),
  envelopeId: z.string().optional(),
});

export async function createTransaction(
  _prev: TxFormState,
  formData: FormData,
): Promise<TxFormState> {
  const session = await requireAuth();

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const input = parsed.data;

  const amount = parseAmount(input.amount);
  if (!amount || amount.lte(0)) {
    return { error: "El monto tiene que ser mayor a cero." };
  }

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: session.workspaceId },
    select: { baseCurrency: true },
  });

  const account = await prisma.account.findFirst({
    where: { id: input.accountId, workspaceId: session.workspaceId },
  });
  if (!account) return { error: "No encontramos esa cuenta." };

  const date = toDateOnly(input.date);

  // Se valida que el sobre sea de este workspace: viene de un select, pero un
  // select se edita desde las herramientas del navegador.
  let envelopeId: string | null = null;
  if (input.envelopeId) {
    const envelope = await prisma.envelope.findFirst({
      where: { id: input.envelopeId, workspaceId: session.workspaceId },
      select: { id: true },
    });
    if (!envelope) return { error: "No encontramos ese sobre." };
    envelopeId = envelope.id;
  }

  try {
    if (input.type === "TRANSFER") {
      if (!input.toAccountId) return { error: "Elegi la cuenta de destino." };
      if (input.toAccountId === input.accountId) {
        return { error: "El origen y el destino no pueden ser la misma cuenta." };
      }

      const to = await prisma.account.findFirst({
        where: { id: input.toAccountId, workspaceId: session.workspaceId },
      });
      if (!to) return { error: "No encontramos la cuenta de destino." };

      // Entre cuentas de la misma moneda entra lo mismo que sale; si cambian
      // de moneda, el monto de destino es un dato real que cargas vos.
      const toAmount =
        account.currency === to.currency
          ? amount
          : input.toAmount
            ? parseAmount(input.toAmount)
            : null;

      if (!toAmount || toAmount.lte(0)) {
        return { error: "Poné cuanto entro en la cuenta de destino." };
      }

      await createTransfer(
        {
          workspaceId: session.workspaceId,
          from: account,
          to,
          amount,
          toAmount,
          date,
          description: input.description,
          envelopeId,
        },
        workspace.baseCurrency,
      );
    } else {
      await createExpenseOrIncome(
        {
          workspaceId: session.workspaceId,
          type: input.type,
          account,
          amount,
          date,
          categoryId: input.categoryId || null,
          description: input.description,
          merchant: input.merchant,
          rate: input.rate ? parseAmount(input.rate) : null,
          envelopeId,
        },
        workspace.baseCurrency,
      );
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "No se pudo guardar.",
    };
  }

  revalidatePath("/movimientos");
  revalidatePath("/cuentas");
  revalidatePath("/");
  redirect("/movimientos");
}

export async function deleteTransaction(transactionId: string) {
  const session = await requireAuth();

  await prisma.transaction.deleteMany({
    where: { id: transactionId, workspaceId: session.workspaceId },
  });

  revalidatePath("/movimientos");
  revalidatePath("/cuentas");
  revalidatePath("/");
}
