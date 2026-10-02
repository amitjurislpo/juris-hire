"use client";

import { useState } from "react";
import { Icon } from "../../../components/ui";
import { AdminOnly, UI, usePortal } from "../../portal";
import { QuestionModal } from "../../modals";

const TN = { mcq: "MCQ", written: "Written", video: "Video" };

function QuestionBank() {
  const { ws, op } = usePortal();
  const [f, setFState] = useState(UI.qb);
  const [editing, setEditing] = useState(undefined);
  const setF = (patch) => { const next = { ...f, ...patch }; UI.qb = next; setFState(next); };
  const list = ws.questions.filter((q) => (f.type === "all" || q.type === f.type) && (!f.q || `${q.text} ${q.cat}`.toLowerCase().includes(f.q.toLowerCase())));
  const cnt = (t) => ws.questions.filter((q) => q.type === t && q.active).length;

  return <>
    <header className="ph"><div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span className="eyebrow">{ws.questions.length} questions · {ws.questions.filter((q) => q.active).length} active</span><h1>Question bank</h1></div>
      <div className="acts"><button className="btn gold" type="button" onClick={() => setEditing(null)}><Icon name="plus" size={16} /> Add question</button></div></header>
    <section className="kpis">{["mcq", "written", "video"].map((t) => {
      const need = ws.settings[t], have = cnt(t), ok = have >= need;
      return <div key={t} className={`card kpi ${ok ? "" : "hi"}`}><span>{TN[t]} · active</span><b className="n">{have}</b><span>{ok ? `${need} drawn per candidate${ws.settings.selection !== "fixed" && have > need ? " · randomised" : ""}` : `Need at least ${need} — add more`}</span></div>;
    })}</section>
    <section className="card" style={{ overflow: "hidden" }}>
      <div className="toolbar">
        <div className="tabs" role="tablist">{[["all", "All"], ["mcq", "MCQ"], ["written", "Written"], ["video", "Video"]].map((t) => <button key={t[0]} type="button" role="tab" aria-selected={f.type === t[0]} className={f.type === t[0] ? "on" : ""} onClick={() => setF({ type: t[0] })}>{t[1]}</button>)}</div>
        <label className="search"><Icon name="search" size={16} stroke={2} /><span className="sr">Search questions</span><input type="search" placeholder="Search questions…" value={f.q} onChange={(e) => setF({ q: e.target.value })} /></label>
      </div>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Question</th><th>Type</th><th>Category</th><th>Answer key</th><th>Active</th><th></th></tr></thead><tbody>
        {list.length ? list.map((q) => <tr key={q.id}>
          <td style={{ maxWidth: 520 }}><b style={{ fontWeight: 600, lineHeight: 1.5 }}>{q.text}</b></td><td><span className="pill">{TN[q.type]}</span></td><td className="muted">{q.cat}</td>
          <td className="muted" style={{ maxWidth: 220 }}>{q.type === "mcq" ? q.options[q.correct] : q.type === "written" ? "Manual review" : `Manual review · ${ws.settings.videoMax}s`}</td>
          <td><button type="button" className="switch" role="switch" aria-checked={q.active} aria-label="Active" onClick={() => op("toggleQuestion", { id: q.id })} /></td>
          <td style={{ textAlign: "right" }}><button className="btn sm" type="button" onClick={() => setEditing(q)}><Icon name="edit" size={14} /> Edit</button></td>
        </tr>) : <tr><td colSpan={6} className="empty">No questions match.</td></tr>}
      </tbody></table></div>
    </section>
    {editing !== undefined && <QuestionModal question={editing} onClose={() => setEditing(undefined)} />}
  </>;
}

export default function Page() { return <AdminOnly><QuestionBank /></AdminOnly>; }
