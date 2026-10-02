"use client";

import { useState } from "react";
import Link from "next/link";
import { AWAITING, stats } from "../../lib/domain";
import { Icon, fmtDate, fmtT } from "../../components/ui";
import { CandHead, CandRow, usePortal } from "../portal";
import { AddEmployeesModal, NewDriveModal } from "../modals";

export default function Dashboard() {
  const { ws, me, isAdmin } = usePortal();
  const [modal, setModal] = useState("");
  const s = stats(ws, ws.candidates);
  const pct = s.invited ? Math.round((s.submitted / s.invited) * 100) : 0;
  const segs = [
    ["Not started", s.notStarted, "#3A4458"], ["In progress", s.started, "#5C7FB8"], ["Awaiting review", s.awaiting, "#8C7A4E"],
    ["Shortlisted / interview / selected", s.shortlisted, "#F0E3C0"], ["Rejected", s.rejected, "#B5684A"], ["On hold", s.hold, "#6B7487"], ["Terminated", s.terminated, "#7A3A33"],
  ];
  const awaiting = ws.candidates.filter((c) => AWAITING.includes(c.status)).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)).slice(0, 6);
  const recent = [...ws.events].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8);
  const active = ws.drives.filter((d) => d.status === "Active");
  const hr = new Date().getHours();

  return <>
    <header className="ph"><div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span className="eyebrow">Sales team · College hiring</span><h1>Good {hr < 12 ? "morning" : hr < 17 ? "afternoon" : "evening"}, {me.name.split(" ")[0]}</h1></div>
      {isAdmin && <div className="acts"><button className="btn" type="button" onClick={() => setModal("import")}><Icon name="plus" size={16} /> Add employees</button><button className="btn gold" type="button" onClick={() => setModal("drive")}><Icon name="plus" size={16} /> New hiring drive</button></div>}</header>
    <section className="kpis" aria-label="Key figures">
      <div className="card kpi"><span>Invited</span><b className="n">{s.invited}</b><span>across {active.length} active drive{active.length !== 1 ? "s" : ""}</span></div>
      <div className="card kpi"><span>Assessments submitted</span><b className="n">{s.submitted}</b><span>{pct}% of invited</span></div>
      <div className="card kpi hi"><span>Awaiting HR review</span><b className="n">{s.awaiting}</b><span>{s.flaggedAwaiting} with activity flags</span></div>
      <div className="card kpi"><span>Shortlisted for interview</span><b className="n">{s.shortlisted}</b><span>{s.submitted ? Math.round((s.shortlisted / s.submitted) * 100) : 0}% of submitted</span></div>
    </section>
    <div className="cols">
      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 22 }}><div className="card-h"><h2>Recruitment pipeline</h2><span className="muted" style={{ fontSize: 13 }}>All drives</span></div>
        <div className="bar">{segs.filter((x) => x[1]).map((x) => <div key={x[0]} style={{ flex: x[1], background: x[2] }} title={`${x[0]}: ${x[1]}`} />)}</div>
        <div className="legend">{segs.map((x) => <div key={x[0]}><i style={{ background: x[2] }} /><span>{x[0]}</span><b>{x[1]}</b></div>)}</div>
      </section>
      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}><div className="card-h"><h2>Active hiring drives</h2><Link href="/hr/drives" style={{ fontSize: 13, textDecoration: "none" }}>View all</Link></div>
        {active.length ? active.map((d) => {
          const l = ws.candidates.filter((c) => c.driveId === d.id), st = stats(ws, l), p = l.length ? Math.round((st.submitted / l.length) * 100) : 0;
          return <Link key={d.id} href={`/hr/drives/${d.id}`} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 120px 44px", gap: 16, alignItems: "center", padding: "12px 0", borderTop: "1px solid var(--line)", textDecoration: "none", color: "var(--text)" }}>
            <span><b style={{ fontSize: 14, display: "block" }}>{d.college} · {d.name}</b><small className="muted">Closes {fmtDate(d.closes)} · {l.length} invited</small></span>
            <span className="prog"><div style={{ width: `${p}%` }} /></span><span style={{ fontSize: 13, textAlign: "right" }}>{p}%</span>
          </Link>;
        }) : <span className="muted" style={{ fontSize: 14 }}>No active drives.</span>}
      </section>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <section className="card" style={{ overflow: "hidden" }}><div className="toolbar"><h2 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>Awaiting review</h2><Link className="btn sm" href="/hr/candidates">All candidates</Link></div>
        <div className="tbl-wrap"><table className="tbl"><CandHead /><tbody>{awaiting.length ? awaiting.map((c) => <CandRow key={c.id} c={c} />) : <tr><td colSpan={7} className="empty">Nothing waiting — you’re up to date.</td></tr>}</tbody></table></div></section>
      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}><div className="card-h"><h2>Recent activity</h2><Link href="/hr/activity" style={{ fontSize: 13, textDecoration: "none" }}>Full log</Link></div>
        <div className="tl" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", gap: "14px 32px" }}>
          {recent.map((e) => { const c = ws.candidates.find((x) => x.id === e.cid); return <div key={e.id} className={e.warn ? "w" : ""}><span className="t">{fmtT(e.at)}</span><span><b style={{ color: "var(--text)" }}>{c ? c.name : "—"}</b><br />{e.text}</span></div>; })}
        </div></section>
    </div>
    {modal === "drive" && <NewDriveModal onClose={() => setModal("")} />}
    {modal === "import" && <AddEmployeesModal onClose={() => setModal("")} />}
  </>;
}
