import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { AddError, addEmployees } from "../../../lib/add-employees";
import { currentUser, forbidden, unauthorized } from "../../../lib/auth";
import { EMPLOYEE_COLUMNS, MAX_FILE_BYTES, MAX_ROWS, SHEET_NAME } from "../../../lib/employees";
import { publicWorkspace } from "../../../lib/password";
import { getWorkspace, mutateWorkspace } from "../../../lib/workspace-store";

export const runtime = "nodejs";

const XLSX_TYPES = new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream", ""]);
const bad = (error, status = 400) => NextResponse.json({ error }, { status });
const norm = (h) => String(h ?? "").toLowerCase().replace(/[^a-z]/g, "");

// Excel cells can hold formulas, rich text, hyperlinks or numbers; reduce each to plain text.
function cellText(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if ("result" in value) return cellText(value.result);
    if ("richText" in value) return value.richText.map((p) => p.text).join("");
    if ("text" in value) return cellText(value.text);
    if ("error" in value) return "";
    return "";
  }
  return String(value).trim();
}

async function readRows(file) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(Buffer.from(await file.arrayBuffer())); }
  catch { throw new AddError("This file couldn’t be read as an Excel workbook. Download the sample sheet, fill it in and save it as .xlsx."); }

  const sheet = wb.getWorksheet(SHEET_NAME) || wb.worksheets[0];
  if (!sheet) throw new AddError("The workbook has no sheets.");

  // The header row must match the sample sheet exactly (case and spacing ignored).
  const header = EMPLOYEE_COLUMNS.map((_, i) => norm(cellText(sheet.getRow(1).getCell(i + 1).value)));
  const expected = EMPLOYEE_COLUMNS.map((c) => norm(c.header));
  if (header.join("|") !== expected.join("|")) {
    throw new AddError(`The columns don’t match the sample sheet. Row 1 must be: ${EMPLOYEE_COLUMNS.map((c) => c.header).join(", ")}.`);
  }
  const extra = [];
  sheet.getRow(1).eachCell((cell, col) => { if (col > EMPLOYEE_COLUMNS.length && cellText(cell.value)) extra.push(cellText(cell.value)); });
  if (extra.length) throw new AddError(`Remove the extra column${extra.length > 1 ? "s" : ""} (${extra.join(", ")}). Only the sample sheet’s columns are allowed.`);

  const rows = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const values = EMPLOYEE_COLUMNS.map((_, i) => cellText(sheet.getRow(r).getCell(i + 1).value));
    if (values.every((v) => !v)) continue; // blank rows are ignored
    if (rows.length === MAX_ROWS) throw new AddError(`The file has more than ${MAX_ROWS} employees. Split it into smaller files.`);
    rows.push({ row: r, ...Object.fromEntries(EMPLOYEE_COLUMNS.map((c, i) => [c.key, values[i]])) });
  }
  if (!rows.length) throw new AddError("The sheet has no employees. Add them from row 2 onwards.");
  return rows;
}

export async function POST(request) {
  try {
    const me = await currentUser();
    if (!me) return unauthorized();
    if (me.role !== "HR Admin") return forbidden();

    let form;
    try { form = await request.formData(); } catch { return bad("Upload an Excel file (.xlsx)."); }
    const file = form.get("file"), driveId = String(form.get("driveId") || "");
    if (!file || typeof file === "string") return bad("Choose an Excel file to upload.");
    if (!/\.xlsx$/i.test(file.name || "") || !XLSX_TYPES.has(file.type)) return bad("Only .xlsx files made from the sample sheet are accepted. CSV, .xls and other formats aren’t supported.");
    if (file.size === 0) return bad("The file is empty.");
    if (file.size > MAX_FILE_BYTES) return bad("The file is larger than 2 MB. Split it into smaller files.");

    const rows = await readRows(file);
    const result = await mutateWorkspace((ws) => addEmployees(ws, me, driveId, rows));
    return NextResponse.json({ workspace: publicWorkspace(await getWorkspace()), result: { ...result, total: rows.length } });
  } catch (error) {
    if (error instanceof AddError) return bad(error.message);
    console.error("Employee import error:", error);
    return bad("Something went wrong while importing. Please try again.", 500);
  }
}
