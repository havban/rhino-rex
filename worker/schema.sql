-- Rhino Rex leaderboard schema (Cloudflare D1)
CREATE TABLE IF NOT EXISTS scores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  score      INTEGER NOT NULL CHECK (score > 0),
  wave       INTEGER NOT NULL CHECK (wave > 0),
  kills      INTEGER NOT NULL CHECK (kills >= 0),
  seconds    INTEGER NOT NULL CHECK (seconds >= 0),
  created_at INTEGER NOT NULL,
  ip_hash    TEXT
);

CREATE INDEX IF NOT EXISTS scores_top ON scores (score DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS scores_ip  ON scores (ip_hash, created_at);
