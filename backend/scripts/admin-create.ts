// Création d'un compte : uniquement en ligne de commande, jamais depuis le site.
// Usage : ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm admin:create
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/password';

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) throw new Error('ADMIN_EMAIL et ADMIN_PASSWORD (12 caractères minimum) sont requis');
  const prisma = new PrismaClient();
  const passwordHash = await hashPassword(password);
  await prisma.adminUser.upsert({ where: { email }, update: { passwordHash }, create: { email, passwordHash } });
  await prisma.$disconnect();
  console.log(`Compte prêt : ${email}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
