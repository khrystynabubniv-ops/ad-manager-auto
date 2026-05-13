import { closePool, runMigrations } from "../src/services/db.js";
import { logger } from "../src/logger.js";

try {
  await runMigrations();
  logger.info("Migrations completed");
} finally {
  await closePool();
}
