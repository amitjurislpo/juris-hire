"use client";

import { useState } from "react";
import Link from "next/link";
import { stats } from "../../../lib/domain";
import { Icon, fmtDate } from "../../../components/ui";
import { DriveBadge, usePortal } from "../../portal";
import { DriveModal } from "../../modals";


export default function Drives() {
  const { ws, isAdmin } = usePortal();
  const [open, setOpen] = useState(false);
  return <>
    <header className="ph"><div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span className="eyebrow">{ws.drives.length} drives</span><h1>Hiring drives</h1></div>
      {isAdmin && <div className="acts"><button className="btn gold" type="button" onClick={() => setOpen(true)}><Icon name="plus" size={16} /> New hiring drive</button></div>}</header>
    <div className="drives">{ws.drives.map((d) => {
      const l = ws.candidates.filter((c) => c.driveId === d.id), s = stats(ws, l), p = l.length ? Math.round((s.submitted / l.length) * 100) : 0;
      return <Link key={d.id} className="card drive" href={`/hr/drives/${d.id}`} style={{ textDecoration: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span className="eyebrow">{d.college}</span><DriveBadge drive={d} /></div>
        <h3>{d.name}</h3>
        <span className="muted" style={{ fontSize: 13 }}>Session {fmtDate(d.date)} · closes {fmtDate(d.closes)}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span className="muted">Completion</span><b>{p}%</b></div><div className="prog"><div style={{ width: `${p}%` }} /></div></div>
        <div className="stats3"><div><b>{l.length}</b><span>Invited</span></div><div><b>{s.awaiting}</b><span>To review</span></div><div><b>{s.shortlisted}</b><span>Shortlisted</span></div></div>
      </Link>;
    })}</div>
    {open && <DriveModal onClose={() => setOpen(false)} />}
  </>;
}
