"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toCsv } from "../../../lib/domain";
import { Icon, downloadCSV, fmtDay, pad } from "../../../components/ui";
import { UI, usePortal } from "../../portal";

const GROUPS = { all: null, tab: ["tab", "terminated"], device: ["device", "eligible", "reconnect"], media: ["perm", "video"], lifecycle: ["start", "submit", "invite"] };
const TLABEL = { tab: "Tab switch", terminated: "Terminated", device: "Device", eligible: "Eligibility", reconnect: "Reconnect", perm: "Permissions", video: "Video", start: "Lifecycle", submit: "Lifecycle", invite: "Invitation" };

export default function Activity() {
  const { ws, isAdmin, toast } = usePortal();
  const router = useRouter();
  const [f, setFState] = useState(UI.act);
  const setF = (patch) => { const next = { ...f, ...patch }; UI.act = next; setFState(next); };
  const name = (cid) => ws.candidates.find((x) => x.id === cid)?.name || "—";
  const list = ws.events.filter((e) => !GROUPS[f.type] || GROUPS[f.type].includes(e.type))
    .filter((e) => !f.q || `${name(e.cid)} ${e.text}`.toLowerCase().includes(f.q.toLowerCase()))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  const flagged = ws.events.filter((e) => e.warn).length;
  const shown = list.slice(0, 500);

  function exportLog() {
    downloadCSV("activity-log.csv", toCsv([["Time", "Candidate", "Type", "Event", "Flagged"], ...list.map((e) => [e.at, name(e.cid), e.type, e.text, e.warn ? "yes" : ""])]));
    toast("Downloaded activity-log.csv");
  }

  return <>
    <header className="ph"><div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span className="eyebrow">{ws.events.length} events · {flagged} flagged</span><h1>Activity &amp; violation log</h1></div>
      {isAdmin && <div className="acts"><button className="btn" type="button" onClick={exportLog}><Icon name="download" size={16} /> Export log</button></div>}</header>
    <section className="card" style={{ overflow: "hidden" }}>
      <div className="toolbar">
        <div className="tabs">{[["all", "All"], ["tab", "Tab switches"], ["device", "Device"], ["media", "Camera & video"], ["lifecycle", "Start / submit"]].map((t) => <button key={t[0]} type="button" className={f.type === t[0] ? "on" : ""} aria-pressed={f.type === t[0]} onClick={() => setF({ type: t[0] })}>{t[1]}</button>)}</div>
        <label className="search"><Icon name="search" size={16} stroke={2} /><span className="sr">Search log</span><input type="search" placeholder="Search candidate or event…" value={f.q} onChange={(e) => setF({ q: e.target.value })} /></label>
      </div>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Time</th><th>Candidate</th><th>Type</th><th>Event</th><th></th></tr></thead><tbody>
        {shown.length ? shown.map((e) => <tr key={e.id} className="click" onClick={() => router.push(`/hr/candidates/${e.cid}`)}>
          <td className="mono muted" style={{ whiteSpace: "nowrap" }}>{fmtDay(e.at)}:{pad(new Date(e.at).getSeconds())}</td><td><b>{name(e.cid)}</b></td>
          <td><span className={`pill ${e.warn ? "st-rejected" : ""}`}>{TLABEL[e.type] || e.type}</span></td>
          <td style={{ color: e.warn ? "var(--warn)" : "var(--soft)" }}>{e.text}</td>
          <td style={{ textAlign: "right" }}><Link className="btn sm" href={`/hr/candidates/${e.cid}`} onClick={(ev) => ev.stopPropagation()}>Candidate</Link></td>
        </tr>) : <tr><td colSpan={5} className="empty">No events.</td></tr>}
      </tbody></table></div>
      {list.length > shown.length && <div className="empty" style={{ padding: 18 }}>Showing the latest {shown.length} of {list.length}. Export the log to see everything.</div>}
    </section>
  </>;
}
