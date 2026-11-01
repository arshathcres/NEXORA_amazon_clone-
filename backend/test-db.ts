import "dotenv/config";
import prisma from "./src/config/database";

async function testConnection() {
  try {
    const result = await prisma.$queryRaw`
      SELECT current_database() AS database,
             current_user AS username
    `;

    console.log("NEXORA database connection successful!");
    console.log(result);
  } catch (error) {
    console.error("Database connection failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();