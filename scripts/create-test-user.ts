import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const email = process.env.TEST_USER_EMAIL ?? "test@gmail.com";
const displayName = process.env.TEST_USER_NAME ?? "Test User";
const timezone = process.env.TEST_USER_TIMEZONE ?? "Asia/Kolkata";

async function main() {
  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: { displayName, timezone },
      create: { email, displayName, timezone },
    });

    console.log("Test user ready:");
    console.log(user);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
