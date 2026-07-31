import "server-only";
import { z } from "zod";

/**
 * Variables de entorno validadas la primera vez que alguien las lee.
 *
 * Si falta algo revienta con un mensaje claro, en vez de fallar a medias
 * cuando ya estas guardando plata.
 *
 * La validacion es perezosa y no al importar el modulo por una razon concreta:
 * `next build` evalua todas las rutas para recolectarlas, sin atender ningun
 * pedido. Validando al importar, el build entero pasaba a necesitar la
 * contrasena de la base para hacer algo que nunca se conecta a la base, y
 * fallaba con un stack trace de Turbopack que no decia que faltaba una
 * variable. Encima no servia de nada como red de seguridad: en Vercel las
 * variables se cambian sin rebuildear, asi que un build verde no prueba que la
 * configuracion de ahora este bien.
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

type Env = z.infer<typeof schema>;

let cached: Env | undefined;

function load(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    // Donde arreglarlo depende de donde reviento: en Vercel no hay ningun .env
    // que mirar, y el mensaje generico manda a buscar un archivo que no existe.
    const donde = process.env.VERCEL
      ? "en las variables de entorno del proyecto en Vercel\n" +
        "(Settings > Environment Variables, tildando Production, Preview y\n" +
        "Development, y despues Redeploy: agregarlas no rebuildea solo)"
      : "en el archivo .env (copiar de .env.example)";

    throw new Error(
      `Faltan variables de entorno. Configuralas ${donde}:\n${detail}`,
    );
  }

  cached = parsed.data;
  return cached;
}

/**
 * Se usa igual que un objeto comun (`env.DATABASE_URL`); la validacion se
 * dispara sola en el primer acceso y despues queda cacheada.
 */
export const env: Env = new Proxy({} as Env, {
  get: (_target, property) => load()[property as keyof Env],
  has: (_target, property) => property in load(),
  ownKeys: () => Reflect.ownKeys(load()),
  getOwnPropertyDescriptor: (_target, property) =>
    Reflect.getOwnPropertyDescriptor(load(), property),
});
