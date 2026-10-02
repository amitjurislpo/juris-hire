import pg from "pg";
import { DEFAULT_SETTINGS, cleanSettings, makeId } from "./domain";
import { LPO_QUESTIONS } from "./lpo-questions";
import { hashPassword } from "./password";

const { Pool } = pg;

// PostgreSQL is the only store. The app loads the (small) workspace inside a transaction,
// lets the caller mutate it, then writes back only the rows that changed.
let pool;
function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set. Point it at a PostgreSQL database (see .env.example).");
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
  return pool;
}

const SCHEMA = `
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
`;

let schemaReady;
const ensureSchema = () => (schemaReady ||= getPool().query(SCHEMA).catch((e) => { schemaReady = null; throw e; }));

let seq = 0;
const eid = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;
const iso = (v) => (v instanceof Date ? v.toISOString() : v ?? null);
const day = (v) => (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}` : v ?? null);

/* ---------- row <-> object mapping, one entry per table ---------- */
const TABLES = {
  users: {
    table: "hr_users",
    cols: ["id", "email", "name", "role", "status", "password_hash", "last_active"],
    fromRow: (r) => ({ id: r.id, email: r.email, name: r.name, role: r.role, status: r.status, last: iso(r.last_active), ...(r.password_hash ? { passwordHash: r.password_hash } : {}) }),
    toRow: (u) => [u.id, u.email, u.name, u.role, u.status, u.passwordHash || null, u.last || null],
  },
  drives: {
    table: "drives",
    cols: ["id", "name", "college", "city", "session_date", "closes", "status"],
    fromRow: (r) => ({ id: r.id, name: r.name, college: r.college, city: r.city || "—", date: day(r.session_date), closes: day(r.closes), status: r.status }),
    toRow: (d) => [d.id, d.name, d.college, d.city || null, d.date || null, d.closes || null, d.status],
  },
  questions: {
    table: "questions",
    cols: ["id", "position", "type", "category", "text", "options", "correct", "active"],
    fromRow: (r) => ({ id: r.id, type: r.type, cat: r.category, text: r.text, active: r.active, ...(r.type === "mcq" ? { options: r.options || [], correct: r.correct ?? 0 } : {}) }),
    toRow: (q, i) => [q.id, i, q.type, q.cat || "General", q.text, q.options ? JSON.stringify(q.options) : null, q.type === "mcq" ? q.correct ?? 0 : null, q.active !== false],
  },
  candidates: {
    table: "candidates",
    cols: ["id", "drive_id", "name", "email", "phone", "college", "status", "token", "invited_at", "data"],
    fromRow: (r) => ({ ...r.data, id: r.id, driveId: r.drive_id, name: r.name, email: r.email, phone: r.phone || "", college: r.college || "", status: r.status, token: r.token, invitedAt: iso(r.invited_at) }),
    toRow: (c) => {
      const { id, driveId, name, email, phone, college, status, token, invitedAt, ...rest } = c;
      return [id, driveId || null, name, email, phone || null, college || null, status, token, invitedAt || null, JSON.stringify(rest)];
    },
  },
  events: {
    table: "events",
    cols: ["id", "candidate_id", "at", "type", "text", "warn"],
    fromRow: (r) => ({ id: r.id, cid: r.candidate_id, at: iso(r.at), type: r.type, text: r.text, warn: r.warn }),
    toRow: (e) => [e.id, e.cid, e.at, e.type, e.text, !!e.warn],
  },
};

async function load(client) {
  const [settings, users, drives, questions, candidates, events] = await Promise.all([
    client.query("SELECT data FROM app_settings WHERE id = 1"),
    client.query("SELECT * FROM hr_users ORDER BY created_at, id"),
    client.query("SELECT * FROM drives ORDER BY created_at, id"),
    client.query("SELECT * FROM questions ORDER BY position, id"),
    client.query("SELECT * FROM candidates ORDER BY invited_at NULLS LAST, id"),
    client.query("SELECT * FROM events ORDER BY at, id"),
  ]);
  return {
    seeded: settings.rows.length > 0,
    ws: {
      settings: cleanSettings(settings.rows[0]?.data),
      users: users.rows.map(TABLES.users.fromRow),
      drives: drives.rows.map(TABLES.drives.fromRow),
      questions: questions.rows.map(TABLES.questions.fromRow),
      candidates: candidates.rows.map(TABLES.candidates.fromRow),
      events: events.rows.map(TABLES.events.fromRow),
    },
  };
}

async function upsert(client, spec, rows) {
  if (!rows.length) return;
  const n = spec.cols.length;
  const values = rows.flat();
  const tuples = rows.map((_, i) => `(${spec.cols.map((__, j) => `$${i * n + j + 1}`).join(",")})`).join(",");
  const updates = spec.cols.filter((c) => c !== "id").map((c) => `${c} = EXCLUDED.${c}`).join(", ");
  await client.query(`INSERT INTO ${spec.table} (${spec.cols.join(",")}) VALUES ${tuples} ON CONFLICT (id) DO UPDATE SET ${updates}`, values);
}

// Writes only what changed between the loaded snapshot and the mutated workspace.
async function save(client, before, ws) {
  if (JSON.stringify(before.settings) !== JSON.stringify(ws.settings)) {
    await client.query("INSERT INTO app_settings (id, data, updated_at) VALUES (1, $1::jsonb, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()", [JSON.stringify(ws.settings)]);
  }
  // Drives before candidates (foreign key); deletions run in reverse.
  for (const key of ["users", "drives", "questions", "candidates", "events"]) {
    const spec = TABLES[key];
    const old = new Map(before[key].map((o, i) => [o.id, JSON.stringify(spec.toRow(o, i))]));
    const changed = ws[key].map((o, i) => spec.toRow(o, i)).filter((row) => old.get(row[0]) !== JSON.stringify(row));
    for (let i = 0; i < changed.length; i += 500) await upsert(client, spec, changed.slice(i, i + 500));
  }
  for (const key of ["events", "candidates", "questions", "drives", "users"]) {
    const keep = new Set(ws[key].map((o) => o.id));
    const gone = before[key].filter((o) => !keep.has(o.id)).map((o) => o.id);
    if (gone.length) await client.query(`DELETE FROM ${TABLES[key].table} WHERE id = ANY($1)`, [gone]);
  }
}

// First run: settings and the LPO starter question bank. No drives or employees are created.
function seed(ws) {
  ws.settings = { ...DEFAULT_SETTINGS };
  if (!ws.questions.length) ws.questions = LPO_QUESTIONS.map((q) => ({ ...q, options: q.options && [...q.options] }));
}

// HR_ADMIN_EMAIL / HR_ADMIN_PASSWORD guarantee a working admin login, so access can't be locked out.
function ensureAdmin(ws) {
  const email = process.env.HR_ADMIN_EMAIL?.trim().toLowerCase(), password = process.env.HR_ADMIN_PASSWORD;
  if (!email || !password) return;
  const u = ws.users.find((x) => x.email.toLowerCase() === email);
  if (!u) ws.users.push({ id: makeId("u"), name: "Admin", email, role: "HR Admin", status: "Active", last: null, passwordHash: hashPassword(password) });
  else if (!u.passwordHash) { u.passwordHash = hashPassword(password); u.role = "HR Admin"; }
}

export async function getWorkspace() {
  return mutateWorkspace(() => undefined);
}

// fn receives the workspace, mutates it in place and may return a value. Throwing rolls back.
export async function mutateWorkspace(fn) {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // One writer at a time across every app instance.
    await client.query("SELECT pg_advisory_xact_lock(727401)");
    const { seeded, ws } = await load(client);
    const before = structuredClone(ws);
    if (!seeded) { before.settings = null; seed(ws); }
    ensureAdmin(ws);
    const result = await fn(ws);
    await save(client, before, ws);
    await client.query("COMMIT");
    return result === undefined ? ws : result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function logEvent(workspace, cid, type, text, warn = false) {
  workspace.events.push({ id: eid(), cid, at: new Date().toISOString(), type, text, warn: !!warn });
}

// Fast path for authentication: one row, no workspace load.
export async function getUserById(id) {
  if (!id) return null;
  await ensureSchema();
  const { rows } = await getPool().query("SELECT * FROM hr_users WHERE id = $1", [id]);
  return rows[0] ? TABLES.users.fromRow(rows[0]) : null;
}
