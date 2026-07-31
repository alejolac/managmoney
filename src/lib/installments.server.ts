import "server-only";
import { prisma } from "@/lib/prisma";
import { Decimal, toBaseAmount, ZERO } from "@/lib/money";
import { resolveBaseRate } from "@/lib/transactions";
import { installmentDueDates, splitInstallments } from "@/lib/installments";
import type { Account } from "@/generated/prisma/client";
import type { Currency } from "@/generated/prisma/enums";

export type CreateInstallmentPlanInput = {
  workspaceId: string;
  account: Account;
  totalAmount: Decimal;
  count: number;
  purchaseDate: Date;
  description: string;
  merchant?: string | null;
  categoryId?: string | null;
  /** Cotizacion a la moneda base, si la tarjeta esta en otra moneda. */
  rate?: Decimal | null;
};

/**
 * Crea el plan y de una las N transacciones futuras, cada una con su
 * vencimiento. El saldo de la tarjeta solo cuenta las que ya vencieron, y las
 * que faltan quedan a la vista como plata comprometida.
 */
export async function createInstallmentPlan(
  input: CreateInstallmentPlanInput,
  baseCurrency: Currency,
) {
  const currency = input.account.currency;

  const rate = await resolveBaseRate({
    currency,
    baseCurrency,
    date: input.purchaseDate,
    provided: input.rate,
  });

  if (!rate) {
    throw new Error(
      `Falta la cotizacion ${currency} a ${baseCurrency} para esa fecha.`,
    );
  }

  const amounts = splitInstallments(input.totalAmount, input.count, currency);
  const dueDates = installmentDueDates(
    input.account,
    input.purchaseDate,
    input.count,
  );

  // El total que se guarda es la suma de las cuotas, no lo que escribiste: si
  // el redondeo movio un centavo, el plan y sus cuotas tienen que cerrar.
  const total = amounts.reduce((sum, amount) => sum.plus(amount), ZERO);

  return prisma.$transaction(
    async (tx) => {
      const plan = await tx.installmentPlan.create({
        data: {
          workspaceId: input.workspaceId,
          accountId: input.account.id,
          categoryId: input.categoryId ?? null,
          description: input.description,
          merchant: input.merchant ?? null,
          totalAmount: total.toString(),
          currency,
          count: input.count,
          purchaseDate: input.purchaseDate,
          firstDueDate: dueDates[0],
        },
      });

      await tx.transaction.createMany({
        data: amounts.map((amount, index) => ({
          workspaceId: input.workspaceId,
          type: "EXPENSE" as const,
          // La compra ocurrio una sola vez; lo que cambia mes a mes es cuando
          // te sale la plata.
          date: input.purchaseDate,
          settlementDate: dueDates[index],
          accountId: input.account.id,
          amount: amount.toString(),
          currency,
          amountBase: toBaseAmount(amount, rate, baseCurrency).toString(),
          baseRate: rate.toString(),
          categoryId: input.categoryId ?? null,
          description: input.description,
          merchant: input.merchant ?? null,
          installmentPlanId: plan.id,
          installmentNumber: index + 1,
          source: "MANUAL" as const,
        })),
      });

      return plan;
    },
    { timeout: 20_000 },
  );
}

export type InstallmentPlanSummary = {
  id: string;
  description: string;
  merchant: string | null;
  accountName: string;
  categoryName: string | null;
  currency: Currency;
  total: Decimal;
  count: number;
  paidCount: number;
  paidAmount: Decimal;
  remainingAmount: Decimal;
  installmentAmount: Decimal;
  nextDueDate: Date | null;
  lastDueDate: Date | null;
  purchaseDate: Date;
};

/**
 * Los planes con lo que ya pagaste y lo que falta.
 *
 * "Pagada" es una cuota cuyo vencimiento ya paso: no hay que marcar nada a
 * mano, la fecha alcanza.
 */
export async function listInstallmentPlans(
  workspaceId: string,
): Promise<InstallmentPlanSummary[]> {
  const plans = await prisma.installmentPlan.findMany({
    where: { workspaceId },
    orderBy: { purchaseDate: "desc" },
    include: {
      account: { select: { name: true } },
      category: { select: { name: true } },
      transactions: {
        orderBy: { installmentNumber: "asc" },
        select: { amount: true, settlementDate: true },
      },
    },
  });

  const now = new Date();

  return plans.map((plan) => {
    let paidCount = 0;
    let paidAmount = ZERO;
    let remainingAmount = ZERO;
    let nextDueDate: Date | null = null;

    for (const installment of plan.transactions) {
      const amount = new Decimal(installment.amount.toString());

      if (installment.settlementDate <= now) {
        paidCount++;
        paidAmount = paidAmount.plus(amount);
      } else {
        remainingAmount = remainingAmount.plus(amount);
        if (!nextDueDate) nextDueDate = installment.settlementDate;
      }
    }

    const last = plan.transactions.at(-1);

    return {
      id: plan.id,
      description: plan.description,
      merchant: plan.merchant,
      accountName: plan.account.name,
      categoryName: plan.category?.name ?? null,
      currency: plan.currency,
      total: new Decimal(plan.totalAmount.toString()),
      count: plan.count,
      paidCount,
      paidAmount,
      remainingAmount,
      // La ultima cuota es la "limpia": la primera puede tener el centavo del
      // redondeo pegado.
      installmentAmount: new Decimal((last?.amount ?? 0).toString()),
      nextDueDate,
      lastDueDate: last?.settlementDate ?? null,
      purchaseDate: plan.purchaseDate,
    };
  });
}

/**
 * Cuanto en cuotas vence en cada uno de los proximos meses, por moneda.
 *
 * Es la pregunta que importa antes de comprar algo nuevo en cuotas: no cuanto
 * debo en total, sino cuanto ya tengo comprometido el mes que viene.
 */
export async function upcomingInstallmentLoad(
  workspaceId: string,
  months = 6,
): Promise<{ month: Date; currency: Currency; amount: Decimal }[]> {
  const rows = await prisma.$queryRaw<
    { month: Date; currency: Currency; amount: string }[]
  >`
    SELECT date_trunc('month', "settlementDate") AS month,
           currency,
           SUM(amount)::text AS amount
    FROM "Transaction"
    WHERE "workspaceId" = ${workspaceId}
      AND "installmentPlanId" IS NOT NULL
      AND "settlementDate" > NOW()
      AND "settlementDate" < NOW() + make_interval(months => ${months})
    GROUP BY 1, 2
    ORDER BY 1 ASC
  `;

  return rows.map((row) => ({
    month: row.month,
    currency: row.currency,
    amount: new Decimal(row.amount),
  }));
}
