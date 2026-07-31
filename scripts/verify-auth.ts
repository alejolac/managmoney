/**
 * Verificacion manual del stack de auth contra la base real.
 * Uso: npx tsx --conditions react-server scripts/verify-auth.ts
 */
import "dotenv/config";
import { generate } from "otplib";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { decrypt, encrypt, hashToken } from "@/lib/auth/crypto";
import {
  createTotpSecret,
  verifyTotp,
  replaceRecoveryCodes,
  consumeRecoveryCode,
} from "@/lib/auth/totp";
import { isLocked, registerFailedAttempt } from "@/lib/auth/lockout";
import { bootstrapWorkspace } from "@/lib/workspace/bootstrap";

const EMAIL = "verify-auth@local.test";
let failures = 0;

function check(label: string, ok: boolean) {
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}`);
  if (!ok) failures++;
}

async function main() {
  // Limpieza por si quedo algo de una corrida anterior.
  await prisma.user.deleteMany({ where: { email: EMAIL } });

  // --- registro -----------------------------------------------------------
  const password = "una frase larga y comoda";
  const passwordHash = await hashPassword(password);

  const { user, workspaceId } = await prisma.$transaction(
    async (tx) => {
      const created = await tx.user.create({
        data: { name: "Verificacion", email: EMAIL, passwordHash },
      });
      const ws = await bootstrapWorkspace(tx, {
        userId: created.id,
        name: "Workspace de prueba",
      });
      return { user: created, workspaceId: ws.id };
    },
    { timeout: 20_000 },
  );

  check("se crea el usuario", Boolean(user.id));

  const [categories, accounts, systemCategories] = await Promise.all([
    prisma.category.count({ where: { workspaceId } }),
    prisma.account.count({ where: { workspaceId } }),
    prisma.category.count({ where: { workspaceId, isSystem: true } }),
  ]);
  check(`se siembran categorias (${categories})`, categories > 40);
  check(`se siembran cuentas (${accounts})`, accounts === 3);
  check("hay categorias de sistema", systemCategories === 2);

  const savings = await prisma.account.findFirst({
    where: { workspaceId, isSavings: true },
  });
  check("la cuenta en dolares queda marcada como ahorro", savings?.currency === "USD");

  // --- password -----------------------------------------------------------
  check("acepta la password correcta", await verifyPassword(passwordHash, password));
  check("rechaza la password incorrecta", !(await verifyPassword(passwordHash, "otra cosa")));
  check("el hash es argon2id", passwordHash.startsWith("$argon2id$"));

  // --- cifrado ------------------------------------------------------------
  const secret = createTotpSecret();
  const sealed = encrypt(secret);
  check("el cifrado devuelve algo distinto al texto plano", sealed !== secret);
  check("descifrar recupera el original", decrypt(sealed) === secret);
  check("dos cifrados del mismo texto difieren (IV aleatorio)", encrypt(secret) !== sealed);

  let tamperDetected = false;
  try {
    const raw = Buffer.from(sealed, "base64");
    raw[raw.length - 1] ^= 0xff; // corrompe el ultimo byte
    decrypt(raw.toString("base64"));
  } catch {
    tamperDetected = true;
  }
  check("detecta un payload manipulado (GCM)", tamperDetected);

  // --- TOTP ---------------------------------------------------------------
  const code = await generate({ secret });
  check("acepta un codigo TOTP valido", await verifyTotp(secret, code));
  check("rechaza un codigo invalido", !(await verifyTotp(secret, "000000")));
  check("rechaza un codigo mal formado", !(await verifyTotp(secret, "abc")));

  // --- codigos de recuperacion -------------------------------------------
  const codes = await replaceRecoveryCodes(user.id);
  check(`genera 10 codigos de recuperacion (${codes.length})`, codes.length === 10);

  const storedPlain = await prisma.recoveryCode.count({
    where: { userId: user.id, codeHash: { in: codes } },
  });
  check("los codigos se guardan hasheados, no en claro", storedPlain === 0);

  const storedHashed = await prisma.recoveryCode.count({
    where: { userId: user.id, codeHash: hashToken(codes[0]) },
  });
  check("el hash guardado coincide", storedHashed === 1);

  check("canjea un codigo valido", await consumeRecoveryCode(user.id, codes[0]));
  check("el mismo codigo no sirve dos veces", !(await consumeRecoveryCode(user.id, codes[0])));
  check("rechaza un codigo inventado", !(await consumeRecoveryCode(user.id, "xxxx-yyyy")));

  // --- bloqueo por intentos fallidos --------------------------------------
  for (let i = 0; i < 5; i++) await registerFailedAttempt(user.id);
  const locked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  check("bloquea despues de 5 intentos fallidos", isLocked(locked));
  check("resetea el contador al bloquear", locked.failedLoginAttempts === 0);

  // --- limpieza -----------------------------------------------------------
  await prisma.workspace.delete({ where: { id: workspaceId } });
  await prisma.user.delete({ where: { id: user.id } });

  const leftover = await prisma.category.count({ where: { workspaceId } });
  check("borrar el workspace arrastra sus categorias", leftover === 0);

  console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLARON`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
