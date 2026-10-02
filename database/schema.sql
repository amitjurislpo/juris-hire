-- JurisHire schema. The app also creates these tables automatically on first start.
CREATE TABLE IF NOT EXISTS app_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hr_users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL,
  status text NOT NULL,
  password_hash text,
  last_active timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS drives (
  id text PRIMARY KEY,
  name text NOT NULL,
  college text NOT NULL,
  city text,
  session_date date,
  closes date,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS questions (
  id text PRIMARY KEY,
  position integer NOT NULL,
  type text NOT NULL,
  category text NOT NULL,
  text text NOT NULL,
  options jsonb,
  correct integer,
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS candidates (
  id text PRIMARY KEY,
  drive_id text REFERENCES drives(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  college text,
  status text NOT NULL,
  token text NOT NULL UNIQUE,
  invited_at timestamptz,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS candidates_drive_idx ON candidates (drive_id);
CREATE TABLE IF NOT EXISTS events (
  id text PRIMARY KEY,
  candidate_id text NOT NULL,
  at timestamptz NOT NULL,
  type text NOT NULL,
  text text NOT NULL,
  warn boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS events_candidate_idx ON events (candidate_id, at);
