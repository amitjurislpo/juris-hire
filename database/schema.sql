CREATE TABLE IF NOT EXISTS workspace_state (
  id integer PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);