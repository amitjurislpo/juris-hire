"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { VIOLATION_TEXT, words } from "../../lib/domain";
import { Icon, Modal, fmtDate, mmss, pad, useToast } from "../../components/ui";

const SECTIONS = [["mcq", "Multiple choice"], ["written", "Written answer"]];
const TYPE_LABEL = { mcq: "Multiple choice", written: "Written" };
const NETWORK_ERROR = "We couldn’t reach the server. Check your connection and try again.";

function browserName() {
  const u = navigator.userAgent;
  if (/Edg\//.test(u)) return "Edge"; if (/Chrome\//.test(u)) return "Chrome"; if (/Firefox\//.test(u)) return "Firefox"; if (/Safari\//.test(u)) return "Safari"; return "Browser";
}
function isMobile() {
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
}
const isAnswered = (q, a) => (q.type === "written" ? words(a[q.id]) > 0 : Number.isInteger(a[q.id]));
const overLimit = (q, a, limit) => q.type === "written" && limit > 0 && words(a[q.id]) > limit;

// The server decides which screen the employee belongs on.
const STEP_FOR_STATE = { open: "welcome", started: "q", submitted: "done", terminated: "ended", closed: "closed" };

export default function AssessmentPage() {
  const { token } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [step, setStep] = useState("loading");
  const [idx, setIdx] = useState(0);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [warnings, setWarnings] = useState(0);
  const [consent, setConsent] = useState(false);
  const [modal, setModal] = useState(null);
  const [saveState, setSaveState] = useState("saved");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const offset = useRef(0);
  const pending = useRef({});
  const saveTimer = useRef(null);
  const hiddenAt = useRef(null);
  const submitting = useRef(false);
  const booted = useRef(false);

  const call = useCallback(async (init) => {
    let r;
    try { r = await fetch(`/api/assessment/${token}`, { cache: "no-store", ...init }); }
    catch { throw Object.assign(new Error(NETWORK_ERROR), { status: 0 }); }
    const body = await r.json().catch(() => null);
    if (!r.ok || !body) throw Object.assign(new Error(body?.error || "Something went wrong. Please try again."), { status: r.status });
    return body;
  }, [token]);
  const api = useCallback((payload) => call({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }), [call]);
  const logEvent = useCallback((type, text, warn) => api({ action: "event", type, text, warn }).catch(() => {}), [api]);

  // Applies a server view to local state and picks the right screen.
  const applyView = useCallback((v, keepPosition) => {
    setData(v);
    offset.current = new Date(v.serverNow).getTime() - Date.now();
    if (v.state !== "started") return setStep(STEP_FOR_STATE[v.state] || "closed");
    const qs = v.attempt.questions, a = v.attempt.answers || {};
    setQuestions(qs);
    setAnswers(a);
    setWarnings(v.attempt.warnings || 0);
    if (keepPosition) return setStep("q");
    const first = qs.findIndex((q) => !isAnswered(q, a));
    setIdx(first < 0 ? qs.length - 1 : first);
    setStep(first < 0 ? "review" : "q");
  }, []);

  // Re-reads the server state after a conflict (e.g. HR closed the attempt or time ran out).
  const refresh = useCallback(async () => {
    try { applyView(await call()); } catch (e) { toast(e.message, true); }
  }, [applyView, call, toast]);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      try {
        const v = await call();
        if (["open", "started"].includes(v.state) && v.settings.blockMobile && isMobile()) {
          setData(v); setStep("blocked");
          logEvent("device", `Blocked: opened on a mobile / tablet device (${browserName()})`, true);
          return;
        }
        applyView(v.state === "started" ? await api({ action: "resume" }) : v);
      } catch (e) { setLoadError(e.message); setStep("error"); }
    })();
  }, [api, applyView, call, logEvent]);

  const inAssessment = step === "q" || step === "review";
  const s = data?.settings;
  const deadline = data?.attempt?.deadline ? new Date(data.attempt.deadline).getTime() : null;

  /* ---------- answer saving ---------- */
  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current);
    const items = Object.entries(pending.current);
    if (!items.length) return true;
    pending.current = {};
    setSaveState("saving");
    try {
      for (const [qid, value] of items) await api({ action: "answer", qid, value });
      setSaveState("saved");
      return true;
    } catch (e) {
      if (e.status === 409) { await refresh(); return false; }
      items.forEach(([qid, value]) => { if (!(qid in pending.current)) pending.current[qid] = value; });
      setSaveState("error");
      saveTimer.current = setTimeout(flush, 4000);
      return false;
    }
  }, [api, refresh]);
  const setAnswer = (q, value, immediate) => {
    setAnswers((a) => ({ ...a, [q.id]: value }));
    pending.current[q.id] = value;
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, immediate ? 0 : 700);
  };
  useEffect(() => {
    const warn = (e) => { if (Object.keys(pending.current).length) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); clearTimeout(saveTimer.current); };
  }, []);

  /* ---------- submit ---------- */
  const submit = useCallback(async (timeout) => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true);
    try {
      await flush();
      applyView(await api({ action: "submit", timeout }));
      if (timeout) toast("Time is up — your answers have been submitted.", true);
    } catch (e) {
      if (e.status === 409) await refresh();
      else toast(e.message, true);
    } finally { submitting.current = false; setBusy(false); setModal(null); }
  }, [api, applyView, flush, refresh, toast]);

  /* ---------- timer ---------- */
  useEffect(() => {
    if (!inAssessment) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [inAssessment]);
  const timeLeft = deadline ? Math.max(0, Math.min((s?.timeLimit || 0) * 60, (deadline - (now + offset.current)) / 1000)) : null;
  const expired = inAssessment && timeLeft !== null && timeLeft <= 0;
  // Keeps retrying every tick until the auto-submit goes through (e.g. after a dropped connection).
  useEffect(() => { if (expired) submit(true); }, [expired, now, submit]);

  /* ---------- tab monitoring ---------- */
  useEffect(() => {
    if (!inAssessment) return;
    const onVis = async () => {
      if (document.hidden) { hiddenAt.current = Date.now(); return; }
      if (!hiddenAt.current) return;
      const secs = Math.max(1, Math.round((Date.now() - hiddenAt.current) / 1000));
      hiddenAt.current = null;
      try {
        await flush();
        const r = await api({ action: "tab", secs });
        if (r.outcome === "warning") { setWarnings(r.state.attempt.warnings); setModal({ kind: "warn", text: r.message }); }
        else if (r.outcome === "flag") { setWarnings(r.state.attempt.warnings); toast("Tab switch recorded and flagged for HR review.", true); }
        else if (r.outcome === "reset") { applyView(r.state, true); setIdx(0); setModal({ kind: "reset" }); }
        else applyView(r.state);
      } catch (e) {
        if (e.status === 409) refresh();
        else toast("We couldn’t record your activity. Check your connection.", true);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [inAssessment, api, applyView, flush, refresh, toast]);

  const go = (k) => { if (k < 0 || k >= questions.length) return; flush(); setIdx(k); setStep("q"); window.scrollTo(0, 0); };
  const toStep = (next) => { setStep(next); window.scrollTo(0, 0); };

  async function start() {
    setBusy(true);
    try { applyView(await api({ action: "start", consent: true, device: `Desktop · ${browserName()}` })); setIdx(0); window.scrollTo(0, 0); }
    catch (e) { if (e.status === 409) await refresh(); else toast(e.message, true); }
    finally { setBusy(false); }
  }

  /* ---------- render ---------- */
  if (step === "loading") return <div className="st"><div className="center-st"><p style={{ color: "var(--smuted)" }}>Preparing your assessment…</p></div></div>;
  if (step === "error") return <Notice icon="x" bad eyebrow="Link unavailable" title="We couldn’t open this assessment.">{loadError} If you think this is a mistake, reply to your invitation email.</Notice>;

  const c = data.candidate, d = data.drive;
  const top = (withTimer) => <header className="st-top">
    <div className="brand"><div className="mark">J</div><div><b>{d.name}</b><small>Juris Consultants · {d.college}</small></div></div>
    <div className="st-status">{withTimer
      ? <><span style={{ display: "flex", alignItems: "center", gap: 8 }}><i className="dot" style={{ background: saveState === "error" ? "var(--danger)" : saveState === "saving" ? "var(--sgold)" : undefined }} />{saveState === "error" ? "Not saved — retrying" : saveState === "saving" ? "Saving…" : "Answers saved"}</span>
        <span className={`timer ${timeLeft !== null && timeLeft < 120 ? "low" : ""}`}>{timeLeft !== null ? `${mmss(timeLeft)} left` : `${mmss(Math.max(0, (now + offset.current - new Date(data.attempt?.startedAt || now).getTime()) / 1000))} elapsed`}</span></>
      : <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon name="lock" size={14} /> Secure assessment link</span>}</div>
  </header>;

  if (step === "blocked") return <div className="blocked"><div className="center-card">
    <div className="devices"><Icon name="phone" size={40} stroke={1.4} /><Icon name="tablet" size={48} stroke={1.4} /><span style={{ color: "var(--on-ink-mute)" }}><Icon name="x" size={28} stroke={2} /></span><Icon name="monitor" size={64} stroke={1.4} /></div>
    <span className="eyebrow">Desktop or laptop required</span>
    <h1>Please reopen this link on a laptop or desktop.</h1>
    <p>This is a timed assessment with written answers, so it can’t be taken on a phone or tablet. Your link stays valid — just open the same invitation email on a computer.</p>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><button className="sbtn gold" type="button" onClick={async () => { try { await navigator.clipboard.writeText(location.href); toast("Link copied", true); } catch { toast(location.href, true); } }}><Icon name="copy" size={16} /> Copy my link</button></div>
  </div></div>;

  if (step === "closed") return <Notice header={top(false)} icon="clock" bad eyebrow="Link closed" title="This assessment is no longer accepting attempts." reference={c.token}>
    {data.closedReason === "expired" ? `The link for ${d.name} closed on ${fmtDate(d.closes)}.` : "This assessment link is no longer active."} If you believe you should still have access, reply to your invitation email.
  </Notice>;

  if (step === "done") return <Notice header={top(false)} icon="check" eyebrow="Assessment submitted" title={`Thank you, ${c.name.split(" ")[0]}. You’re all done.`} reference={`${c.token} · You can close this tab.`}>
    Your responses have reached the Juris Consultants HR team. A confirmation is on its way to <b style={{ color: "var(--sink)" }}>{c.email}</b>. If you’re shortlisted, the team will contact you about a live interview.
  </Notice>;

  if (step === "ended") return <Notice header={top(false)} icon="x" bad eyebrow="Assessment ended" title="Your assessment has been closed." reference={c.token}>
    {data.endReason || "This assessment is no longer available."} Your activity has been shared with the HR team, who will decide on next steps and may contact you.
  </Notice>;

  if (step === "welcome") return <div className="st">{top(false)}
    <div className="st-body">
      <main className="st-main">
        <div className="hero-st">
          <span className="eyebrow">Welcome, {c.name}</span>
          <h1>Your first-round assessment for <i>{d.name}</i></h1>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--sbody)", maxWidth: "60ch" }}>This replaces the first HR interview. Answer honestly and in your own words — the HR team reviews every response.</p>
        </div>
        <div className="facts">
          <div className="fact"><b>{s.mcq}</b><span>Multiple-choice</span></div>
          <div className="fact"><b>{s.written}</b><span>Written answers</span></div>
          <div className="fact"><b>{s.timeLimit || "—"}</b><span>{s.timeLimit ? "Minutes" : "No time limit"}</span></div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><button className="sbtn dark" type="button" onClick={() => toStep("check")}>Check my system <Icon name="right" size={16} /></button></div>
      </main>
      <aside className="st-aside">
        <section className="scard"><h2>Before you begin</h2>
          <div className="chk"><span className="ic"><Icon name="monitor" size={16} /></span><span>Laptop or desktop computer<small>Phones and tablets are blocked</small></span></div>
          <div className="chk"><span className="ic"><Icon name="clock" size={16} /></span><span>{s.timeLimit ? `A quiet ${s.timeLimit} minutes` : "Time to finish in one sitting"}<small>Stay on this tab throughout</small></span></div>
        </section>
        <section className="scard dark"><span className="eyebrow">Candidate</span><b style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 26, lineHeight: "30px" }}>{c.name}</b><span style={{ fontSize: 13, color: "var(--on-ink-mute)" }}>{c.email}<br />{c.college} · Ref {c.token}</span></section>
      </aside>
    </div></div>;

  if (step === "check") {
    const mob = isMobile() && s.blockMobile, wide = window.innerWidth >= 1024, online = navigator.onLine;
    const row = (ok, icon, title, sub, warnOnly) => <div className={`chk ${ok ? "ok" : warnOnly ? "" : "bad"}`}><span className="ic"><Icon name={ok ? "check" : warnOnly ? icon : "x"} size={16} stroke={2.2} /></span><span><b style={{ fontWeight: 700 }}>{title}</b><small>{sub}</small></span></div>;
    return <div className="st">{top(false)}
      <div className="st-body narrow">
        <div className="qhead"><span className="eyebrow">Step 1 of 2 · System check</span><h1 className="q">Let’s make sure your computer is ready.</h1></div>
        <section className="scard" style={{ gap: 20 }}>
          {row(!mob, "monitor", "Device", mob ? "Mobile or tablet detected — not allowed" : "Desktop / laptop detected")}
          {row(true, "globe", "Browser", browserName())}
          {row(wide, "monitor", "Screen size", wide ? `${window.innerWidth}px wide` : "Small window — maximise for the best experience", true)}
          {row(online, "wifi", "Connection", online ? "Online" : "You appear to be offline")}
        </section>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <button className="sbtn" type="button" onClick={() => toStep("welcome")}><Icon name="left" size={16} /> Back</button>
          <button className="sbtn dark" type="button" disabled={mob || !online} onClick={() => { logEvent("eligible", `Eligibility check passed · Desktop · ${browserName()}`); toStep("rules"); }}>Continue <Icon name="right" size={16} /></button>
        </div>
      </div></div>;
  }

  if (step === "rules") {
    const act = VIOLATION_TEXT[s.onViolation];
    return <div className="st">{top(false)}
      <div className="st-body narrow">
        <div className="qhead"><span className="eyebrow">Step 2 of 2 · Rules &amp; consent</span><h1 className="q">A few rules before you start.</h1></div>
        <section className="scard"><ol className="rules" style={{ margin: 0, padding: 0 }}>
          <li><span><b>Stay on this tab.</b>Leaving the assessment tab or window is recorded. {s.warnings ? `You’ll get ${s.warnings === 1 ? "one warning" : `${s.warnings} warnings`}; after that, switching again will ${act}.` : `Switching will ${act}.`}</span></li>
          <li><span><b>{s.timeLimit ? `${s.timeLimit} minutes in total.` : "No overall time limit."}</b>{s.timeLimit ? "The timer starts when you press Start and keeps running if you leave." : "Take the time you need, but finish in one sitting."}</span></li>
          <li><span><b>{s.mcq + s.written} questions, one at a time.</b>{s.mcq} multiple-choice and {s.written} written{s.written ? ` (up to ${s.wordLimit || "any number of"} words each)` : ""}.</span></li>
          <li><span><b>{s.resume ? "Answers save as you go." : "Finish in one go."}</b>{s.resume ? "If your connection drops, reopen the same link to continue." : "Refreshing or closing the page will end the assessment."}</span></li>
        </ol></section>
        <label className="consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>I agree that my answers and activity during this assessment (such as tab switches) are recorded and reviewed by Juris Consultants’ HR team for this hiring process.</span></label>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <button className="sbtn" type="button" onClick={() => toStep("check")}><Icon name="left" size={16} /> Back</button>
          <button className="sbtn dark" type="button" disabled={!consent || busy} onClick={start}>{busy ? "Starting…" : "Start assessment"} <Icon name="right" size={16} /></button>
        </div>
      </div></div>;
  }

  /* ---------- in assessment ---------- */
  const sections = SECTIONS.map(([type, name]) => {
    const list = questions.filter((q) => q.type === type);
    return { type, name, total: list.length, done: list.filter((q) => isAnswered(q, answers)).length };
  }).filter((x) => x.total);
  const segs = <div className="segs" style={{ gridTemplateColumns: sections.map((x) => `${x.total}fr`).join(" ") }}>{sections.map((x) => <div key={x.type}><i style={{ width: `${Math.round((x.done / x.total) * 100)}%` }} /></div>)}</div>;
  const modals = <>
    {modal?.kind === "warn" && <Modal locked className="light"><div className="warn-ic"><Icon name="warn" size={26} stroke={2} /></div><div className="modal-h"><h2>You left the assessment tab</h2></div><p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--sbody)" }}>{modal.text}</p><div className="modal-f"><button className="sbtn dark" type="button" onClick={() => setModal(null)}>I understand — continue</button></div></Modal>}
    {modal?.kind === "reset" && <Modal locked className="light"><div className="warn-ic"><Icon name="refresh" size={26} stroke={2} /></div><div className="modal-h"><h2>Your assessment was reset</h2></div><p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--sbody)" }}>You switched tabs again, so your answers were cleared and a new set of questions has been prepared. Please stay on this tab.</p><div className="modal-f"><button className="sbtn dark" type="button" onClick={() => setModal(null)}>Start again</button></div></Modal>}
    {modal?.kind === "submit" && <Modal className="light" onClose={() => !busy && setModal(null)}><div className="modal-h"><h2>Submit your assessment?</h2><button className="x" type="button" onClick={() => setModal(null)} aria-label="Close"><Icon name="x" size={16} /></button></div><p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--sbody)" }}>Your answers go to the Juris Consultants HR team. You won’t be able to make changes after this.</p><div className="modal-f"><button className="sbtn" type="button" onClick={() => setModal(null)}>Not yet</button><button className="sbtn dark" type="button" disabled={busy} onClick={() => submit(false)}>{busy ? "Submitting…" : "Yes, submit"}</button></div></Modal>}
  </>;

  if (step === "review") {
    const missing = questions.filter((q) => !isAnswered(q, answers)).length;
    const tooLong = questions.filter((q) => overLimit(q, answers, s.wordLimit)).length;
    return <div className="st">{top(true)}<div className="st-body narrow">
      <div className="qhead"><span className="eyebrow">Final step · Review</span><h1 className="q">Check your answers, then submit.</h1>
        <p style={{ fontSize: 15, color: "var(--sbody)" }}>{tooLong ? `${tooLong} written answer${tooLong > 1 ? "s are" : " is"} over the ${s.wordLimit}-word limit. Shorten ${tooLong > 1 ? "them" : "it"} before submitting.` : missing ? `${missing} question${missing > 1 ? "s are" : " is"} still unanswered. You can go back to ${missing > 1 ? "them" : "it"} or submit as is.` : "All questions answered. Once you submit, you can’t change your answers."}</p></div>
      <section className="scard"><div className="review-list">{questions.map((q, k) => {
        const long = overLimit(q, answers, s.wordLimit), ok = isAnswered(q, answers);
        return <div key={q.id}>
          <span><span className="mono" style={{ fontSize: 12, color: "var(--sgold)", marginRight: 12 }}>{pad(k + 1)}</span>{TYPE_LABEL[q.type]} — {q.text.length > 70 ? `${q.text.slice(0, 70)}…` : q.text}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 12 }}><span className={ok && !long ? "ok" : "no"}>{long ? "Too long" : ok ? "Answered" : "Missing"}</span><a href="#" onClick={(e) => { e.preventDefault(); go(k); }} style={{ fontSize: 13, fontWeight: 700 }}>Edit</a></span>
        </div>;
      })}</div></section>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <button className="sbtn" type="button" onClick={() => go(questions.length - 1)}><Icon name="left" size={16} /> Back</button>
        <button className="sbtn dark" type="button" disabled={tooLong > 0} onClick={() => setModal({ kind: "submit" })}>Submit assessment <Icon name="check" size={16} stroke={2.2} /></button>
      </div>
    </div>{modals}</div>;
  }

  const q = questions[idx];
  if (!q) return null;
  const sectionNo = sections.findIndex((x) => x.type === q.type);
  const last = idx === questions.length - 1;
  const next = () => {
    if (q.type === "mcq" && !isAnswered(q, answers)) return toast("Choose an answer to continue.", true);
    if (overLimit(q, answers, s.wordLimit)) return toast(`Please keep your answer within ${s.wordLimit} words.`, true);
    if (last) { flush(); toStep("review"); } else go(idx + 1);
  };
  const n = words(answers[q.id]);

  return <div className="st">{top(true)}<div className="st-body">
    <main className="st-main">
      <div className="qhead"><div className="row eyebrow"><span>{sections[sectionNo]?.name} · Question {idx + 1} of {questions.length}</span><span>Section {sectionNo + 1} of {sections.length}</span></div>{segs}</div>
      {q.type === "mcq"
        ? <fieldset className="opts"><legend className="sr">Choose one answer</legend><h1 className="q" style={{ marginBottom: 16 }}>{q.text}</h1>
          {q.options.map((o, k) => <label className="opt" key={k}><input type="radio" name={`opt-${q.id}`} checked={answers[q.id] === k} onChange={() => setAnswer(q, k, true)} /><span className="k">{"ABCD"[k]}</span><span>{o}</span></label>)}
        </fieldset>
        : <><h1 className="q">{q.text}</h1>
          <label className="sr" htmlFor="wtext">Your answer</label>
          <textarea className="stext" id="wtext" key={q.id} autoFocus placeholder="Write your answer here…" value={answers[q.id] || ""} onChange={(e) => setAnswer(q, e.target.value)} />
          <div className={`wc ${overLimit(q, answers, s.wordLimit) ? "over" : ""}`}><span>Be specific — short real examples work best.</span><span>{s.wordLimit ? `${n} / ${s.wordLimit} words` : `${n} words`}</span></div></>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <button className="sbtn" type="button" disabled={idx === 0} onClick={() => go(idx - 1)}><Icon name="left" size={16} /> Previous</button>
        <button className="sbtn dark" type="button" onClick={next}>{last ? "Review answers" : "Save & continue"} <Icon name="right" size={16} /></button>
      </div>
    </main>
    <aside className="st-aside">
      <section className="scard"><h2>Your progress</h2>
        <nav className="qnav" aria-label="Questions">{questions.map((x, k) => { const ok = isAnswered(x, answers); return <button key={x.id} type="button" className={k === idx ? "cur" : ok ? "done" : ""} onClick={() => go(k)} aria-label={`Question ${k + 1}${ok ? ", answered" : ""}${k === idx ? ", current" : ""}`} aria-current={k === idx ? "step" : undefined}>{k + 1}</button>; })}</nav>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{sections.map((x) => <div className="srow" key={x.type}><span>{TYPE_LABEL[x.type]}</span><b>{x.done} / {x.total}</b></div>)}</div>
      </section>
      <section className="scard" style={{ background: "transparent", gap: 10, fontSize: 13, lineHeight: "20px", color: "var(--sbody)" }}>
        <b style={{ color: "var(--sink)", fontSize: 14 }}>Reminders</b>
        <span>Stay on this tab until you submit.{warnings > 0 && <> <b style={{ color: "var(--amber)" }}>Warnings used: {warnings}.</b></>}</span>
        <span>Your answers save automatically.</span>
      </section>
    </aside>
  </div>{modals}</div>;
}

function Notice({ header, icon, bad, eyebrow, title, reference, children }) {
  return <div className="st">{header}<div className="center-st"><div className="center-card">
    <div className={`seal${bad ? " bad" : ""}`}><Icon name={icon} size={36} stroke={1.6} /></div>
    <span className="eyebrow" style={bad ? { color: "var(--danger)" } : undefined}>{eyebrow}</span>
    <h1>{title}</h1>
    <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--sbody)" }}>{children}</p>
    {reference && <p style={{ fontSize: 13, color: "var(--smuted)" }}>Reference {reference}</p>}
  </div></div></div>;
}
