/**
 * Estado rapido de la base. Uso: npm run status
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const users = await prisma.user.findMany({
    include: {
      sessions: true,
      recoveryCodes: true,
      memberships: {
        include: {
          workspace: {
            include: { _count: { select: { categories: true, accounts: true } } },
          },
        },
      },
    },
  });

  if (users.length === 0) {
    console.log("No hay usuarios todavia.");
    return;
  }

  const now = new Date();

  for (const user of users) {
    const active = user.sessions.filter(
      (s) => !s.revokedAt && s.expiresAt > now,
    );
    const unused = user.recoveryCodes.filter((c) => !c.usedAt);

    console.log(`email                 ${user.email}`);
    console.log(`nombre                ${user.name}`);
    console.log(
      `2FA                   ${user.totpEnabledAt ? `activo desde ${user.totpEnabledAt.toISOString().slice(0, 16)}` : "sin activar"}`,
    );
    console.log(
      `secreto TOTP          ${user.totpSecret ? `cifrado (${user.totpSecret.slice(0, 20)}...)` : "ninguno"}`,
    );
    console.log(
      `codigos recuperacion  ${unused.length} sin usar de ${user.recoveryCodes.length}`,
    );
    console.log(`sesiones activas      ${active.length}`);
    console.log(
      `pendientes de 2FA     ${active.filter((s) => s.pending2fa).length}`,
    );
    console.log(
      `intentos fallidos     ${user.failedLoginAttempts}${user.lockedUntil ? ` (bloqueado hasta ${user.lockedUntil.toISOString()})` : ""}`,
    );

    for (const membership of user.memberships) {
      const ws = membership.workspace;
      console.log(
        `workspace             ${ws.name} · base ${ws.baseCurrency} · ${ws._count.categories} categorias · ${ws._count.accounts} cuentas`,
      );
    }
    console.log("");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
