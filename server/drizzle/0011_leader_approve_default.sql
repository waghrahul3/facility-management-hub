ALTER TABLE "work_entries" ALTER COLUMN "leader_confirmed_at" SET DEFAULT now();--> statement-breakpoint
UPDATE "work_entries" SET "leader_confirmed_at" = now() WHERE "leader_confirmed_at" IS NULL;
