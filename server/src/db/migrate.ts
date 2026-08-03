import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { db, pool } from "./index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// migrations folder lives at server/drizzle (two levels up from server/dist/db)
const migrationsFolder = path.resolve(__dirname, "../../drizzle");

export async function runMigrations() {
  await migrate(db, { migrationsFolder });
}

// Allow running directly: `tsx server/src/db/migrate.ts`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => {
      console.log("Migrations applied.");
      return pool.end();
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
