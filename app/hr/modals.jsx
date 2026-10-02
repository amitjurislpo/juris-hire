"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TYPE_ORDER, parseEmployeeRows } from "../lib/domain";
import { Icon, Modal, ModalHead } from "../components/ui";
import { usePortal } from "./portal";

const isoDay = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
export const TYPE_NAME = { mcq: "Multiple choice", written: "Written", video: "Video" };

export function NewDriveModal({ onClose }) {
  const { ws, op, toast } = usePortal();
  const router = useRouter();
  const [f, setF] = useState({ name: "", college: "", city: "", date: isoDay(), closes: isoDay(7) });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim() || !f.college.trim()) return toast("Add a drive name and college.");
    const r = await op("createDrive", f);
    if (!r) return;
    onClose();
    toast(`Drive “${f.name.trim()}” created. Add employees to send invitations.`);
    router.push(`/hr/drives/${r.result}`);
  }
  return <Modal onClose={onClose}>
    <ModalHead title="New hiring drive" onClose={onClose} />
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <label className="field"><span>Drive name</span><input className="input" required value={f.name} onChange={set("name")} placeholder="e.g. Sales Associate · Batch 3" /></label>
      <div className="grid2"><label className="field"><span>College</span><input className="input" required value={f.college} onChange={set("college")} placeholder="College name" /></label><label className="field"><span>City</span><input className="input" value={f.city} onChange={set("city")} placeholder="City" /></label></div>
      <div className="grid2"><label className="field"><span>Session date</span><input className="input" type="date" required value={f.date} onChange={set("date")} /></label><label className="field"><span>Link closes</span><input className="input" type="date" required value={f.closes} min={f.date} onChange={set("closes")} /></label></div>
      <p className="muted" style={{ fontSize: 13 }}>Default assessment: {ws.settings.mcq} MCQ · {ws.settings.written} written · {ws.settings.video} video. You can pick specific questions when you add employees. <Link href="/hr/settings" onClick={onClose}>Change rules</Link></p>
      <div className="modal-f"><button className="btn ghost" type="button" onClick={onClose}>Cancel</button><button className="btn gold" type="submit">Create drive</button></div>
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
        <label className="field"><span>Type</span><select className="select" value={q.type} disabled={!isNew} onChange={(e) => set({ type: e.target.value })}><option value="mcq">Multiple choice</option><option value="written">Written</option><option value="video">Video</option></select></label>
        <label className="field"><span>Category</span><input className="input" value={q.cat} onChange={(e) => set({ cat: e.target.value })} placeholder="e.g. Sales judgement" /></label>
      </div>
      <label className="field"><span>Question</span><textarea className="textarea" rows={3} value={q.text} onChange={(e) => set({ text: e.target.value })} placeholder="Write the question…" /></label>
      {q.type === "mcq" ? <div className="field"><span>Options — select the correct one</span>
        {[0, 1, 2, 3].map((k) => <div key={k} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="radio" name="qcorrect" className="check" checked={q.correct === k} onChange={() => set({ correct: k })} aria-label={`Option ${"ABCD"[k]} is correct`} />
          <span className="mono" style={{ width: 16 }}>{"ABCD"[k]}</span>
          <input className="input" value={q.options[k]} onChange={(e) => { const o = [...q.options]; o[k] = e.target.value; set({ options: o }); }} placeholder={`Option ${"ABCD"[k]}`} />
        </div>)}
      </div> : <p className="muted" style={{ fontSize: 13 }}>{q.type === "video" ? `Employees record one answer of up to ${ws.settings.videoMax} seconds. Reviewed manually.` : `Free-text answer${ws.settings.wordLimit ? `, up to ${ws.settings.wordLimit} words` : ""}. Reviewed manually.`}</p>}
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
  const counts = TYPE_ORDER.map((t) => pool.filter((q) => q.type === t && chosen.has(q.id)).length);
  return <div className="field" style={{ gap: 12 }}>
    <span>Questions</span>
    <div className="tabs" style={{ alignSelf: "flex-start" }}>
      <button type="button" className={value === null ? "on" : ""} aria-pressed={value === null} onClick={() => onChange(null)}>Use assessment rules</button>
      <button type="button" className={value !== null ? "on" : ""} aria-pressed={value !== null} onClick={() => onChange(value || [])}>Choose questions</button>
    </div>
    {value === null ? <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>Each employee gets {s.mcq} multiple-choice, {s.written} written and {s.video} video question{s.video === 1 ? "" : "s"}, drawn {s.selection === "fixed" ? "in fixed order" : "at random"} from the active questions in the bank.</p>
      : <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: 340, overflowY: "auto", padding: "14px 16px", borderRadius: 12, border: "1px solid var(--line2)", background: "var(--ink2)" }}>
        {TYPE_ORDER.map((t, k) => {
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
      <span className={value.length ? "muted" : ""} style={value.length ? undefined : { color: "var(--warn)" }}>{value.length ? `${value.length} question${value.length > 1 ? "s" : ""}: ${counts[0]} MCQ · ${counts[1]} written · ${counts[2]} video` : "Select at least one question."}</span>
      {isAdmin && onAddQuestion && <button type="button" className="btn sm" onClick={onAddQuestion}><Icon name="plus" size={14} /> New question</button>}
    </div>}
  </div>;
}

/* ---------- add employees ---------- */
export function AddEmployeesModal({ driveId, onClose }) {
  const { ws, op, toast } = usePortal();
  const open = ws.drives.filter((d) => d.status !== "Closed");
  const [did, setDid] = useState(open.some((d) => d.id === driveId) ? driveId : open[0]?.id || "");
  const [mode, setMode] = useState("single");
  const [one, setOne] = useState({ name: "", email: "", phone: "" });
  const [text, setText] = useState("");
  const [questionIds, setQuestionIds] = useState(null);
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const bulk = parseEmployeeRows(text);
  const singleOk = one.name.trim() && /^\S+@\S+\.\S+$/.test(one.email.trim());
  const rows = mode === "single" ? (singleOk ? [{ name: one.name.trim(), email: one.email.trim(), phone: one.phone.trim() }] : []) : bulk.valid;

  async function loadFile(e) {
    const file = e.target.files?.[0];
    if (file) setText(await file.text());
  }
  async function submit(e) {
    e.preventDefault();
    if (!did) return toast("Create a hiring drive first.");
    if (!rows.length) return toast(mode === "single" ? "Add a name and a valid email." : "Nothing to add.");
    if (questionIds !== null && !questionIds.length) return toast("Select at least one question.");
    setBusy(true);
    const r = await op("importCandidates", { driveId: did, rows, send, questionIds });
    setBusy(false);
    if (!r) return;
    const { created, duplicates } = r.result;
    const n = created.length;
    toast(`${n} employee${n > 1 ? "s" : ""} added${duplicates ? ` · ${duplicates} already on file` : ""}.${send && r.invites && !r.invites.error ? ` ${r.invites.sent} assessment link${r.invites.sent !== 1 ? "s" : ""} emailed.` : ""}`);
    onClose();
  }
  if (!open.length) return <Modal onClose={onClose}><ModalHead title="Add employees" onClose={onClose} /><p className="muted">All drives are closed. Create a new hiring drive first.</p></Modal>;
  return <>
    <Modal onClose={onClose} locked={addingQuestion} className="wide">
      <ModalHead title="Add employees" onClose={onClose} />
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <label className="field"><span>Hiring drive</span><select className="select" value={did} onChange={(e) => setDid(e.target.value)}>{open.map((d) => <option key={d.id} value={d.id}>{d.college} · {d.name}</option>)}</select></label>
        <div className="tabs" style={{ alignSelf: "flex-start" }}>
          <button type="button" className={mode === "single" ? "on" : ""} aria-pressed={mode === "single"} onClick={() => setMode("single")}>One employee</button>
          <button type="button" className={mode === "bulk" ? "on" : ""} aria-pressed={mode === "bulk"} onClick={() => setMode("bulk")}>Several (CSV)</button>
        </div>
        {mode === "single" ? <div className="grid2">
          <label className="field"><span>Full name</span><input className="input" value={one.name} onChange={(e) => setOne({ ...one, name: e.target.value })} placeholder="Asha Pillai" /></label>
          <label className="field"><span>Email</span><input className="input" type="email" value={one.email} onChange={(e) => setOne({ ...one, email: e.target.value })} placeholder="asha.p@example.com" /></label>
          <label className="field"><span>Phone (optional)</span><input className="input" value={one.phone} onChange={(e) => setOne({ ...one, phone: e.target.value })} placeholder="+91 98xxxxxxxx" /></label>
        </div> : <>
          <label className="field"><span>Paste CSV — name, email, phone (one employee per line)</span><textarea className="textarea" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Asha Pillai, asha.p@example.com, +91 98xxxxxxxx\nManav Shah, manav.s@example.com, +91 98xxxxxxxx"} /></label>
          <label className="field"><span>…or upload a .csv file</span><input className="input" type="file" accept=".csv,text/csv" onChange={loadFile} style={{ paddingTop: 10 }} /></label>
          <p className="muted" style={{ fontSize: 13 }}>{bulk.valid.length} valid row{bulk.valid.length !== 1 ? "s" : ""}{bulk.skipped > 0 && <> · <span style={{ color: "var(--warn)" }}>{bulk.skipped} skipped (missing name or email)</span></>}.</p>
        </>}
        <QuestionPicker value={questionIds} onChange={setQuestionIds} onAddQuestion={() => setAddingQuestion(true)} />
        <p className="muted" style={{ fontSize: 13 }}>Each employee gets one personal link — no login or account needed. The link opens a quick device check and consent step, then their questions.</p>
        <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, color: "var(--soft)" }}><input type="checkbox" className="check" checked={send} onChange={(e) => setSend(e.target.checked)} /> Email the assessment link now</label>
        <div className="modal-f"><button className="btn ghost" type="button" onClick={onClose}>Cancel</button><button className="btn gold" type="submit" disabled={busy}>{busy ? "Adding…" : send ? "Add & send link" : "Add employees"}</button></div>
      </form>
    </Modal>
    {addingQuestion && <QuestionModal question={null} onClose={() => setAddingQuestion(false)} onSaved={(id) => setQuestionIds((v) => [...(v || []), id])} />}
  </>;
}

/* ---------- change one employee's questions ---------- */
export function EditQuestionsModal({ candidate, onClose }) {
  const { op, toast } = usePortal();
  const [questionIds, setQuestionIds] = useState(candidate.questionIds?.length ? candidate.questionIds : null);
  const [addingQuestion, setAddingQuestion] = useState(false);
  async function save() {
    if (questionIds !== null && !questionIds.length) return toast("Select at least one question.");
    const r = await op("setQuestions", { id: candidate.id, questionIds });
    if (r) { toast(r.result); onClose(); }
  }
  return <>
    <Modal onClose={onClose} locked={addingQuestion} className="wide">
      <ModalHead title={`Questions for ${candidate.name}`} onClose={onClose} />
      <QuestionPicker value={questionIds} onChange={setQuestionIds} onAddQuestion={() => setAddingQuestion(true)} />
      <div className="modal-f"><button className="btn ghost" type="button" onClick={onClose}>Cancel</button><button className="btn gold" type="button" onClick={save}>Save questions</button></div>
    </Modal>
    {addingQuestion && <QuestionModal question={null} onClose={() => setAddingQuestion(false)} onSaved={(id) => setQuestionIds((v) => [...(v || []), id])} />}
  </>;
}
