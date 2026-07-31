"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guard";
import { parseAmount } from "@/lib/money";
import { toDateOnly } from "@/lib/dates";
import { runCommitment } from "@/lib/recurrences.server";

export type CommitmentFormState = { error?: string };

const schema = z.object({
  kind: z.enum(["SUBSCRIPTION", "FIXED_EXPENSE", "INCOME"]),
  description: z.string().trim().min(1, "Poné que es").max(140),
  merchant: z.string().trim().max(80).optional(),
  amount: z.string().min(1, "Poné el monto"),
  accountId: z.string().min(1, "Elegi la cuenta"),
  categoryId: z.string().optional(),
  frequency: z.enum([
    "WEEKLY",
    "BIWEEKLY",
    "MONTHLY",
    "BIMONTHLY",
    "QUARTERLY",
    "SEMIANNUAL",
    "YEARLY",
  ]),
  startDate: z.string().min(1, "Falta la fecha del proximo"),
  endDate: z.string().optional(),
  mode: z.enum(["AUTO", "CONFIRM"]),
});

export async function createCommitment(
  _prev: CommitmentFormState,
  formData: FormData,
): Promise<CommitmentFormState> {
  const session = await requireAuth();

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const input = parsed.data;

  const amount = parseAmount(input.amount);
  if (!amount || amount.lte(0)) {
    return { error: "El monto tiene que ser mayor a cero." };
  }

  const account = await prisma.account.findFirst({
    where: { id: input.accountId, workspaceId: session.workspaceId },
    select: { id: true, currency: true },
  });
  if (!account) return { error: "No encontramos esa cuenta." };

  const startDate = toDateOnly(input.startDate);
  const endDate = input.endDate ? toDateOnly(input.endDate) : null;

  if (endDate && endDate < startDate) {
    return { error: "La fecha de fin no puede ser anterior a la de inicio." };
  }

  await prisma.recurrence.create({
    data: {
      workspaceId: session.workspaceId,
      kind: input.kind,
      // Un compromiso de tipo INCOME es plata que entra; el resto sale.
      type: input.kind === "INCOME" ? "INCOME" : "EXPENSE",
      accountId: account.id,
      categoryId: input.categoryId || null,
      description: input.description,
      merchant: input.merchant || null,
      amount: amount.toString(),
      currency: account.currency,
      frequency: input.frequency,
      // El dia del mes se toma de la fecha de inicio: un alquiler que arranca
      // el 5 vence el 5 de cada mes sin que haya que decirlo aparte.
      dayOfMonth: startDate.getUTCDate(),
      startDate,
      endDate,
      nextRunDate: startDate,
      mode: input.mode,
    },
  });

  revalidatePath("/compromisos");
  redirect("/compromisos");
}

/** Registra los vencimientos que ya pasaron y adelanta la proxima fecha. */
export async function registerCommitment(formData: FormData) {
  const session = await requireAuth();
  const recurrenceId = String(formData.get("recurrenceId") ?? "");

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: session.workspaceId },
    select: { baseCurrency: true },
  });

  await runCommitment({
    workspaceId: session.workspaceId,
    recurrenceId,
    baseCurrency: workspace.baseCurrency,
  });

  revalidatePath("/compromisos");
  revalidatePath("/movimientos");
  revalidatePath("/cuentas");
  revalidatePath("/");
}

export async function togglePause(formData: FormData) {
  const session = await requireAuth();
  const recurrenceId = String(formData.get("recurrenceId") ?? "");

  const recurrence = await prisma.recurrence.findFirst({
    where: { id: recurrenceId, workspaceId: session.workspaceId },
    select: { pausedAt: true },
  });
  if (!recurrence) return;

  await prisma.recurrence.updateMany({
    where: { id: recurrenceId, workspaceId: session.workspaceId },
    data: { pausedAt: recurrence.pausedAt ? null : new Date() },
  });

  revalidatePath("/compromisos");
}

/**
 * Da de baja el compromiso.
 *
 * Se archiva en vez de borrarse: los movimientos que ya genero apuntan a el, y
 * borrarlo dejaria meses cerrados sin explicacion.
 */
export async function archiveCommitment(formData: FormData) {
  const session = await requireAuth();
  const recurrenceId = String(formData.get("recurrenceId") ?? "");

  await prisma.recurrence.updateMany({
    where: { id: recurrenceId, workspaceId: session.workspaceId },
    data: { archivedAt: new Date() },
  });

  revalidatePath("/compromisos");
}
