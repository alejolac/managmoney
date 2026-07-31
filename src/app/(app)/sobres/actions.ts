"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/guard";
import { parseAmount } from "@/lib/money";
import { toDateOnly } from "@/lib/dates";
import { clearAllocation, setAllocation } from "@/lib/envelopes";

export type EnvelopeFormState = { error?: string };

const schema = z.object({
  name: z.string().trim().min(1, "Poné un nombre").max(40),
  kind: z.enum(["MONTHLY", "GOAL"]),
  currency: z.enum(["UYU", "USD", "EUR", "BRL", "ARS"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color invalido").optional(),
  monthlyAmount: z.string().optional(),
  rollover: z.enum(["RESET", "CARRY_OVER"]).optional(),
  targetAmount: z.string().optional(),
  targetDate: z.string().optional(),
});

export async function createEnvelope(
  _prev: EnvelopeFormState,
  formData: FormData,
): Promise<EnvelopeFormState> {
  const session = await requireAuth();

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const input = parsed.data;

  const monthlyAmount = input.monthlyAmount
    ? parseAmount(input.monthlyAmount)
    : null;
  const targetAmount = input.targetAmount
    ? parseAmount(input.targetAmount)
    : null;

  if (input.kind === "MONTHLY" && (!monthlyAmount || monthlyAmount.lte(0))) {
    return { error: "Poné cuanto le asignás por mes." };
  }

  if (input.kind === "GOAL" && (!targetAmount || targetAmount.lte(0))) {
    return { error: "Poné a cuanto querés llegar." };
  }

  const duplicate = await prisma.envelope.findFirst({
    where: {
      workspaceId: session.workspaceId,
      name: input.name,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (duplicate) return { error: "Ya tenés un sobre con ese nombre." };

  await prisma.envelope.create({
    data: {
      workspaceId: session.workspaceId,
      name: input.name,
      kind: input.kind,
      currency: input.currency,
      color: input.color ?? "#64748b",
      monthlyAmount:
        input.kind === "MONTHLY" ? monthlyAmount!.toString() : null,
      rollover: input.kind === "MONTHLY" ? (input.rollover ?? "RESET") : "RESET",
      targetAmount: input.kind === "GOAL" ? targetAmount!.toString() : null,
      targetDate:
        input.kind === "GOAL" && input.targetDate
          ? toDateOnly(input.targetDate)
          : null,
    },
  });

  revalidatePath("/sobres");
  redirect("/sobres");
}

/** Cambia lo que se asigna a un sobre en un mes puntual. */
export async function updateAllocation(formData: FormData) {
  const session = await requireAuth();

  const envelopeId = String(formData.get("envelopeId") ?? "");
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  const raw = String(formData.get("amount") ?? "").trim();

  if (!envelopeId || !Number.isInteger(year) || !Number.isInteger(month)) return;

  if (raw === "") {
    await clearAllocation({
      workspaceId: session.workspaceId,
      envelopeId,
      year,
      month,
    });
  } else {
    const amount = parseAmount(raw);
    if (!amount || amount.isNegative()) return;

    await setAllocation({
      workspaceId: session.workspaceId,
      envelopeId,
      year,
      month,
      amount,
    });
  }

  revalidatePath("/sobres");
}

export async function archiveEnvelope(formData: FormData) {
  const session = await requireAuth();
  const envelopeId = String(formData.get("envelopeId") ?? "");

  await prisma.envelope.updateMany({
    where: { id: envelopeId, workspaceId: session.workspaceId },
    data: { archivedAt: new Date() },
  });

  revalidatePath("/sobres");
}

/**
 * Borra el sobre de verdad, pero solo si nunca se uso.
 *
 * Con movimientos asignados se archiva: borrarlo los dejaria sin sobre y los
 * meses ya cerrados dejarian de cuadrar.
 */
export async function deleteEnvelope(formData: FormData) {
  const session = await requireAuth();
  const envelopeId = String(formData.get("envelopeId") ?? "");

  const used = await prisma.transaction.count({
    where: { envelopeId, workspaceId: session.workspaceId },
  });

  if (used > 0) {
    await archiveEnvelope(formData);
    return;
  }

  await prisma.envelope.deleteMany({
    where: { id: envelopeId, workspaceId: session.workspaceId },
  });

  revalidatePath("/sobres");
}
