CREATE TABLE IF NOT EXISTS team (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('manager','driver'))
);
