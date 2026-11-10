CREATE TABLE games (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  deck TEXT NOT NULL,
  started INTEGER NOT NULL,
  step INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  last_answer INTEGER,
  finished INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX ranking ON games (finished, score DESC, started, id);
