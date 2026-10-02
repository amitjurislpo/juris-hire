"use client";

import { useState } from "react";
import { ROLES, initials } from "../../../lib/domain";
import { Icon, Modal, ModalHead, PasswordInput, fmtDay } from "../../../components/ui";
import { AdminOnly, usePortal } from "../../portal";

function InviteModal({ onClose }) {
  const { op, toast } = usePortal();
  const [f, setF] = useState({ name: "", email: "", role: "HR Reviewer", password: "" });
  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim() || !/^\S+@\S+\.\S+$/.test(f.email.trim())) return toast("Add a name and a valid email.");
    if (f.password.length < 8) return toast("Passwords need at least 8 characters.");
    const r = await op("inviteUser", f);
    if (r) { toast(r.result); onClose(); }
  }
  return <Modal onClose={onClose}>
    <ModalHead title="Add HR user" onClose={onClose} />
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <label className="field"><span>Full name</span><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="field"><span>Work email</span><input className="input" type="email" required placeholder="name@jurislpo.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
      <label className="field"><span>Password (at least 8 characters)</span><PasswordInput autoComplete="new-password" placeholder="" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
      <label className="field"><span>Role</span><select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.slice().reverse().map((r) => <option key={r}>{r}</option>)}</select></label>
      <div className="modal-f"><button className="btn ghost" type="button" onClick={onClose}>Cancel</button><button className="btn gold" type="submit">Add user</button></div>
    </form>
  </Modal>;
}

function PasswordModal({ user, onClose }) {
  const { op, toast } = usePortal();
  const [password, setPassword] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (password.length < 8) return toast("Passwords need at least 8 characters.");
    const r = await op("setPassword", { id: user.id, password });
    if (r) { toast(r.result); onClose(); }
  }
  return <Modal onClose={onClose}>
    <ModalHead title="Set password" onClose={onClose} />
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p className="muted" style={{ fontSize: 14 }}>New password for <b style={{ color: "var(--text)" }}>{user.name}</b> ({user.email}).</p>
      <label className="field"><span>New password (at least 8 characters)</span><PasswordInput autoComplete="new-password" placeholder="" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <div className="modal-f"><button className="btn ghost" type="button" onClick={onClose}>Cancel</button><button className="btn gold" type="submit">Save password</button></div>
    </form>
  </Modal>;
}

function Users() {
  const { ws, me, op, toast } = usePortal();
  const [adding, setAdding] = useState(false);
  const [pwFor, setPwFor] = useState(null);
  return <>
    <header className="ph"><div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span className="eyebrow">{ws.users.length} HR users</span><h1>Users &amp; roles</h1></div>
      <div className="acts"><button className="btn gold" type="button" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add HR user</button></div></header>
    <div className="split">
      <section className="card l" style={{ overflow: "hidden" }}><div className="tbl-wrap"><table className="tbl" style={{ minWidth: 640 }}><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last active</th><th></th></tr></thead><tbody>
        {ws.users.map((u) => <tr key={u.id}>
          <td><div className="who"><span className="avatar">{initials(u.name)}</span><div><b>{u.name}{u.id === me.id && <span className="muted" style={{ fontWeight: 500 }}> · you</span>}</b><small>{u.email}</small></div></div></td>
          <td><label className="sr" htmlFor={`r-${u.id}`}>Role</label><select className="select" id={`r-${u.id}`} value={u.role} style={{ minHeight: 36, width: "auto" }} onChange={async (e) => { const r = await op("setRole", { id: u.id, role: e.target.value }); if (r) toast(r.result); }}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></td>
          <td><span className={`pill ${u.status === "Active" ? "st-completed" : "st-review"}`}>{u.status}</span></td>
          <td className="muted">{u.last ? fmtDay(u.last) : "—"}</td>
          <td style={{ textAlign: "right" }}><button className="btn sm" type="button" onClick={() => setPwFor(u)}><Icon name="lock" size={14} /> Set password</button></td>
        </tr>)}
      </tbody></table></div></section>
      <section className="card pad r" style={{ display: "flex", flexDirection: "column", gap: 18 }}><h2>Role permissions</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><b style={{ color: "var(--gold2)" }}>HR Admin</b><span className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>Everything a reviewer can do, plus hiring drives, imports, question bank, assessment rules, exports and user management.</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 16, borderTop: "1px solid var(--line)" }}><b>HR Reviewer</b><span className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>View candidates, watch videos, rate answers, add notes, change candidate status and resend invitations.</span></div>
        <div style={{ paddingTop: 16, borderTop: "1px solid var(--line)", fontSize: 13, lineHeight: 1.6 }} className="muted">Every status change is written to the candidate’s history. Each HR user signs in with their own work email and password.</div>
      </section>
    </div>
    {adding && <InviteModal onClose={() => setAdding(false)} />}
    {pwFor && <PasswordModal user={pwFor} onClose={() => setPwFor(null)} />}
  </>;
}

export default function Page() { return <AdminOnly><Users /></AdminOnly>; }
