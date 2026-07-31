import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

type Client = PrismaClient;

/**
 * Abre unas conexiones apenas se crea el cliente, sin esperar a que alguien
 * las use.
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
 * su mensaje, no la creacion del cliente.
 */
function warmPool(client: Client) {
  void Promise.all(
    [1, 2, 3].map(() => client.$queryRaw`SELECT 1`.catch(() => undefined)),
  );
}

function createPrismaClient(): Client {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "Falta DATABASE_URL. Localmente se copia de .env.example a .env; " +
        "en Vercel va en Settings > Environment Variables.",
    );
  }

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });

  warmPool(client);
  return client;
}

// En dev, Next recarga los modulos en cada cambio y se abriria un pool nuevo
// cada vez hasta agotar las conexiones. Guardarlo en globalThis sobrevive al
// hot reload.
const globalForPrisma = globalThis as unknown as {
  prisma: Client | undefined;
};

function getClient(): Client {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}

/**
 * Se usa igual que un `PrismaClient` comun; el cliente de verdad se crea recien
 * en el primer uso.
 *
 * Es perezoso porque `next build` evalua todos los modulos para recolectar las
 * rutas, sin atender ningun pedido. Creando el cliente al importar, el build
 * entero pasaba a necesitar la contrasena de la base para algo que nunca se
 * conecta a la base, y calentar el pool ahi era puro desperdicio.
 */
export const prisma: Client = new Proxy({} as Client, {
  get: (_target, property) => {
    const client = getClient();
    const value = client[property as keyof Client];
    // Los metodos del cliente (`$transaction`, `$queryRaw`) pierden su `this`
    // si se devuelven sueltos desde el proxy.
    return typeof value === "function" ? value.bind(client) : value;
  },
});
