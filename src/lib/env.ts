import "server-only";
import { z } from "zod";

/**
 * Variables de entorno validadas al arrancar.
 *
 * Si falta algo, la app revienta en el boot con un mensaje claro en vez de
 * fallar a medias en runtime cuando ya estas guardando plata.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "Falta DATABASE_URL"),

  /// 32 bytes en base64. Cifra el secreto TOTP en la base.
  APP_ENCRYPTION_KEY: z
    .string()
    .min(1, "Falta APP_ENCRYPTION_KEY")
    .refine(
      (value) => Buffer.from(value, "base64").length === 32,
      "APP_ENCRYPTION_KEY tiene que ser 32 bytes en base64",
    ),

  ALLOW_REGISTRATION: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),

  ANTHROPIC_API_KEY: z.string().optional(),

  /// Protege el endpoint que corre el cron de Vercel. Sin esto, cualquiera
  /// puede disparar la sincronizacion de cotizaciones desde afuera.
  CRON_SECRET: z.string().min(16).optional(),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const detail = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Configuracion invalida en .env:\n${detail}`);
}

export const env = parsed.data;
