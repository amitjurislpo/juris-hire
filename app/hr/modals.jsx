"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QUESTION_TYPES, TYPE_NAME, driveOf, driveOpen, localDay, toCsv } from "../lib/domain";
import { EMPLOYEE_COLUMNS, MAX_FILE_BYTES, MAX_ROWS, validateEmployee } from "../lib/employees";
import { Icon, Modal, ModalHead, downloadCSV } from "../components/ui";
import { usePortal } from "./portal";

export function DriveModal({ drive, onClose }) {
  const { ws, op, toast } = usePortal();
  const router = useRouter();
  const [f, setF] = useState(() => drive ? { name: drive.name, college: drive.college, city: drive.city === "—" ? "" : drive.city, date: drive.date, closes: drive.closes } : { name: "", college: "", city: "", date: localDay(), closes: localDay(7) });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim() || !f.college.trim()) return toast("Add a drive name and college.");
    setBusy(true);
    const r = await op("saveDrive", { ...f, id: drive?.id });
    setBusy(false);
    if (!r) return;
    onClose();
    toast(r.result.message);
    if (!drive) router.push(`/hr/drives/${r.result.id}`);
  }
  return <Modal onClose={onClose}>
    <ModalHead title={drive ? "Edit hiring drive" : "New hiring drive"} onClose={onClose} />
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <label className="field"><span>Drive name</span><input className="input" required maxLength={200} value={f.name} onChange={set("name")} placeholder="e.g. LPO Analyst · Batch 3" /></label>
      <div className="grid2"><label className="field"><span>College</span><input className="input" required maxLength={200} value={f.college} onChange={set("college")} placeholder="College name" /></label><label className="field"><span>City</span><input className="input" maxLength={200} value={f.city} onChange={set("city")} placeholder="City" /></label></div>
      <div className="grid2"><label className="field"><span>Session date</span><input className="input" type="date" required value={f.date} onChange={set("date")} /></label><label className="field"><span>Link closes</span><input className="input" type="date" required value={f.closes} min={drive ? f.date : [f.date, localDay()].sort().at(-1)} onChange={set("closes")} /></label></div>
      {!drive && <p className="muted" style={{ fontSize: 13 }}>Default assessment: {ws.settings.mcq} multiple-choice · {ws.settings.written} written. You can pick specific questions when you add employees. <Link href="/hr/settings" onClick={onClose}>Change rules</Link></p>}
      <div className="modal-f"><button className="btn ghost" type="button" onClick={onClose}>Cancel</button><button className="btn gold" type="submit" disabled={busy}>{drive ? "Save changes" : "Create drive"}</button></div>
    </form>
  </Modal>;
}

/* ---------- question add / edit ---------- */
export function QuestionModal({ question, onClose, onSaved }) {
  const { ws, op, toast } = usePortal();
  const isNew = !question;
  const [q, setQ] = useState(() => question ? { ...question, options: question.options ? [...question.options] : ["", "", "", ""] } : { type: "mcq", cat: "", text: "", options: ["", "", "", ""], correct: 0, active: true });
  const set = (patch) => setQ({ ...q, ...patch });

  async function submit(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!q.text.trim()) return toast("Write the question text.");
    if (q.type === "mcq" && q.options.some((x) => !x.trim())) return toast("Fill in all four options.");
    const r = await op("saveQuestion", { question: q });
    if (r) { toast(r.result.message); onSaved?.(r.result.id); onClose(); }
  }
  async function remove() {
    const r = await op("deleteQuestion", { id: q.id });
    if (r) { toast(r.result); onClose(); }
  }
  return <Modal onClose={onClose} className="wide">
    <ModalHead title={isNew ? "Add question" : "Edit question"} onClose={onClose} />
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="grid2">
        <label className="field"><span>Type</span><select className="select" value={q.type} disabled={!isNew} onChange={(e) => set({ type: e.target.value })}>{QUESTION_TYPES.map((t) => <option key={t} value={t}>{TYPE_NAME[t]}</option>)}</select></label>
        <label className="field"><span>Category</span><input className="input" value={q.cat} onChange={(e) => set({ cat: e.target.value })} placeholder="e.g. Sales judgement" /></label>
      </div>
      <label className="field"><span>Question</span><textarea className="textarea" rows={3} value={q.text} onChange={(e) => set({ text: e.target.value })} placeholder="Write the question…" /></label>
      {q.type === "mcq" ? <div className="field"><span>Options — select the correct one</span>
        {[0, 1, 2, 3].map((k) => <div key={k} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="radio" name="qcorrect" className="check" checked={q.correct === k} onChange={() => set({ correct: k })} aria-label={`Option ${"ABCD"[k]} is correct`} />
          <span className="mono" style={{ width: 16 }}>{"ABCD"[k]}</span>
          <input className="input" value={q.options[k]} onChange={(e) => { const o = [...q.options]; o[k] = e.target.value; set({ options: o }); }} placeholder={`Option ${"ABCD"[k]}`} />
        </div>)}
      </div> : <p className="muted" style={{ fontSize: 13 }}>Free-text answer{ws.settings.wordLimit ? `, up to ${ws.settings.wordLimit} words` : ""}. Reviewed manually.</p>}
      <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, color: "var(--soft)" }}><input type="checkbox" className="check" checked={q.active} onChange={(e) => set({ active: e.target.checked })} /> Active — can be drawn into assessments</label>
      <div className="modal-f">{!isNew && <button className="btn danger" type="button" onClick={remove} style={{ marginRight: "auto" }}>Delete</button>}<button className="btn ghost" type="button" onClick={onClose}>Cancel</button><button className="btn gold" type="submit">Save question</button></div>
    </form>
  </Modal>;
}

/* ---------- question picker (used when sending a link) ---------- */
// value: null = draw from assessment rules, or an array of question ids.
export function QuestionPicker({ value, onChange, onAddQuestion }) {
  const { ws, isAdmin } = usePortal();
  const s = ws.settings;
  const pool = ws.questions.filter((q) => q.active || value?.includes(q.id));
  const chosen = new Set(value || []);
  const toggle = (id, on) => { const n = new Set(chosen); on ? n.add(id) : n.delete(id); onChange([...n]); };
  const counts = QUESTION_TYPES.map((t) => pool.filter((q) => q.type === t && chosen.has(q.id)).length);
  return <div className="field" style={{ gap: 12 }}>
    <span>Questions</span>
    <div className="tabs" style={{ alignSelf: "flex-start" }}>
      <button type="button" className={value === null ? "on" : ""} aria-pressed={value === null} onClick={() => onChange(null)}>Use assessment rules</button>
      <button type="button" className={value !== null ? "on" : ""} aria-pressed={value !== null} onClick={() => onChange(value || [])}>Choose questions</button>
    </div>
    {value === null ? <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>Each employee gets {s.mcq} multiple-choice and {s.written} written question{s.written === 1 ? "" : "s"}, drawn {s.selection === "fixed" ? "in fixed order" : "at random"} from the active questions in the bank.</p>
      : <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 340, overflowY: "auto", padding: "14px 16px", borderRadius: 12, border: "1px solid var(--line2)", background: "var(--ink2)" }}>
        {QUESTION_TYPES.map((t, k) => {
          const list = pool.filter((q) => q.type === t);
          const all = list.length > 0 && list.every((q) => chosen.has(q.id));
          return <div key={t} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span className="eyebrow">{TYPE_NAME[t]} · {counts[k]} selected</span>
              {list.length > 0 && <button type="button" className="btn sm ghost" onClick={() => onChange(all ? [...chosen].filter((id) => !list.some((q) => q.id === id)) : [...new Set([...chosen, ...list.map((q) => q.id)])])}>{all ? "Clear" : "Select all"}</button>}
            </div>
            {list.length ? list.map((q) => <label key={q.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: "var(--soft)", lineHeight: 1.45, cursor: "pointer" }}>
              <input type="checkbox" className="check" style={{ marginTop: 2, flex: "none" }} checked={chosen.has(q.id)} onChange={(e) => toggle(q.id, e.target.checked)} />
              <span>{q.text} <small className="muted">· {q.cat}{!q.active ? " · inactive" : ""}</small></span>
            </label>) : <span className="muted" style={{ fontSize: 13 }}>No active {TYPE_NAME[t].toLowerCase()} questions.</span>}
          </div>;
        })}
      </div>}
    {value !== null && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
      <span className={value.length ? "muted" : ""} style={value.length ? undefined : { color: "var(--warn)" }}>{value.length ? `${value.length} question${value.length > 1 ? "s" : ""}: ${counts[0]} multiple-choice · ${counts[1]} written` : "Select at least one question."}</span>
      {isAdmin && onAddQuestion && <button type="button" className="btn sm" onClick={onAddQuestion}><Icon name="plus" size={14} /> New question</button>}
    </div>}
  </div>;
}

/* ---------- add employees ---------- */
// Adds employees, then offers to choose questions and send the link straight away (or later, from Candidates).
export function AddEmployeesModal({ driveId, onClose }) {
  const { ws, op, toast, setWorkspace } = usePortal();
  const open = ws.drives.filter(driveOpen);
  const [did, setDid] = useState(open.some((d) => d.id === driveId) ? driveId : open[0]?.id || "");
  const [mode, setMode] = useState("excel");
  const [one, setOne] = useState({ name: "", email: "", phone: "", college: "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [sendIds, setSendIds] = useState(null);

  function pickFile(e) {
    const f = e.target.files?.[0] || null;
    if (f && (!/\.xlsx$/i.test(f.name) || f.size > MAX_FILE_BYTES)) {
      toast(!/\.xlsx$/i.test(f.name) ? "Only .xlsx files made from the sample sheet are accepted." : "The file is larger than 2 MB.");
      e.target.value = "";
      return setFile(null);
    }
    setFile(f);
  }

  async function submit(e) {
    e.preventDefault();
    if (!did) return toast("Choose a hiring drive.");
    if (mode === "one") {
      const { errors } = validateEmployee(one);
      if (errors.length) return toast(`${errors.join(". ")}.`);
      setBusy(true);
      const r = await op("addEmployee", { driveId: did, employee: one });
      setBusy(false);
      if (!r) return;
      if (r.result.rejected.length) return toast(`${r.result.rejected[0].errors.join(". ")}.`);
      toast(`${one.name.trim()} added.`);
      return setSendIds(r.result.created);
    }
    if (!file) return toast("Choose the filled-in sample sheet (.xlsx).");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("driveId", did);
      const res = await fetch("/api/employees/import", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return toast(body.error || "The file couldn’t be imported.");
      setWorkspace(body.workspace);
      setReport(body.result);
    } catch { toast("The file couldn’t be uploaded. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  if (sendIds) return <SendLinksModal ids={sendIds} onClose={onClose} later />;

  if (!open.length) return <Modal onClose={onClose}><ModalHead title="Add employees" onClose={onClose} /><p className="muted">There’s no open hiring drive. Create one, or extend a drive’s closing date, before adding employees.</p></Modal>;

  if (report) {
    const added = report.created.length, skipped = report.rejected.length;
    return <Modal onClose={onClose} className="wide">
      <ModalHead title="Import finished" onClose={onClose} />
      <div className="kv" style={{ maxWidth: 360 }}><span>Rows in file</span><b>{report.total}</b><span>Added</span><b style={{ color: "var(--ok)" }}>{added}</b><span>Not added</span><b style={{ color: skipped ? "var(--danger)" : undefined }}>{skipped}</b></div>
      {skipped > 0 ? <>
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>These rows had problems and were <b>not saved</b>. Fix them in your sheet and upload just those rows again.</p>
        <div className="tbl-wrap" style={{ border: "1px solid var(--line)", borderRadius: 12, maxHeight: 320, overflowY: "auto" }}>
          <table className="tbl" style={{ minWidth: 640 }}><thead><tr><th>Row</th><th>Full name</th><th>Email</th><th>Problem</th></tr></thead><tbody>
            {report.rejected.map((r) => <tr key={r.row}><td className="mono">{r.row}</td><td>{r.name || <span className="muted">—</span>}</td><td style={{ wordBreak: "break-all" }}>{r.email || <span className="muted">—</span>}</td><td style={{ color: "var(--danger)" }}>{r.errors.join("; ")}</td></tr>)}
          </tbody></table>
        </div>
        <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => downloadCSV("employees-not-added.csv", toCsv([["Row", ...EMPLOYEE_COLUMNS.map((c) => c.header), "Problem"], ...report.rejected.map((r) => [r.row, r.name, r.email, r.phone, r.college, r.errors.join("; ")])]))}><Icon name="download" size={14} /> Download this list</button>
      </> : <p style={{ fontSize: 14 }}>Every row was added.</p>}
      {added > 0 && <p className="muted" style={{ fontSize: 13 }}>Next: choose the questions and email the assessment link to the {added} new employee{added > 1 ? "s" : ""} now, or do it later from Candidates.</p>}
      <div className="modal-f">{added > 0 ? <><button className="btn ghost" type="button" onClick={onClose}>Send later</button><button className="btn gold" type="button" onClick={() => setSendIds(report.created)}><Icon name="send" size={16} /> Choose questions &amp; send link</button></> : <button className="btn gold" type="button" onClick={onClose}>Done</button>}</div>
    </Modal>;
  }

  return <Modal onClose={onClose} className="wide">
    <ModalHead title="Add employees" onClose={onClose} />
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <label className="field"><span>Hiring drive</span><select className="select" value={did} onChange={(e) => setDid(e.target.value)}>{open.map((d) => <option key={d.id} value={d.id}>{d.college} · {d.name}</option>)}</select></label>
      <div className="tabs" style={{ alignSelf: "flex-start" }}>
        <button type="button" className={mode === "excel" ? "on" : ""} aria-pressed={mode === "excel"} onClick={() => setMode("excel")}>Upload Excel sheet</button>
        <button type="button" className={mode === "one" ? "on" : ""} aria-pressed={mode === "one"} onClick={() => setMode("one")}>One employee</button>
      </div>
      {mode === "one" ? <div className="grid2">
        <label className="field"><span>Full name</span><input className="input" maxLength={120} value={one.name} onChange={(e) => setOne({ ...one, name: e.target.value })} placeholder="Asha Pillai" /></label>
        <label className="field"><span>Email</span><input className="input" type="email" maxLength={254} value={one.email} onChange={(e) => setOne({ ...one, email: e.target.value })} placeholder="asha.pillai@example.com" /></label>
        <label className="field"><span>Phone (optional)</span><input className="input" maxLength={25} value={one.phone} onChange={(e) => setOne({ ...one, phone: e.target.value })} placeholder="+91 98765 43210" /></label>
        <label className="field"><span>College (optional)</span><input className="input" maxLength={120} value={one.college} onChange={(e) => setOne({ ...one, college: e.target.value })} placeholder="College name" /></label>
      </div> : <>
        <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--paper-1)", boxShadow: "none" }}>
          <b>1. Download the sample sheet</b>
          <span className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>Fill in one employee per row: {EMPLOYEE_COLUMNS.map((c) => `${c.header}${c.required ? " (required)" : ""}`).join(", ")}. Keep the header row as it is. Up to {MAX_ROWS} employees per file.</span>
          <a className="btn sm" style={{ alignSelf: "flex-start" }} href="/api/employees/template" download><Icon name="download" size={14} /> Sample sheet (.xlsx)</a>
        </div>
        <div className="card pad" style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--paper-1)", boxShadow: "none" }}>
          <b>2. Upload the filled-in sheet</b>
          <input className="input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={pickFile} style={{ paddingTop: 9 }} />
          <span className="muted" style={{ fontSize: 13 }}>Only .xlsx files from the sample sheet are accepted (max 2 MB). Rows with problems aren’t saved — you’ll get a list of them after the upload.</span>
        </div>
      </>}
      <div className="modal-f"><button className="btn ghost" type="button" onClick={onClose}>Cancel</button><button className="btn gold" type="submit" disabled={busy || (mode === "excel" && !file)}>{busy ? (mode === "excel" ? "Importing…" : "Adding…") : mode === "excel" ? "Import employees" : "Add employee"}</button></div>
    </form>
  </Modal>;
}

/* ---------- send assessment links ---------- */
// Sends to one or many employees at once, optionally fixing the questions for those who haven't started.
// later: shown right after adding employees, so cancelling means "send later" rather than "cancel".
export function SendLinksModal({ ids, initialQuestionIds = null, onClose, onSent, later = false }) {
  const { ws, op, toast, isAdmin } = usePortal();
  const [questionIds, setQuestionIds] = useState(initialQuestionIds);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [busy, setBusy] = useState(false);
  const chosen = ids.map((id) => ws.candidates.find((c) => c.id === id)).filter(Boolean);
  const sendable = chosen.filter((c) => ["invited", "started"].includes(c.status) && driveOpen(driveOf(ws, c)));
  const fresh = sendable.filter((c) => c.status === "invited");
  const skipped = chosen.length - sendable.length;
  const pickQuestions = isAdmin && fresh.length > 0;

  async function send() {
    if (!sendable.length) return toast("None of the selected employees can receive a link.");
    if (pickQuestions && questionIds !== null && !questionIds.length) return toast("Select at least one question.");
    setBusy(true);
    const r = await op("sendInvites", { ids: sendable.map((c) => c.id), ...(pickQuestions ? { questionIds } : {}) });
    setBusy(false);
    if (!r) return;
    if (!r.invites.error) toast(`Assessment link sent to ${r.invites.sent} employee${r.invites.sent !== 1 ? "s" : ""}.`);
    onSent?.();
    onClose();
  }

  return <>
    <Modal onClose={onClose} locked={addingQuestion} className="wide">
      <ModalHead title={later ? "Send the assessment link now?" : "Send assessment link"} onClose={onClose} />
      <div className="kv" style={{ maxWidth: 420 }}>
        <span>Selected</span><b>{chosen.length}</b>
        <span>Will receive the link</span><b>{sendable.length}</b>
        {skipped > 0 && <><span>Skipped</span><b style={{ color: "var(--warn)" }}>{skipped}</b></>}
      </div>
      {skipped > 0 && <p className="muted" style={{ fontSize: 13 }}>Skipped employees have already submitted, were moved on by HR, or belong to a closed drive.</p>}
      {pickQuestions && <QuestionPicker value={questionIds} onChange={setQuestionIds} onAddQuestion={() => setAddingQuestion(true)} />}
      {sendable.length > fresh.length && <p className="muted" style={{ fontSize: 13 }}>{sendable.length - fresh.length} already started: they keep their current questions and get a reminder link.</p>}
      <div className="modal-f"><button className="btn ghost" type="button" onClick={onClose}>{later ? "Send later" : "Cancel"}</button><button className="btn gold" type="button" disabled={busy || !sendable.length} onClick={send}><Icon name="send" size={16} /> {busy ? "Sending…" : `Send to ${sendable.length}`}</button></div>
    </Modal>
    {addingQuestion && <QuestionModal question={null} onClose={() => setAddingQuestion(false)} onSaved={(id) => setQuestionIds((v) => [...(v || []), id])} />}
  </>;
}
