"use client";

import { useRouter } from "next/navigation";
import { STATUS, SL, collegeOf, driveOf, mcqScore, stats, toCsv, writtenAverage } from "../../../lib/domain";
import { Icon, downloadCSV } from "../../../components/ui";
import { usePortal } from "../../portal";

export default function Reports() {
  const { ws, isAdmin, toast } = usePortal();
  const router = useRouter();
  const rows = ws.drives.map((d) => { const l = ws.candidates.filter((c) => c.driveId === d.id); return { d, s: stats(ws, l), n: l.length }; });
  const all = stats(ws, ws.candidates);
  const dist = STATUS.map(([k, t]) => [t, ws.candidates.filter((c) => c.status === k).length]).filter((x) => x[1]);
  const max = Math.max(1, ...dist.map((x) => x[1]));

  function driveCsv() {
    downloadCSV("drive-summary.csv", toCsv([["College", "Drive", "Invited", "Submitted", "Completion %", "Avg MCQ", "Shortlisted"],
      ...rows.map((r) => [r.d.college, r.d.name, r.n, r.s.submitted, r.n ? Math.round((r.s.submitted / r.n) * 100) : 0, r.s.avgMcq === null ? "" : r.s.avgMcq.toFixed(2), r.s.shortlisted])]));
    toast("Downloaded drive-summary.csv");
  }
  function fullCsv() {
    downloadCSV("candidates-full.csv", toCsv([["Name", "Email", "Phone", "College", "Drive", "Status", "MCQ score", "Written avg rating", "Video rating", "Tab switches", "Submitted"],
      ...ws.candidates.map((c) => { const avg = writtenAverage(c); return [c.name, c.email, c.phone, collegeOf(ws, c), driveOf(ws, c).name, SL[c.status], c.mcq ? mcqScore(ws, c) : "", avg === null ? "" : avg.toFixed(1), c.ratings?.video || "", c.tabs || 0, c.submittedAt || ""]; })]));
    toast("Downloaded candidates-full.csv");
  }

  return <>
    <header className="ph"><div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span className="eyebrow">All drives</span><h1>Reports &amp; export</h1></div>
      {isAdmin && <div className="acts"><button className="btn" type="button" onClick={driveCsv}><Icon name="download" size={16} /> Drive summary CSV</button><button className="btn gold" type="button" onClick={fullCsv}><Icon name="download" size={16} /> Full candidate export</button></div>}</header>
    <section className="kpis">
      <div className="card kpi"><span>Completion rate</span><b className="n">{all.invited ? Math.round((all.submitted / all.invited) * 100) : 0}%</b><span>{all.submitted} of {all.invited} invited</span></div>
      <div className="card kpi"><span>Average MCQ score</span><b className="n">{all.avgMcq === null ? "—" : all.avgMcq.toFixed(1)}</b><span>out of {ws.settings.mcq}</span></div>
      <div className="card kpi"><span>Shortlist rate</span><b className="n">{all.submitted ? Math.round((all.shortlisted / all.submitted) * 100) : 0}%</b><span>of submitted assessments</span></div>
      <div className="card kpi hi"><span>Integrity flags</span><b className="n">{ws.candidates.filter((c) => c.tabs).length}</b><span>{all.terminated} terminated</span></div>
    </section>
    <div className="split">
      <section className="card l" style={{ overflow: "hidden" }}><div className="toolbar"><h2 style={{ fontSize: 16, fontWeight: 700 }}>By hiring drive</h2></div>
        <div className="tbl-wrap"><table className="tbl" style={{ minWidth: 720 }}><thead><tr><th>Drive</th><th>Invited</th><th>Submitted</th><th>Completion</th><th>Avg MCQ</th><th>Shortlisted</th></tr></thead><tbody>
          {rows.map((r) => { const p = r.n ? Math.round((r.s.submitted / r.n) * 100) : 0; return <tr key={r.d.id} className="click" onClick={() => router.push(`/hr/drives/${r.d.id}`)}>
            <td><b>{r.d.college}</b><br /><small className="muted">{r.d.name}</small></td><td>{r.n}</td><td>{r.s.submitted}</td>
            <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div className="prog" style={{ width: 90 }}><div style={{ width: `${p}%` }} /></div>{p}%</div></td>
            <td>{r.s.avgMcq === null ? "—" : r.s.avgMcq.toFixed(1)}</td><td>{r.s.shortlisted}</td>
          </tr>; })}
        </tbody></table></div></section>
      <section className="card pad r" style={{ display: "flex", flexDirection: "column", gap: 14 }}><h2>Status distribution</h2>
        {dist.map(([t, n]) => <div key={t} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--soft)" }}>{t}</span><b>{n}</b></div><div className="prog" style={{ height: 8 }}><div style={{ width: `${(n / max) * 100}%` }} /></div></div>)}
      </section>
    </div>
  </>;
}
