"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AWAITING, driveOf, driveStatusLabel, initials, mcqScore } from "../lib/domain";
import { Icon, Pill, fmtDay, useToast } from "../components/ui";

const PortalCtx = createContext(null);
export const usePortal = () => useContext(PortalCtx);

// Filter state that should survive navigating between pages.
export const UI = { cand: { q: "", drive: "", status: "", flagged: false }, qb: { type: "all", q: "" }, act: { type: "all", q: "" } };

export function PortalProvider({ children }) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/workspace", { cache: "no-store" });
      if (r.status === 401) return router.replace("/hr/login");
      if (!r.ok) throw new Error();
      setState(await r.json());
    } catch { setError("The HR workspace couldn’t be loaded. Check your connection and refresh."); }
  }, [router]);
  useEffect(() => {
    load();
    // Pick up changes made by other HR users when the tab comes back into focus.
    const onFocus = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [load]);

  const op = useCallback(async (name, payload = {}) => {
    try {
      const r = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: name, ...payload }) });
      const body = await r.json().catch(() => ({}));
      if (r.status === 401) { router.replace("/hr/login"); return null; }
      if (!r.ok) { toast(body.error || "That change couldn’t be saved."); return null; }
      setState((s) => ({ ...s, workspace: body.workspace }));
      if (body.invites?.error) toast(`${body.invites.sent} of ${body.invites.attempted + body.invites.skipped} invitations sent. ${body.invites.error}`);
      return body;
    } catch { toast("That change couldn’t be saved. Check your connection and try again."); return null; }
  }, [router, toast]);

  const setWorkspace = (workspace) => setState((s) => ({ ...s, workspace }));

  if (error) return <div className="hr"><main className="main"><div className="empty">{error}</div></main></div>;
  if (!state) return <div className="hr"><main className="main"><div className="empty">Loading the HR workspace…</div></main></div>;
  const isAdmin = state.me.role === "HR Admin";
  return <PortalCtx.Provider value={{ ws: state.workspace, me: state.me, isAdmin, op, toast, setWorkspace }}>{children}</PortalCtx.Provider>;
}

const NAV = [
  ["RECRUITMENT", [["", "grid", "Dashboard"], ["drives", "drive", "Hiring drives"], ["candidates", "users", "Candidates", "awaiting"]]],
  ["ASSESSMENT", [["questions", "list", "Question bank", null, true], ["settings", "sliders", "Assessment rules", null, true]]],
  ["OVERSIGHT", [["activity", "shield", "Activity log"], ["reports", "chart", "Reports & export"], ["users", "key", "Users & roles", null, true]]],
];

export function Shell({ children }) {
  const { ws, me, isAdmin } = usePortal();
  const router = useRouter();
  const path = usePathname();
  const section = path.split("/")[2] || "";
  const awaiting = ws.candidates.filter((c) => AWAITING.includes(c.status)).length;
  const signOut = async () => { await fetch("/api/session", { method: "DELETE" }).catch(() => {}); router.replace("/hr/login"); };
  return <div className="hr">
    <aside className="side">
      <div className="brand"><div className="mark">J</div><div><b>Juris Consultants</b><small>Talent screening</small></div></div>
      <nav aria-label="HR portal">
        {NAV.map(([group, items]) => <div key={group} style={{ display: "contents" }}>
          <span className="grp">{group}</span>
          {items.filter((i) => !i[4] || isAdmin).map(([k, ic, t, cnt]) => <Link key={k} className={`nav ${section === k ? "on" : ""}`} href={`/hr${k ? "/" + k : ""}`} aria-current={section === k ? "page" : undefined}>
            <Icon name={ic} />{t}{cnt && awaiting ? <span className="count">{awaiting}</span> : null}
          </Link>)}
        </div>)}
      </nav>
      <div className="me"><div className="avatar">{initials(me.name)}</div><div style={{ flex: 1, minWidth: 0 }}><b>{me.name}</b><small>{me.role}</small></div><button className="x" type="button" onClick={signOut} aria-label="Sign out" title="Sign out"><Icon name="logout" size={16} /></button></div>
    </aside>
    <main className="main">{children}</main>
  </div>;
}

export function AdminOnly({ children }) {
  const { isAdmin } = usePortal();
  if (isAdmin) return children;
  return <div className="card pad empty">This page is available to HR Admins only.</div>;
}

/* ---------- candidate table ---------- */
export function CandHead({ check, allChecked, onAll }) {
  return <thead><tr>
    {check && <th style={{ width: 44 }}><input type="checkbox" className="check" aria-label="Select all" checked={allChecked} onChange={(e) => onAll(e.target.checked)} /></th>}
    <th>Candidate</th><th>College / drive</th><th>MCQ</th><th>Flags</th><th>Submitted</th><th>Status</th><th></th>
  </tr></thead>;
}

export function CandRow({ c, check, checked, onCheck }) {
  const { ws } = usePortal();
  const router = useRouter();
  const d = driveOf(ws, c);
  const href = `/hr/candidates/${c.id}`;
  return <tr className="click" onClick={() => router.push(href)}>
    {check && <td style={{ width: 44 }} onClick={(e) => e.stopPropagation()}><input type="checkbox" className="check" checked={checked} onChange={(e) => onCheck(e.target.checked)} aria-label={`Select ${c.name}`} /></td>}
    <td><div className="who"><span className="avatar">{initials(c.name)}</span><div><b>{c.name}</b><small>{c.email}</small></div></div></td>
    <td style={{ color: "var(--soft)" }}>{c.college || d.college}<br /><small className="muted">{d.name}</small></td>
    <td>{c.mcq ? <><b>{mcqScore(ws, c)}</b><span className="muted"> / {c.mcq.length}</span></> : <span className="muted">—</span>}</td>
    <td>{c.tabs ? <span className="flag"><Icon name="warn" size={14} stroke={2} />{c.tabs} tab{c.tabs > 1 ? "s" : ""}</span> : <span className="muted">None</span>}</td>
    <td className="muted">{c.submittedAt ? fmtDay(c.submittedAt) : c.status === "started" ? "In progress" : "Not started"}</td>
    <td><Pill status={c.status} /></td>
    <td style={{ textAlign: "right" }}><Link className="btn sm" href={href} onClick={(e) => e.stopPropagation()}>{AWAITING.includes(c.status) ? "Review" : "Open"}</Link></td>
  </tr>;
}

const DRIVE_TONE = { Active: "st-completed", Draft: "st-review", Expired: "st-rejected", Closed: "st-hold" };
export function DriveBadge({ drive }) {
  const label = driveStatusLabel(drive);
  return <span className={`pill ${DRIVE_TONE[label]}`}>{label}</span>;
}
