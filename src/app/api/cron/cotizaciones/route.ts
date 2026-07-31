import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/auth/crypto";
import { syncBcuRates } from "@/lib/bcu";

/**
 * Sincroniza las cotizaciones del BCU una vez por dia.
 *
 * Lo dispara el cron de Vercel (ver vercel.json), que manda el CRON_SECRET en
 * el header. Sin ese secreto el endpoint no hace nada: es publico en internet
 * y no hay sesion de usuario que lo proteja.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Falta configurar CRON_SECRET." },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  if (!safeEqual(header, `Bearer ${env.CRON_SECRET}`)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const result = await syncBcuRates();

    return NextResponse.json({
      ok: true,
      saved: result.saved,
      latest: result.latest.map((quote) => ({
        currency: quote.currency,
        date: quote.date.toISOString().slice(0, 10),
        rate: quote.rate.toString(),
      })),
    });
  } catch (error) {
    // Que el BCU no conteste no es una falla de la app: las cotizaciones
    // viejas siguen sirviendo y manana se reintenta.
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Fallo la consulta",
      },
      { status: 502 },
    );
  }
}
