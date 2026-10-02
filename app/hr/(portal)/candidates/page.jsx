"use client";

import { useState } from "react";
import { STATUS, SL, collegeOf, driveOf, mcqScore, toCsv } from "../../../lib/domain";
import { Icon, downloadCSV } from "../../../components/ui";
import { CandHead, CandRow, UI, usePortal } from "../../portal";
import { AddEmployeesModal } from "../../modals";

export default function Candidates() {
  const { ws, isAdmin, op, toast } = usePortal();
  const [f, setFState] = useState(UI.cand);
  const [sel, setSel] = useState(() => new Set());
  const [importing, setImporting] = useState(false);
  const setF = (patch) => { const next = { ...f, ...patch }; UI.cand = next; setFState(next); };

  const list = ws.candidates.filter((c) => {
    if (f.q && !`${c.name} ${c.email} ${collegeOf(ws, c)}`.toLowerCase().includes(f.q.toLowerCase())) return false;
    if (f.drive && c.driveId !== f.drive) return false;
    if (f.status && c.status !== f.status) return false;
    if (f.flagged && !c.tabs) return false;
    return true;
  }).sort((a, b) => new Date(b.submittedAt || b.startedAt || b.invitedAt || 0) - new Date(a.submittedAt || a.startedAt || a.invitedAt || 0));
  const selected = [...sel].filter((id) => ws.candidates.some((c) => c.id === id));
  const toggle = (id, on) => setSel((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });

  function exportCsv() {
    downloadCSV("candidates.csv", toCsv([["Name", "Email", "Phone", "College", "Drive", "Status", "MCQ", "Tab switches", "Submitted", "Assessment link"],
      ...list.map((c) => [c.name, c.email, c.phone, collegeOf(ws, c), driveOf(ws, c).name, SL[c.status], c.mcq ? `${mcqScore(ws, c)}/${c.mcq.length}` : "", c.tabs || 0, c.submittedAt || "", `${location.origin}/assessment/${c.token}`])]));
    toast("Downloaded candidates.csv");
  }
  async function bulkStatus(to) {
    if (!to) return;
    if (await op("setStatus", { ids: selected, to })) { toast(`${selected.length} candidate${selected.length > 1 ? "s" : ""} moved to ${SL[to]}.`); setSel(new Set()); }
  }
  async function bulkInvite() {
    const r = await op("sendInvites", { ids: selected });
    if (r?.invites) {
      const skipped = selected.length - r.invites.attempted;
      if (!r.invites.error) toast(`Assessment link sent to ${r.invites.sent} employee${r.invites.sent !== 1 ? "s" : ""}.${skipped ? ` ${skipped} skipped — already submitted or closed.` : ""}`);
      setSel(new Set());
    }
  }

  return <>
    <header className="ph"><div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span className="eyebrow">{ws.candidates.length} employees</span><h1>Candidates</h1></div>
      <div className="acts">{isAdmin && <button className="btn" type="button" onClick={exportCsv}><Icon name="download" size={16} /> Export CSV</button>}{isAdmin && <button className="btn gold" type="button" onClick={() => setImporting(true)}><Icon name="plus" size={16} /> Add employees</button>}</div></header>
    <section className="card" style={{ overflow: "hidden" }}>
      <div className="toolbar">
        <label className="search"><Icon name="search" size={16} stroke={2} /><span className="sr">Search</span><input type="search" placeholder="Search name, email, college…" value={f.q} onChange={(e) => setF({ q: e.target.value })} /></label>
        <label className="sr" htmlFor="cdrive">Drive</label><select className="select" id="cdrive" value={f.drive} onChange={(e) => setF({ drive: e.target.value })}><option value="">All drives</option>{ws.drives.map((d) => <option key={d.id} value={d.id}>{d.college} · {d.name}</option>)}</select>
        <label className="sr" htmlFor="cstatus">Status</label><select className="select" id="cstatus" value={f.status} onChange={(e) => setF({ status: e.target.value })}><option value="">All statuses</option>{STATUS.map((s) => <option key={s[0]} value={s[0]}>{s[1]}</option>)}</select>
        <button type="button" className={`chip ${f.flagged ? "on" : ""}`} aria-pressed={f.flagged} onClick={() => setF({ flagged: !f.flagged })}><Icon name="warn" size={14} stroke={2} />&nbsp;Flagged only</button>
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 13 }}>{list.length} shown</span>
      </div>
      {selected.length > 0 && <div className="toolbar" style={{ background: "var(--goldbg)", borderTop: "1px solid var(--goldline)", padding: "12px 26px" }}>
        <b style={{ fontSize: 14, color: "var(--gold2)" }}>{selected.length} selected</b><span style={{ flex: 1 }} />
        <button className="btn sm" type="button" onClick={bulkInvite}><Icon name="send" size={14} /> Resend invitation</button>
        <label className="sr" htmlFor="bulkstatus">Set status</label>
        <select className="select" id="bulkstatus" value="" onChange={(e) => bulkStatus(e.target.value)} style={{ minHeight: 36, minWidth: 180 }}><option value="">Set status…</option>{STATUS.filter((s) => !["started", "terminated"].includes(s[0])).map((s) => <option key={s[0]} value={s[0]}>{s[1]}</option>)}</select>
        <button className="btn sm ghost" type="button" onClick={() => setSel(new Set())}>Clear</button>
      </div>}
      <div className="tbl-wrap"><table className="tbl">
        <CandHead check allChecked={list.length > 0 && list.every((c) => sel.has(c.id))} onAll={(on) => setSel((s) => { const n = new Set(s); list.forEach((c) => (on ? n.add(c.id) : n.delete(c.id))); return n; })} />
        <tbody>{list.length ? list.map((c) => <CandRow key={c.id} c={c} check checked={sel.has(c.id)} onCheck={(on) => toggle(c.id, on)} />) : <tr><td colSpan={8} className="empty">No candidates match these filters.</td></tr>}</tbody>
      </table></div>
    </section>
    {importing && <AddEmployeesModal driveId={f.drive} onClose={() => setImporting(false)} />}
  </>;
}
