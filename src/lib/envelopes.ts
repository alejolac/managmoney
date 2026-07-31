import "server-only";
import { prisma } from "@/lib/prisma";
import { Decimal, ZERO } from "@/lib/money";
import type { Currency, EnvelopeKind, RolloverMode } from "@/generated/prisma/enums";

/**
 * Sobres.
 *
 * Separar plata del mes en baldes con nombre: "Salidas 4.000" y ver cuanto te
 * queda para gastar sin tener que hacer la cuenta de cabeza.
 *
 * Dos decisiones que ordenan todo lo demas:
 *
 * 1. Un sobre suma SOLO movimientos de su misma moneda. Nada se convierte. Un
 *    sobre de dolares cuenta dolares y listo: si convirtiera, el saldo de una
 *    meta cambiaria sola cuando se mueve la cotizacion, y una meta que se
 *    aleja sin que hayas gastado nada no sirve para nada.
 *
 * 2. La asignacion mensual no se materializa en la base. Un sobre de $4.000 por
 *    mes ya vale $4.000 todos los meses sin que nadie cree nada; solo se guarda
 *    una fila cuando pisas el monto de un mes puntual. Asi no hace falta un
 *    proceso que corra el dia 1 ni que la app escriba cada vez que la abris.
 */

export type EnvelopeStatus = {
  id: string;
  name: string;
  kind: EnvelopeKind;
  currency: Currency;
  color: string;
  rollover: RolloverMode;

  /** Cuanto se asigno para el mes que se esta mirando. */
  allocated: Decimal;
  /** Sobrante que llego del mes anterior (0 si el sobre resetea). */
  carriedIn: Decimal;
  /** Gastado en el mes. */
  spent: Decimal;
  /** Lo que queda para gastar: asignado + arrastre - gastado. */
  available: Decimal;
  /** Cuanto del sobre se uso, 0 a 100 (puede pasarse de 100). */
  usedPercent: number;
  /** Si el mes tiene una asignacion propia guardada en vez de la de siempre. */
  overridden: boolean;

  /** Solo metas: cuanto se junto en total. */
  saved: Decimal;
  target: Decimal | null;
  targetDate: Date | null;
  /** Solo metas: 0 a 100. */
  progress: number;
};

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function keyOf(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Los meses entre dos fechas, incluidos los dos extremos. */
function monthsBetween(from: Date, to: Date): { year: number; month: number }[] {
  const result: { year: number; month: number }[] = [];
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1),
  );
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));

  while (cursor <= end) {
    result.push({
      year: cursor.getUTCFullYear(),
      month: cursor.getUTCMonth() + 1,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return result;
}

type MovementRow = {
  envelope_id: string;
  month: Date;
  spent: string;
  net: string;
};

/**
 * Estado de todos los sobres para un mes.
 *
 * El arrastre se calcula recorriendo mes a mes desde que existe el sobre, no
 * leyendo un saldo guardado. Es exacto por construccion: si corregis un gasto
 * de hace tres meses, el arrastre de hoy se acomoda solo.
 */
export async function getEnvelopeStatus(
  workspaceId: string,
  year: number,
  month: number,
): Promise<EnvelopeStatus[]> {
  const [envelopes, movements, periods] = await Promise.all([
    prisma.envelope.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),

    // Un movimiento aporta al sobre solo si comparte su moneda. En una
    // transferencia mira las dos puntas: lo que ENTRA a la moneda del sobre
    // suma, lo que sale resta.
    prisma.$queryRaw<MovementRow[]>`
      SELECT t."envelopeId" AS envelope_id,
             date_trunc('month', t."settlementDate") AS month,
             COALESCE(SUM(t.amount) FILTER (
               WHERE t.type = 'EXPENSE' AND t.currency = e.currency
             ), 0)::text AS spent,
             COALESCE(SUM(
               CASE
                 WHEN t.type = 'EXPENSE'  AND t.currency = e.currency     THEN -t.amount
                 WHEN t.type = 'INCOME'   AND t.currency = e.currency     THEN  t.amount
                 WHEN t.type = 'TRANSFER' AND t."toCurrency" = e.currency THEN  t."toAmount"
                 WHEN t.type = 'TRANSFER' AND t.currency = e.currency     THEN -t.amount
                 ELSE 0
               END
             ), 0)::text AS net
      FROM "Transaction" t
      JOIN "Envelope" e ON e.id = t."envelopeId"
      WHERE t."workspaceId" = ${workspaceId}
        AND t."envelopeId" IS NOT NULL
      GROUP BY 1, 2
    `,

    prisma.envelopePeriod.findMany({
      where: { envelope: { workspaceId } },
    }),
  ]);

  const spentBy = new Map<string, Decimal>();
  /** Acumulado de siempre por sobre: es lo que mira una meta. */
  const savedBy = new Map<string, Decimal>();

  for (const row of movements) {
    spentBy.set(`${row.envelope_id}:${monthKey(row.month)}`, new Decimal(row.spent));
    savedBy.set(
      row.envelope_id,
      (savedBy.get(row.envelope_id) ?? ZERO).plus(row.net),
    );
  }

  const allocationBy = new Map<string, Decimal>();
  for (const period of periods) {
    allocationBy.set(
      `${period.envelopeId}:${keyOf(period.year, period.month)}`,
      new Decimal(period.allocated.toString()),
    );
  }

  return envelopes.map((envelope) => {
    const monthly = envelope.monthlyAmount
      ? new Decimal(envelope.monthlyAmount.toString())
      : ZERO;

    const key = `${envelope.id}:${keyOf(year, month)}`;
    const override = allocationBy.get(key);
    const allocated = override ?? monthly;
    const spent = spentBy.get(key) ?? ZERO;

    // Arrastre: se recorre desde el primer mes del sobre hasta el anterior al
    // pedido, acumulando lo que sobro. Con RESET siempre queda en cero, pero se
    // recorre igual para no tener dos caminos distintos.
    let carriedIn = ZERO;
    if (envelope.rollover === "CARRY_OVER" && envelope.kind === "MONTHLY") {
      const previous = new Date(Date.UTC(year, month - 2, 1));
      for (const step of monthsBetween(envelope.createdAt, previous)) {
        const stepKey = `${envelope.id}:${keyOf(step.year, step.month)}`;
        const stepAllocated = allocationBy.get(stepKey) ?? monthly;
        const stepSpent = spentBy.get(stepKey) ?? ZERO;
        carriedIn = carriedIn.plus(stepAllocated).minus(stepSpent);
      }
      // Un sobre no arranca el mes en rojo por lo que gastaste de mas antes:
      // eso ya se vio en su momento.
      if (carriedIn.isNegative()) carriedIn = ZERO;
    }

    const budget = allocated.plus(carriedIn);
    const available = budget.minus(spent);

    // Las metas acumulan desde siempre, no por mes.
    const saved = savedBy.get(envelope.id) ?? ZERO;

    const target = envelope.targetAmount
      ? new Decimal(envelope.targetAmount.toString())
      : null;

    return {
      id: envelope.id,
      name: envelope.name,
      kind: envelope.kind,
      currency: envelope.currency,
      color: envelope.color,
      rollover: envelope.rollover,
      allocated,
      carriedIn,
      spent,
      available,
      usedPercent: budget.lte(0)
        ? spent.gt(0)
          ? 100
          : 0
        : spent.div(budget).mul(100).toDecimalPlaces(1).toNumber(),
      overridden: override !== undefined,
      saved,
      target,
      targetDate: envelope.targetDate,
      progress:
        target && target.gt(0)
          ? Decimal.min(saved.div(target).mul(100), 999)
              .toDecimalPlaces(1)
              .toNumber()
          : 0,
    };
  });
}

/** Fija cuanto se asigna a un sobre en un mes puntual. */
export async function setAllocation(params: {
  workspaceId: string;
  envelopeId: string;
  year: number;
  month: number;
  amount: Decimal;
}) {
  // El where del upsert no puede filtrar por workspace, asi que se chequea
  // antes: sin esto, con el id de un sobre ajeno se le podria cambiar el monto.
  const envelope = await prisma.envelope.findFirst({
    where: { id: params.envelopeId, workspaceId: params.workspaceId },
    select: { id: true },
  });
  if (!envelope) throw new Error("No encontramos ese sobre.");

  return prisma.envelopePeriod.upsert({
    where: {
      envelopeId_year_month: {
        envelopeId: params.envelopeId,
        year: params.year,
        month: params.month,
      },
    },
    create: {
      envelopeId: params.envelopeId,
      year: params.year,
      month: params.month,
      allocated: params.amount.toString(),
    },
    update: { allocated: params.amount.toString() },
  });
}

/** Vuelve a la asignacion de siempre, borrando el ajuste de ese mes. */
export async function clearAllocation(params: {
  workspaceId: string;
  envelopeId: string;
  year: number;
  month: number;
}) {
  await prisma.envelopePeriod.deleteMany({
    where: {
      envelopeId: params.envelopeId,
      year: params.year,
      month: params.month,
      envelope: { workspaceId: params.workspaceId },
    },
  });
}
