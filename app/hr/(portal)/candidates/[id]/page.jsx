"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { HR_STATUSES, NEEDS_SUBMISSION, QUESTION_TYPES, SL, TYPE_NAME, collegeOf, driveOf, driveOpen, initials, mcqScore, planCounts, qById, words, writtenAverage } from "../../../../lib/domain";
import { Icon, fmtDay, fmtTs } from "../../../../components/ui";
import { usePortal } from "../../../portal";
import { SendLinksModal } from "../../../modals";

function Rate({ value, onRate }) {
  return <div className="rate"><span>Reviewer rating</span>
    {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={value === n ? "on" : value && n < value ? "in" : ""} aria-label={`Rate ${n} of 5`} aria-pressed={value === n} onClick={() => onRate(n)}>{n}</button>)}
    {!value && <span>Not rated</span>}
  </div>;
}

export default function CandidateDetail() {
  const { id } = useParams();
  const { ws, op, toast } = usePortal();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const opened = useRef("");
  const c = ws.candidates.find((x) => x.id === id);

  // Opening a completed assessment moves it into HR review.
  useEffect(() => {
    if (c?.status === "completed" && opened.current !== c.id) { opened.current = c.id; op("openReview", { id: c.id }); }
  }, [c, op]);

  if (!c) return <><Link className="crumb" href="/hr/candidates"><Icon name="left" size={16} /> Candidates</Link><div className="card pad empty">This employee doesn’t exist.</div></>;
  const d = driveOf(ws, c);
  const ev = ws.events.filter((e) => e.cid === c.id).sort((a, b) => new Date(a.at) - new Date(b.at));
  const submitted = !!c.submittedAt && Array.isArray(c.mcq);
  const avg = writtenAverage(c);
  const link = `${typeof location !== "undefined" ? location.origin : ""}/assessment/${c.token}`;
  const rate = (key, value) => op("rate", { id: c.id, key, value });
  const change = async (to) => { const from = c.status; if (to !== from && await op("setStatus", { ids: [c.id], to })) toast(<>{c.name} moved from {SL[from]} to <b>{SL[to]}</b>.</>); };
  const addNote = async () => { if (note.trim() && await op("addNote", { id: c.id, text: note })) setNote(""); };
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast("Link copied."); } catch { toast(link); } };
  const reallow = async () => { const r = await op("allowAttempt", { id: c.id }); if (r) toast(r.result); };
  const canSend = ["invited", "started"].includes(c.status) && driveOpen(d);

  let left;
  if (submitted) {
    left = <>
      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div className="card-h"><h2>Multiple choice</h2><span className="serif" style={{ fontSize: 34 }}>{mcqScore(ws, c)}<span className="muted"> / {c.mcq.length}</span></span></div>
        {c.mcq.length ? <>
          <div className="mcqs">{c.mcq.map((a, k) => { const q = qById(ws, a.qid), ok = q && a.chosen === q.correct; return <div key={k} className={`mcq ${ok ? "ok" : ""}`}><b>Q{k + 1} · {q?.cat || "Removed question"}</b><span>{a.chosen === null ? "Not answered" : ok ? "Correct" : "Incorrect"}</span></div>; })}</div>
          <details><summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--gold)", minHeight: 32, display: "flex", alignItems: "center" }}>Show questions and chosen answers</summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>{c.mcq.map((a, k) => {
              const q = qById(ws, a.qid); if (!q) return null; const ok = a.chosen === q.correct;
              return <div key={k} style={{ padding: "14px 16px", borderRadius: 12, background: "var(--ink2)", display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
                <b>{k + 1}. {q.text}</b><span style={{ color: ok ? "var(--gold2)" : "var(--warn)" }}>{ok ? "✓" : "✗"} {a.chosen === null ? "No answer" : q.options[a.chosen]}</span>{!ok && <span className="muted">Correct: {q.options[q.correct]}</span>}
              </div>;
            })}</div></details>
        </> : <span className="muted">No multiple-choice questions in this assessment.</span>}
      </section>
      {c.written?.length > 0 && <section className="card pad"><div className="card-h" style={{ marginBottom: 6 }}><h2>Written answers</h2><span className="muted" style={{ fontSize: 13 }}>Average rating {avg === null ? "—" : avg.toFixed(1)}</span></div>
        {c.written.map((w, k) => { const q = qById(ws, w.qid); return <article className="ans" key={w.qid}><span className="eyebrow">Q{c.mcq.length + k + 1} · {q?.cat || "Removed question"} · {words(w.text)} words</span><b style={{ fontSize: 15 }}>{q?.text}</b><p>{w.text || <span className="muted">No answer given.</span>}</p><Rate value={c.ratings?.[w.qid]} onRate={(v) => rate(w.qid, v)} /></article>; })}
      </section>}
    </>;
  } else {
    const msg = c.status === "terminated" ? ["Assessment terminated", c.endReason || "The assessment ended automatically. Review the activity log and decide whether to allow a new attempt."]
      : c.status === "started" ? ["Assessment in progress", `Started ${fmtDay(c.startedAt)}. Responses will appear here when the employee submits.`]
        : c.status === "invited" ? [c.inviteSentAt ? "Link sent" : "Link not sent yet", c.inviteSentAt ? `Assessment link emailed ${fmtDay(c.inviteSentAt)}. The employee hasn’t opened it yet.` : `Added ${fmtDay(c.invitedAt)}. Send the assessment link to start their first round.`]
          : [SL[c.status], "This employee was moved on without taking the assessment."];
    const picked = (c.questionIds || []).map((qid) => qById(ws, qid)).filter(Boolean);
    const counts = planCounts(ws, c);
    left = <>
      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "flex-start" }}>
        <span className="eyebrow">{msg[0]}</span><h2 className="serif" style={{ fontSize: 34, fontWeight: 400, lineHeight: "38px" }}>{c.status === "terminated" ? "No responses submitted" : ["invited", "started"].includes(c.status) ? "Waiting for the employee" : "No assessment taken"}</h2>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.6, maxWidth: "60ch" }}>{msg[1]}</p>
        {["invited", "started"].includes(c.status) && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 12, background: "var(--ink2)", fontFamily: "var(--mono)", fontSize: 13, flexWrap: "wrap", maxWidth: "100%" }}><span className="muted">Link</span><span style={{ wordBreak: "break-all" }}>{link}</span></div>}
        {!driveOpen(d) && ["invited", "started"].includes(c.status) && <p style={{ fontSize: 13, color: "var(--warn)" }}>This employee’s drive is closed or past its closing date, so the link won’t accept attempts.</p>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {canSend && <button className="btn gold" type="button" onClick={() => setSending(true)}><Icon name="send" size={16} /> {c.inviteSentAt ? "Resend" : "Send"} assessment link</button>}
          {["invited", "started"].includes(c.status) && <button className="btn" type="button" onClick={copy}><Icon name="copy" size={16} /> Copy link</button>}
          {c.status === "terminated" && <button className="btn gold" type="button" onClick={reallow}><Icon name="refresh" size={16} /> Allow a new attempt</button>}
        </div>
      </section>
      {c.status === "invited" && <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2>Questions on this link</h2>
        <span className="muted" style={{ fontSize: 13 }}>{picked.length ? `${picked.length} chosen by HR` : "Drawn from the assessment rules"} · {counts.mcq} multiple-choice · {counts.written} written</span>
        {QUESTION_TYPES.map((t) => { const list = picked.filter((q) => q.type === t); return list.length ? <div key={t} style={{ display: "flex", flexDirection: "column", gap: 6 }}><span className="eyebrow">{TYPE_NAME[t]}</span>{list.map((q) => <span key={q.id} style={{ fontSize: 14, color: "var(--soft)", lineHeight: 1.45 }}>{q.text}</span>)}</div> : null; })}
      </section>}
    </>;
  }

  // System statuses can't be chosen by hand; show the current one as a read-only option.
  const statusOptions = HR_STATUSES.includes(c.status) ? HR_STATUSES : [c.status, ...HR_STATUSES];

  return <>
    <Link className="crumb" href="/hr/candidates"><Icon name="left" size={16} /> Candidates</Link>
    <header className="cand-h">
      <div style={{ display: "flex", alignItems: "center", gap: 20, minWidth: 0 }}><div className="big">{initials(c.name)}</div><div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}><h1>{c.name}</h1><div className="meta"><span>{collegeOf(ws, c)} · {d.name}</span><span>{c.email}</span>{c.phone && <span>{c.phone}</span>}{c.submittedAt && <span>Submitted {fmtDay(c.submittedAt)}</span>}</div></div></div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 10 }}>
        <label className="field" style={{ fontSize: 12 }}>Status<select className="select" value={c.status} onChange={(e) => change(e.target.value)} style={{ minWidth: 210, background: "var(--goldbg)", borderColor: "var(--goldline)", color: "var(--gold2)" }}>
          {statusOptions.map((s) => <option key={s} value={s} disabled={s === c.status ? false : !HR_STATUSES.includes(s) || (!submitted && NEEDS_SUBMISSION.includes(s))}>{SL[s]}</option>)}
        </select></label>
        {submitted && <><button className="btn danger" type="button" onClick={() => change("rejected")}>Reject</button><button className="btn" type="button" onClick={() => change("hold")}>Hold</button><button className="btn gold" type="button" onClick={() => change("shortlisted")}>Shortlist for interview</button></>}
      </div>
    </header>
    <div className="split">
      <div className="l">{left}</div>
      <div className="r">
        <section className="card pad integrity" style={{ display: "flex", flexDirection: "column", gap: 16 }}><div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--gold2)" }}><Icon name="shield" /><h2 style={{ color: "var(--gold2)" }}>Assessment integrity</h2></div>
          <div className="kv">
            <span>Tab switches</span><b style={{ color: c.tabs ? "var(--warn)" : "var(--text)" }}>{c.tabs || 0}{c.tabs ? (c.status === "terminated" ? " · terminated" : " · warned") : ""}</b>
            <span>Device</span><b>{c.device || "—"}</b>
            <span>Reconnects</span><b>{ev.filter((e) => e.type === "reconnect").length}</b>
            <span>Time taken</span><b>{c.duration ? `${c.duration} min` : "—"}</b>
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.5, color: "var(--goldtx)" }}>Signals for review, not proof. Browser monitoring can’t detect a second device.</p>
        </section>
        <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}><div className="card-h"><h2>Activity log</h2><span className="muted" style={{ fontSize: 12 }}>{ev.length} events</span></div>
          <div className="tl">{ev.length ? ev.map((e) => <div key={e.id} className={e.warn ? "w" : ""}><span className="t">{fmtTs(e.at)}</span><span>{e.text}</span></div>) : <span className="muted">No activity yet.</span>}</div></section>
        <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}><h2>Status history</h2>
          <div className="hist">{[...(c.history || [])].reverse().map((h, k) => <div key={k}><b>{h.from ? `${SL[h.from]} → ` : ""}{SL[h.to]}</b><small>{h.by} · {fmtDay(h.at)}</small></div>)}</div></section>
        <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}><h2>Reviewer notes</h2>
          {(c.notes || []).map((n, k) => <div key={k} style={{ padding: "12px 14px", borderRadius: 12, background: "var(--ink2)", fontSize: 14, lineHeight: 1.5 }}><span style={{ whiteSpace: "pre-wrap" }}>{n.text}</span><small className="muted" style={{ display: "block", marginTop: 6, fontSize: 12 }}>{n.by} · {fmtDay(n.at)}</small></div>)}
          <label className="sr" htmlFor="note">Add a note</label><textarea className="textarea" id="note" rows={3} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the interview panel…" />
          <button className="btn sm" type="button" onClick={addNote} disabled={!note.trim()} style={{ alignSelf: "flex-end" }}>Add note</button></section>
      </div>
    </div>
    {sending && <SendLinksModal ids={[c.id]} initialQuestionIds={c.questionIds?.length ? c.questionIds : null} onClose={() => setSending(false)} />}
  </>;
}
