"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { stats } from "../../../../lib/domain";
import { Icon, fmtDate } from "../../../../components/ui";
import { CandHead, CandRow, driveTone, usePortal } from "../../../portal";
import { AddEmployeesModal } from "../../../modals";

export default function DriveDetail() {
  const { id } = useParams();
  const { ws, isAdmin, op, toast } = usePortal();
  const [importing, setImporting] = useState(false);
  const [sending, setSending] = useState(false);
  const d = ws.drives.find((x) => x.id === id);
  if (!d) return <><Link className="crumb" href="/hr/drives"><Icon name="left" size={16} /> Hiring drives</Link><div className="card pad empty">This drive doesn’t exist.</div></>;
  const l = ws.candidates.filter((c) => c.driveId === d.id), s = stats(ws, l);
  const notStarted = l.filter((c) => c.status === "invited");
  const unsent = notStarted.filter((c) => !c.inviteSentAt);
  const targets = unsent.length ? unsent : notStarted;

  async function invite() {
    if (!targets.length) return toast("Everyone in this drive has already started.");
    setSending(true);
    const r = await op("sendInvites", { ids: targets.map((c) => c.id) });
    setSending(false);
    if (r?.invites && !r.invites.error) toast(`${r.invites.sent} invitation email${r.invites.sent !== 1 ? "s" : ""} sent.`);
  }
  async function close() {
    if (await op("updateDrive", { id: d.id, status: "Closed" })) toast("Drive closed — links no longer accept new attempts.");
  }

  return <>
    <Link className="crumb" href="/hr/drives"><Icon name="left" size={16} /> Hiring drives</Link>
    <header className="ph"><div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span className="eyebrow">{d.college} · {d.city}</span><h1>{d.name}</h1>
      <div className="meta"><span>Session {fmtDate(d.date)}</span><span>Link closes {fmtDate(d.closes)}</span><span className={`pill ${driveTone(d.status)}`}>{d.status}</span></div></div>
      {isAdmin && <div className="acts">
        {d.status !== "Closed" ? <button className="btn" type="button" onClick={close}>Close drive</button> : <button className="btn" type="button" onClick={() => op("updateDrive", { id: d.id, status: "Active" })}>Reopen drive</button>}
        {d.status !== "Closed" && <button className="btn" type="button" onClick={() => setImporting(true)}><Icon name="plus" size={16} /> Add employees</button>}
        {d.status !== "Closed" && <button className="btn gold" type="button" onClick={invite} disabled={sending}><Icon name="send" size={16} /> {sending ? "Sending…" : `${unsent.length ? "Send" : "Resend"} ${targets.length} invitation${targets.length !== 1 ? "s" : ""}`}</button>}
      </div>}</header>
    <section className="kpis">
      <div className="card kpi"><span>Invited</span><b className="n">{s.invited}</b><span>{s.notStarted} not started</span></div>
      <div className="card kpi"><span>Submitted</span><b className="n">{s.submitted}</b><span>{s.invited ? Math.round((s.submitted / s.invited) * 100) : 0}% completion</span></div>
      <div className="card kpi hi"><span>To review</span><b className="n">{s.awaiting}</b><span>{s.flaggedAwaiting} flagged</span></div>
      <div className="card kpi"><span>Average MCQ</span><b className="n">{s.avgMcq === null ? "—" : s.avgMcq.toFixed(1)}</b><span>out of {ws.settings.mcq}</span></div>
    </section>
    <section className="card" style={{ overflow: "hidden" }}><div className="toolbar"><h2 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>Employees in this drive</h2></div>
      <div className="tbl-wrap"><table className="tbl"><CandHead /><tbody>{l.length ? l.map((c) => <CandRow key={c.id} c={c} />) : <tr><td colSpan={7} className="empty">No employees yet. Add employees to send assessment links.</td></tr>}</tbody></table></div></section>
    {importing && <AddEmployeesModal driveId={d.id} onClose={() => setImporting(false)} />}
  </>;
}
