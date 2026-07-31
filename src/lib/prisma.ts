import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Falta DATABASE_URL. Copiala de .env.example a .env.");
}

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });
}

// En dev, Next recarga los modulos en cada cambio y se abriria un pool nuevo
// cada vez hasta agotar las conexiones. Guardarlo en globalThis sobrevive al
// hot reload.
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
  prismaWarmed: boolean | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Abre unas conexiones apenas arranca, sin esperar a que alguien las use.
 *
 * Abrir una conexion a Neon cuesta ~1 segundo desde Uruguay: el handshake TLS
 * son como siete idas y vueltas, y una sola consulta despues cuesta 150 ms. Una
 * pantalla que lanza tres consultas en paralelo necesita tres conexiones, asi
 * que sin esto la primera pagina que abris se come ese segundo entero aunque
 * sus consultas sean rapidas. Medido: el inicio pasaba de 1055 ms a 154 ms con
 * el pool ya caliente.
 *
 * Van tres porque es lo maximo que pide una pantalla a la vez. Los errores se
 * ignoran a proposito: si la base no esta, que falle la consulta de verdad con
 * su mensaje, no el arranque del modulo.
 */
function warmPool() {
  if (globalForPrisma.prismaWarmed) return;
  globalForPrisma.prismaWarmed = true;

  void Promise.all(
    [1, 2, 3].map(() => prisma.$queryRaw`SELECT 1`.catch(() => undefined)),
  );
}

// Durante `next build` los modulos se evaluan para recolectar las rutas y no
// hay nadie esperando una consulta: abrir conexiones ahi es puro desperdicio.
if (process.env.NEXT_PHASE !== "phase-production-build") {
  warmPool();
}
