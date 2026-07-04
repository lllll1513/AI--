ALTER TABLE shots ADD COLUMN include_in_final INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE shots ADD COLUMN production_status TEXT NOT NULL DEFAULT 'unchecked';
--> statement-breakpoint
ALTER TABLE shots ADD COLUMN quality_issues TEXT NOT NULL DEFAULT '[]';
