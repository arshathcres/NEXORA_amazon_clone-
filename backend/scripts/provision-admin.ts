import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import prisma from "../src/config/database";

async function main() {
  const emailArgument = process.argv[2]?.trim().toLowerCase();
  if (!emailArgument || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailArgument)) {
    console.error("Usage: npm run provision-admin -- <existing-customer-email>");
    process.exitCode = 1;
    return;
  }

  try {
    const profile = await prisma.profiles.findUnique({
      where: { email: emailArgument },
      select: { id: true, email: true, full_name: true, role: true },
    });

    if (!profile) {
      console.error("No account exists with that email. Register the account as a customer first.");
      process.exitCode = 1;
      return;
    }
    if (profile.role === "ADMIN") {
      console.log("This account is already an administrator; no change made.");
      return;
    }
    if (profile.role !== "CUSTOMER") {
      console.error(`Refusing to promote unexpected current role: ${profile.role}`);
      process.exitCode = 1;
      return;
    }

    const readline = createInterface({ input, output });
    try {
      const confirmation = await readline.question(
        `Promote ${profile.full_name} <${profile.email}> to ADMIN? Type PROMOTE to confirm: `,
      );
      if (confirmation !== "PROMOTE") {
        console.log("Cancelled; no changes made.");
        return;
      }
    } finally {
      readline.close();
    }

    await prisma.profiles.update({ where: { id: profile.id }, data: { role: "ADMIN" } });
    console.log(`Administrator access granted to ${profile.email}. The account must log in again for changes to take effect.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Admin provisioning failed:", error);
  process.exitCode = 1;
});
