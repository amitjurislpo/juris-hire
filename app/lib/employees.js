// Employee intake rules, shared by the single-add form and the Excel import.
import { isEmail } from "./domain";

// The sample sheet and the importer both use exactly these columns, in this order.
export const EMPLOYEE_COLUMNS = [
  { key: "name", header: "Full name", required: true, width: 28, hint: "Required. Letters, spaces, . ' - only. 2–120 characters." },
  { key: "email", header: "Email", required: true, width: 34, hint: "Required. A valid email address; each employee needs a different one." },
  { key: "phone", header: "Phone", required: false, width: 20, hint: "Optional. 7–15 digits; may include + ( ) - and spaces." },
  { key: "college", header: "College", required: false, width: 30, hint: "Optional. Up to 120 characters." },
];
export const SHEET_NAME = "Employees";
export const MAX_ROWS = 1000;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

const NAME = /^\p{L}[\p{L}\p{M} .'’-]*$/u;
const PHONE = /^\+?[\d\s()-]+$/;

const clean = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

// Returns the normalised employee, or the list of problems with it.
export function validateEmployee(input) {
  const e = { name: clean(input.name), email: clean(input.email).toLowerCase(), phone: clean(input.phone), college: clean(input.college) };
  const errors = [];
  if (!e.name) errors.push("Full name is missing");
  else if (e.name.length < 2 || e.name.length > 120) errors.push("Full name must be 2–120 characters");
  else if (!NAME.test(e.name)) errors.push("Full name can only contain letters, spaces, and . ' -");
  if (!e.email) errors.push("Email is missing");
  else if (e.email.length > 254 || !isEmail(e.email)) errors.push("Email isn’t a valid address");
  if (e.phone) {
    const digits = e.phone.replace(/\D/g, "").length;
    if (!PHONE.test(e.phone) || digits < 7 || digits > 15) errors.push("Phone must have 7–15 digits (+ ( ) - and spaces allowed)");
  }
  if (e.college.length > 120) errors.push("College must be 120 characters or fewer");
  return { employee: e, errors };
}

// Validates a whole batch: each row on its own, then duplicates inside the batch and against existing employees.
// rows: [{ row, name, email, phone, college }] → { valid: [...], rejected: [{ row, name, email, phone, college, errors }] }
export function validateEmployees(rows, existingEmails) {
  const valid = [], rejected = [], seen = new Map();
  for (const input of rows) {
    const { employee, errors } = validateEmployee(input);
    if (employee.email && isEmail(employee.email)) {
      if (existingEmails.has(employee.email)) errors.push("An employee with this email already exists");
      else if (seen.has(employee.email)) errors.push(`Same email as row ${seen.get(employee.email)}`);
      else seen.set(employee.email, input.row);
    }
    if (errors.length) rejected.push({ row: input.row, ...employee, errors });
    else valid.push({ row: input.row, ...employee });
  }
  return { valid, rejected };
}
