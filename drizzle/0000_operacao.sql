CREATE TABLE IF NOT EXISTS records (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('municipal','producer','route','event')),
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE (kind, id)
);
