import ExcelJS from "exceljs";
import { currentUser, unauthorized } from "../../../lib/auth";
import { EMPLOYEE_COLUMNS, MAX_ROWS, SHEET_NAME } from "../../../lib/employees";

export const runtime = "nodejs";

const INK = "FF14171F", PAPER = "FFF7F5F0", BRASS = "FFA8875A";

// The sample sheet HR fills in. Its first sheet and header row are exactly what the importer accepts.
export async function GET() {
  if (!await currentUser()) return unauthorized();
  const wb = new ExcelJS.Workbook();
  wb.creator = "Juris Screening";

  const sheet = wb.addWorksheet(SHEET_NAME, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = EMPLOYEE_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = sheet.getRow(1);
  head.height = 22;
  head.eachCell((cell, i) => {
    cell.font = { bold: true, color: { argb: PAPER } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INK } };
    cell.alignment = { vertical: "middle" };
    cell.note = EMPLOYEE_COLUMNS[i - 1].hint;
  });
  // Keep every cell as text so Excel doesn't turn phone numbers into scientific notation.
  for (let col = 1; col <= EMPLOYEE_COLUMNS.length; col++) sheet.getColumn(col).numFmt = "@";
  for (let r = 2; r <= MAX_ROWS + 1; r++) {
    sheet.getCell(`B${r}`).dataValidation = {
      type: "custom", allowBlank: true, formulae: [`AND(ISNUMBER(SEARCH("@",B${r})),ISNUMBER(SEARCH(".",B${r})))`],
      showErrorMessage: true, errorTitle: "Invalid email", error: "Enter a valid email address, e.g. name@example.com",
    };
  }

  const help = wb.addWorksheet("Instructions");
  help.columns = [{ width: 18 }, { width: 80 }];
  help.addRow(["Juris Screening — add employees"]).font = { bold: true, size: 14, color: { argb: INK } };
  help.addRow([]);
  help.addRow(["How to use", `Enter one employee per row on the “${SHEET_NAME}” sheet, starting on row 2. Don’t rename, reorder or delete the header row.`]);
  help.addRow(["Limit", `Up to ${MAX_ROWS} employees per file. Save as .xlsx before uploading.`]);
  help.addRow(["Invalid rows", "Rows with problems are not added. After the upload you’ll see each skipped row and why, so you can fix and re-upload just those."]);
  help.addRow([]);
  help.addRow(["Column", "Rule"]).font = { bold: true, color: { argb: BRASS } };
  EMPLOYEE_COLUMNS.forEach((c) => help.addRow([c.header, c.hint]));
  help.addRow([]);
  help.addRow(["Example", "Asha Pillai  |  asha.pillai@example.com  |  +91 98765 43210  |  St. Xavier’s College"]);
  help.getColumn(2).alignment = { wrapText: true, vertical: "top" };

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="juris-employees-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
