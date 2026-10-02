"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { driveExpired, driveOpen, stats } from "../../../../lib/domain";
import { Icon, fmtDate } from "../../../../components/ui";
import { CandHead, CandRow, DriveBadge, usePortal } from "../../../portal";
import { AddEmployeesModal, DriveModal, SendLinksModal } from "../../../modals";

const pct = (v) => (v === null ? "—" : `${Math.round(v)}%`);

export default function DriveDetail() {
  const { id } = useParams();
  const { ws, isAdmin, op, toast } = usePortal();
  const [modal, setModal] = useState("");
  const d = ws.drives.find((x) => x.id === id);
  if (!d) return <><Link className="crumb" href="/hr/drives"><Icon name="left" size={16} /> Hiring drives</Link><div className="card pad empty">This drive doesn’t exist.</div></>;
  const l = ws.candidates.filter((c) => c.driveId === d.id), s = stats(ws, l);
  const open = driveOpen(d);
  const notStarted = l.filter((c) => c.status === "invited");
  const unsent = notStarted.filter((c) => !c.inviteSentAt);
  const targets = unsent.length ? unsent : notStarted;

  async function setStatus(status) {
    const r = await op("setDriveStatus", { id: d.id, status });
    if (r) toast(r.result);
  }

  return <>
    <Link className="crumb" href="/hr/drives"><Icon name="left" size={16} /> Hiring drives</Link>
    <header className="ph"><div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span className="eyebrow">{d.college} · {d.city}</span><h1>{d.name}</h1>
      <div className="meta"><span>Session {fmtDate(d.date)}</span><span>Link closes {fmtDate(d.closes)}</span><DriveBadge drive={d} /></div></div>
      {isAdmin && <div className="acts">
        <button className="btn" type="button" onClick={() => setModal("edit")}><Icon name="edit" size={16} /> Edit</button>
        {d.status === "Closed"
          ? <button className="btn" type="button" disabled={driveExpired(d)} title={driveExpired(d) ? "Extend the closing date first" : undefined} onClick={() => setStatus("Active")}>Reopen drive</button>
          : <button className="btn" type="button" onClick={() => setStatus("Closed")}>Close drive</button>}
        {open && <button className="btn" type="button" onClick={() => setModal("add")}><Icon name="plus" size={16} /> Add employees</button>}
        {open && targets.length > 0 && <button className="btn gold" type="button" onClick={() => setModal("send")}><Icon name="send" size={16} /> {`${unsent.length ? "Send" : "Resend"} ${targets.length} link${targets.length !== 1 ? "s" : ""}`}</button>}
      </div>}</header>
    {d.status !== "Closed" && driveExpired(d) && <div className="card pad" style={{ borderColor: "var(--goldline)", background: "var(--goldbg)" }}>
      This drive’s closing date has passed, so its links no longer accept new attempts.{isAdmin && " Edit the drive to extend it."}
    </div>}
    <section className="kpis">
      <div className="card kpi"><span>Invited</span><b className="n">{s.invited}</b><span>{s.notStarted} not started</span></div>
      <div className="card kpi"><span>Submitted</span><b className="n">{s.submitted}</b><span>{s.invited ? Math.round((s.submitted / s.invited) * 100) : 0}% completion</span></div>
      <div className="card kpi hi"><span>To review</span><b className="n">{s.awaiting}</b><span>{s.flaggedAwaiting} flagged</span></div>
      <div className="card kpi"><span>Average MCQ</span><b className="n">{pct(s.avgMcqPct)}</b><span>correct answers</span></div>
    </section>
    <section className="card" style={{ overflow: "hidden" }}><div className="toolbar"><h2 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>Employees in this drive</h2></div>
      <div className="tbl-wrap"><table className="tbl"><CandHead /><tbody>{l.length ? l.map((c) => <CandRow key={c.id} c={c} />) : <tr><td colSpan={7} className="empty">No employees yet. Add employees to send assessment links.</td></tr>}</tbody></table></div></section>
    {modal === "add" && <AddEmployeesModal driveId={d.id} onClose={() => setModal("")} />}
    {modal === "edit" && <DriveModal drive={d} onClose={() => setModal("")} />}
    {modal === "send" && <SendLinksModal ids={targets.map((c) => c.id)} onClose={() => setModal("")} />}
  </>;
}
