CREATE TABLE works (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  author TEXT NOT NULL,
  work TEXT NOT NULL,
  preview TEXT NOT NULL,
  rate_key TEXT NOT NULL,
  submitted_at INTEGER NOT NULL,
  published_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','public','hidden'))
);
--> statement-breakpoint
CREATE INDEX works_public ON works(status, published_at DESC, id DESC);
--> statement-breakpoint
CREATE INDEX works_review ON works(status, submitted_at DESC);
--> statement-breakpoint
CREATE INDEX works_rate ON works(rate_key, submitted_at);
