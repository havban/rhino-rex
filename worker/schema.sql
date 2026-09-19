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

-- Multiplayer signalling. Rows are short-lived: peers swap SDP through here
-- and then talk directly over WebRTC.
CREATE TABLE IF NOT EXISTS rooms (
  code       TEXT PRIMARY KEY,
  host       TEXT NOT NULL,
  name       TEXT,
  created_at INTEGER NOT NULL,
  seen_at    INTEGER NOT NULL,
  closed     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS peers (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL,
  name       TEXT,
  offer      TEXT,
  answer     TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS peers_room ON peers (code, created_at);
CREATE INDEX IF NOT EXISTS rooms_age  ON rooms (seen_at);
