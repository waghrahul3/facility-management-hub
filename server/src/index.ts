import { count } from "drizzle-orm";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { db } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { users } from "./db/schema.js";
import { seedDatabase } from "./seed.js";

async function main() {
  console.log("Running database migrations...");
  await runMigrations();
  console.log("Migrations complete.");

  // First boot on an empty database → seed demo data (SEED_DEMO=true, default).
  // Set SEED_DEMO=false in production if you want to manage users yourself.
  if (config.seedDemo) {
    const [userCount] = await db.select({ value: count() }).from(users);
    if ((userCount?.value ?? 0) === 0) {
      console.log("Empty database detected — seeding demo data...");
      await seedDatabase();
    }
  }

  const app = createApp();
  const port = config.port;

  app.listen(port, "0.0.0.0", () => {
    console.log(`Onion Facility Center API listening on http://0.0.0.0:${port}`);
  });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
