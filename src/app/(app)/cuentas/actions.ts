"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guard";
import { parseAmount } from "@/lib/money";
import { AccountType, Currency } from "@/generated/prisma/enums";

export type AccountFormState = { error?: string };

const dayOfMonth = z.coerce.number().int().min(1).max(31);

const schema = z
  .object({
    name: z.string().trim().min(1, "Poné un nombre").max(60),
    type: z.enum(AccountType),
    currency: z.enum(Currency),
    institution: z.string().trim().max(60).optional(),
    openingBalance: z.string().optional(),
    isSavings: z.boolean(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Color invalido")
      .default("#64748b"),
    creditLimit: z.string().optional(),
    statementClosingDay: dayOfMonth.optional(),
    paymentDueDay: dayOfMonth.optional(),
  })
  .refine(
    (data) =>
      data.type !== "CREDIT_CARD" ||
      (data.statementClosingDay !== undefined &&
        data.paymentDueDay !== undefined),
    {
      // Sin cierre ni vencimiento no se puede calcular cuando impacta una
      // compra en cuotas, que es la razon de ser de la tarjeta en esta app.
      message: "En una tarjeta hacen falta el dia de cierre y el de vencimiento",
      path: ["statementClosingDay"],
    },
  );

function readForm(formData: FormData) {
  const raw = {
    name: formData.get("name"),
    type: formData.get("type"),
    currency: formData.get("currency"),
    institution: formData.get("institution") || undefined,
    openingBalance: formData.get("openingBalance") || undefined,
    isSavings: formData.get("isSavings") === "on",
    color: formData.get("color") || "#64748b",
    creditLimit: formData.get("creditLimit") || undefined,
    statementClosingDay: formData.get("statementClosingDay") || undefined,
    paymentDueDay: formData.get("paymentDueDay") || undefined,
  };

  return schema.safeParse(raw);
}

function buildData(data: z.infer<typeof schema>) {
  const isCard = data.type === "CREDIT_CARD";
  const opening = data.openingBalance
    ? parseAmount(data.openingBalance)
    : null;
  const limit = data.creditLimit ? parseAmount(data.creditLimit) : null;

  return {
    name: data.name,
    type: data.type,
    currency: data.currency,
    institution: data.institution ?? null,
    openingBalance: (opening ?? 0).toString(),
    isSavings: data.isSavings,
    color: data.color,
    // Los campos de tarjeta se limpian si la cuenta deja de serlo, para no
    // dejar un dia de cierre colgado en una caja de ahorro.
    creditLimit: isCard && limit ? limit.toString() : null,
    statementClosingDay: isCard ? (data.statementClosingDay ?? null) : null,
    paymentDueDay: isCard ? (data.paymentDueDay ?? null) : null,
  };
}

export async function createAccount(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const session = await requireAuth();
  const parsed = readForm(formData);

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const count = await prisma.account.count({
    where: { workspaceId: session.workspaceId },
  });

  await prisma.account.create({
    data: {
      ...buildData(parsed.data),
      workspaceId: session.workspaceId,
      sortOrder: count,
    },
  });

  revalidatePath("/cuentas");
  redirect("/cuentas");
}

export async function updateAccount(
  accountId: string,
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const session = await requireAuth();
  const parsed = readForm(formData);

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // updateMany con el workspaceId en el where evita que alguien edite una
  // cuenta ajena mandando otro id: no hay fila que coincida.
  const updated = await prisma.account.updateMany({
    where: { id: accountId, workspaceId: session.workspaceId },
    data: buildData(parsed.data),
  });

  if (updated.count === 0) return { error: "No encontramos esa cuenta." };

  revalidatePath("/cuentas");
  redirect("/cuentas");
}

export async function toggleArchiveAccount(accountId: string) {
  const session = await requireAuth();

  const account = await prisma.account.findFirst({
    where: { id: accountId, workspaceId: session.workspaceId },
    select: { archivedAt: true },
  });

  if (!account) return;

  await prisma.account.updateMany({
    where: { id: accountId, workspaceId: session.workspaceId },
    data: { archivedAt: account.archivedAt ? null : new Date() },
  });

  revalidatePath("/cuentas");
}

/**
 * Solo se puede borrar una cuenta sin movimientos.
 *
 * Con movimientos hay que archivarla: borrarla se llevaria puesto el historial
 * y los saldos de meses ya cerrados dejarian de cuadrar.
 */
export async function deleteAccount(accountId: string) {
  const session = await requireAuth();

  const movements = await prisma.transaction.count({
    where: {
      workspaceId: session.workspaceId,
      OR: [{ accountId }, { toAccountId: accountId }],
    },
  });

  if (movements > 0) {
    await toggleArchiveAccount(accountId);
    return;
  }

  await prisma.account.deleteMany({
    where: { id: accountId, workspaceId: session.workspaceId },
  });

  revalidatePath("/cuentas");
}
