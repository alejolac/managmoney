"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guard";
import { syncBcuRates } from "@/lib/bcu";
import { parseAmount } from "@/lib/money";
import { saveReferenceRate } from "@/lib/exchange-rate";
import { toDateOnly } from "@/lib/dates";
import type { Currency } from "@/generated/prisma/enums";

export type RatesFormState = { error?: string; message?: string };

export async function refreshRates(): Promise<RatesFormState> {
  await requireAuth();

  try {
    const result = await syncBcuRates();

    if (result.saved === 0) {
      return { error: "El BCU no devolvio cotizaciones para estos dias." };
    }

    return {
      message: `Se guardaron ${result.saved} cotizaciones del BCU.`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? `No se pudo consultar al BCU: ${error.message}`
          : "No se pudo consultar al BCU.",
    };
  } finally {
    revalidatePath("/configuracion/cotizaciones");
  }
}

/**
 * Cotizacion cargada a mano.
 *
 * Sirve para el dia que el BCU no publica o para poner la de tu banco si
 * preferis ver los reportes con esa.
 */
export async function saveManualRate(
  _prev: RatesFormState,
  formData: FormData,
): Promise<RatesFormState> {
  await requireAuth();

  const currency = String(formData.get("currency") ?? "") as Currency;
  const dateValue = String(formData.get("date") ?? "");
  const rate = parseAmount(String(formData.get("rate") ?? ""));

  if (!currency) return { error: "Elegi la moneda." };
  if (!dateValue) return { error: "Falta la fecha." };
  if (!rate || rate.lte(0)) return { error: "La cotizacion tiene que ser mayor a cero." };

  await saveReferenceRate({
    from: currency,
    to: "UYU",
    date: toDateOnly(dateValue),
    rate,
    source: "manual",
  });

  revalidatePath("/configuracion/cotizaciones");
  return { message: "Cotizacion guardada." };
}
