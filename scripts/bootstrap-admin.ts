import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";

const email = z.email().parse(process.argv[2]?.trim().toLowerCase());
const url = z.string().regex(/^postgres(ql)?:\/\//).parse(process.env.DATABASE_URL);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
try {
  const existing = await db.user.count({ where: { platformRole: "SUPER_ADMIN" } });
  if (existing > 0) throw new Error("Já existe uma administração. O bootstrap é permitido apenas na configuração inicial.");
  // Serializable transaction prevents simultaneous first-admin bootstraps.
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(712409815)`;
    if (await tx.user.count({ where: { platformRole: "SUPER_ADMIN" } })) throw new Error("Bootstrap já executado.");
    const user = await tx.user.upsert({ where: { email }, create: { email, platformRole: "SUPER_ADMIN" }, update: { platformRole: "SUPER_ADMIN", active: true } });
    await tx.auditLog.create({ data: { actorId: user.id, action: "platform.bootstrap", metadata: {} } });
  });
  console.log("Administração inicial configurada. Nenhum e-mail foi enviado.");
} finally { await db.$disconnect(); }
