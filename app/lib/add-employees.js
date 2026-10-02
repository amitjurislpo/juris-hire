// Server-side "add employees": validates every row, saves only the valid ones, and reports the rest.
import { driveOpen, makeId, makeToken } from "./domain";
import { MAX_ROWS, validateEmployees } from "./employees";

export class AddError extends Error {}

// Runs inside mutateWorkspace. Rows carry their spreadsheet row number (or 1 for the single-add form).
export function addEmployees(ws, me, driveId, rows) {
  const d = ws.drives.find((x) => x.id === driveId);
  if (!d) throw new AddError("Choose a hiring drive.");
  if (!driveOpen(d)) throw new AddError("This drive is closed or past its closing date. Choose an open drive.");
  if (!rows.length) throw new AddError("There are no employees to add.");
  if (rows.length > MAX_ROWS) throw new AddError(`Add at most ${MAX_ROWS} employees at a time.`);

  const existing = new Set(ws.candidates.map((c) => c.email.toLowerCase()));
  const { valid, rejected } = validateEmployees(rows, existing);
  const at = new Date().toISOString();
  const created = valid.map((e) => {
    const c = {
      id: makeId("c"), name: e.name, email: e.email, phone: e.phone, college: e.college, driveId: d.id,
      status: "invited", token: makeToken(), invitedAt: at, history: [{ from: null, to: "invited", by: me.name, at }],
      notes: [], ratings: {}, tabs: 0, questionIds: null,
    };
    ws.candidates.push(c);
    return c.id;
  });
  return { created, rejected };
}
