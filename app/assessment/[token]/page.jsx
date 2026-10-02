"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { SUBMITTED, VIOLATION_TEXT, words } from "../../lib/domain";
import { Icon, Modal, fmtDate, mmss, pad, useToast } from "../../components/ui";

const SECTION_NAMES = ["Multiple choice", "Written answer", "Video response"];
const TYPE_ORDER = ["mcq", "written", "video"];
const TYPE_LABEL = { mcq: "Multiple choice", written: "Written", video: "Video" };

function browserName() {
  const u = navigator.userAgent;
  if (/Edg\//.test(u)) return "Edge"; if (/Chrome\//.test(u)) return "Chrome"; if (/Firefox\//.test(u)) return "Firefox"; if (/Safari\//.test(u)) return "Safari"; return "Browser";
}
function isMobile() {
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
}
const supportsMedia = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
const isAnswered = (q, a) => {
  const v = a[q.id];
  if (v === undefined || v === null) return false;
  if (q.type === "written") return words(v) > 0;
  if (q.type === "video") return !!v.dur;
  return true;
};

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
  const [camOk, setCamOk] = useState(null);
  const [modal, setModal] = useState(null);
  const [saveState, setSaveState] = useState("saved");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const offset = useRef(0);
  const pending = useRef({});
  const saveTimer = useRef(null);
  const hiddenAt = useRef(null);
  const submitting = useRef(false);

  const api = useCallback(async (payload) => {
    const r = await fetch(`/api/assessment/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(body.error || "Something went wrong. Please try again."), { status: r.status });
    return body;
  }, [token]);
  const logEvent = useCallback((type, text, warn) => api({ action: "event", type, text, warn }).catch(() => {}), [api]);

  // Applies a server view to local state and picks the right screen.
  const applyView = useCallback((v, preferStep) => {
    setData(v);
    offset.current = new Date(v.serverNow).getTime() - Date.now();
    const st = v.candidate.status;
    if (SUBMITTED.includes(st)) return setStep("done");
    if (st === "terminated") return setStep("ended");
    if (st === "invited") return setStep(v.closed ? "closed" : preferStep || "welcome");
    if (st === "started" && v.attempt) {
      setQuestions(v.attempt.questions);
      setAnswers(v.attempt.answers || {});
      setWarnings(v.attempt.warnings || 0);
      if (preferStep) return setStep(preferStep);
      const first = v.attempt.questions.findIndex((q) => !isAnswered(q, v.attempt.answers || {}));
      setIdx(first < 0 ? v.attempt.questions.length - 1 : first);
      setStep(first < 0 ? "review" : "q");
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/assessment/${token}`, { cache: "no-store" });
        const v = await r.json();
        if (!r.ok) throw new Error(v.error || "This assessment link is unavailable.");
        if (["invited", "started"].includes(v.candidate.status) && v.settings.blockMobile && isMobile()) {
          setData(v); setStep("blocked");
          logEvent("device", `Blocked: opened on a mobile / tablet device (${browserName()})`, true);
          return;
        }
        if (v.candidate.status === "started") return applyView(await api({ action: "resume" }));
        applyView(v);
      } catch (e) { setLoadError(e.message); setStep("error"); }
    })();
  }, [token, api, applyView, logEvent]);

  const inAssessment = step === "q" || step === "review";
  const settings = data?.settings;
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
      if (e.status === 409) { const v = await fetch(`/api/assessment/${token}`, { cache: "no-store" }).then((r) => r.json()); applyView(v); return false; }
      items.forEach(([qid, value]) => { if (!(qid in pending.current)) pending.current[qid] = value; });
      setSaveState("error");
      saveTimer.current = setTimeout(flush, 4000);
      return false;
    }
  }, [api, applyView, token]);
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
    return () => window.removeEventListener("beforeunload", warn);
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
      if (e.status === 409) { const v = await fetch(`/api/assessment/${token}`, { cache: "no-store" }).then((r) => r.json()); applyView(v); }
      else toast(e.message, true);
    } finally { submitting.current = false; setBusy(false); setModal(null); }
  }, [api, applyView, flush, toast, token]);

  /* ---------- timer ---------- */
  useEffect(() => {
    if (!inAssessment) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [inAssessment]);
  const timeLeft = deadline ? Math.max(0, Math.min((settings?.timeLimit || 0) * 60, (deadline - (now + offset.current)) / 1000)) : null;
  useEffect(() => { if (inAssessment && timeLeft !== null && timeLeft <= 0) submit(true); }, [inAssessment, timeLeft, submit]);

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
        else if (r.outcome === "reset") { applyView(r.state, "q"); setIdx(0); setModal({ kind: "reset" }); }
        else applyView(r.state);
      } catch { toast("We couldn’t record your activity. Check your connection.", true); }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [inAssessment, api, applyView, flush, toast]);

  const go = async (k) => { if (k < 0 || k >= questions.length) return; flush(); setIdx(k); setStep("q"); window.scrollTo(0, 0); };
  const toStep = (s) => { setStep(s); window.scrollTo(0, 0); };

  async function start() {
    setBusy(true);
    try { applyView(await api({ action: "start", consent: true, device: `Desktop · ${browserName()}` })); setIdx(0); window.scrollTo(0, 0); }
    catch (e) { toast(e.message, true); }
    finally { setBusy(false); }
  }

  /* ---------- render ---------- */
  if (step === "loading") return <div className="st"><div className="center-st"><p style={{ color: "var(--smuted)" }}>Preparing your assessment…</p></div></div>;
  if (step === "error") return <div className="st"><div className="center-st"><div className="center-card"><div className="seal bad"><Icon name="x" size={36} stroke={1.6} /></div><span className="eyebrow" style={{ color: "var(--danger)" }}>Link unavailable</span><h1>We couldn’t open this assessment.</h1><p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--sbody)" }}>{loadError} If you think this is a mistake, reply to your invitation email.</p></div></div></div>;

  const c = data.candidate, d = data.drive, s = settings;
  const top = (withTimer) => <header className="st-top">
    <div className="brand"><div className="mark">J</div><div><b>{d.name}</b><small>Juris Consultants · {d.college}</small></div></div>
    <div className="st-status">{withTimer
      ? <><span style={{ display: "flex", alignItems: "center", gap: 8 }}><i className="dot" style={{ background: saveState === "error" ? "var(--danger)" : saveState === "saving" ? "var(--sgold)" : undefined }} />{saveState === "error" ? "Not saved — retrying" : saveState === "saving" ? "Saving…" : "Answers saved"}</span>
        <span className={`timer ${timeLeft !== null && timeLeft < 120 ? "low" : ""}`}>{timeLeft !== null ? `${mmss(timeLeft)} left` : `${mmss(Math.max(0, (now + offset.current - new Date(data.attempt?.startedAt || now).getTime()) / 1000))} elapsed`}</span></>
      : <span style={{ display: "flex", alignItems: "center", gap: 8 }}><Icon name="lock" size={14} /> Secure assessment link</span>}</div>
  </header>;

  if (step === "blocked") return <div className="blocked"><div className="center-card">
    <div className="devices"><Icon name="phone" size={40} stroke={1.4} /><Icon name="tablet" size={48} stroke={1.4} /><span style={{ color: "#B4BCCA" }}><Icon name="x" size={28} stroke={2} /></span><Icon name="monitor" size={64} stroke={1.4} /></div>
    <span className="eyebrow">Desktop or laptop required</span>
    <h1>Please reopen this link on a laptop or desktop.</h1>
    <p>This assessment includes a timed section and a short video answer, so it can’t be taken on a phone or tablet. Your link stays valid — just open the same invitation email on a computer.</p>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><button className="sbtn gold" type="button" onClick={async () => { try { await navigator.clipboard.writeText(location.href); toast("Link copied", true); } catch { toast(location.href, true); } }}><Icon name="copy" size={16} /> Copy my link</button></div>
  </div></div>;

  if (step === "closed") return <div className="st">{top(false)}<div className="center-st"><div className="center-card">
    <div className="seal bad"><Icon name="clock" size={36} stroke={1.6} /></div>
    <span className="eyebrow" style={{ color: "var(--danger)" }}>Link closed</span>
    <h1>This assessment is no longer accepting attempts.</h1>
    <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--sbody)" }}>The link for {d.name} closed on {fmtDate(d.closes)}. If you believe you should still have access, reply to your invitation email.</p>
    <p style={{ fontSize: 13, color: "var(--smuted)" }}>Reference {c.token}</p>
  </div></div></div>;

  if (step === "done") return <div className="st">{top(false)}<div className="center-st"><div className="center-card">
    <div className="seal"><Icon name="check" size={36} stroke={1.6} /></div>
    <span className="eyebrow">Assessment submitted</span>
    <h1>Thank you, {c.name.split(" ")[0]}. You’re all done.</h1>
    <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--sbody)" }}>Your responses have reached the Juris Consultants HR team. A confirmation is on its way to <b style={{ color: "var(--sink)" }}>{c.email}</b>. If you’re shortlisted, the team will contact you about a live interview.</p>
    <p style={{ fontSize: 13, color: "var(--smuted)" }}>Reference {c.token} · You can close this tab.</p>
  </div></div></div>;

  if (step === "ended") return <div className="st">{top(false)}<div className="center-st"><div className="center-card">
    <div className="seal bad"><Icon name="x" size={36} stroke={1.6} /></div>
    <span className="eyebrow" style={{ color: "var(--danger)" }}>Assessment ended</span>
    <h1>Your assessment has been closed.</h1>
    <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--sbody)" }}>{data.endReason || "This assessment is no longer available."} Your activity has been shared with the HR team, who will decide on next steps and may contact you.</p>
    <p style={{ fontSize: 13, color: "var(--smuted)" }}>Reference {c.token}</p>
  </div></div></div>;

  if (step === "welcome") return <div className="st">{top(false)}
    <div className="st-body">
      <main className="st-main">
        <div className="hero-st">
          <span className="eyebrow">Welcome, {c.name}</span>
          <h1>Your first-round assessment for <i>{d.name}</i></h1>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: "var(--sbody)", maxWidth: "60ch" }}>This replaces the first HR interview. Answer honestly and in your own words — the HR team reviews every response, including your short video.</p>
        </div>
        <div className="facts">
          <div className="fact"><b>{s.mcq}</b><span>Multiple-choice</span></div>
          <div className="fact"><b>{s.written}</b><span>Written answers</span></div>
          <div className="fact"><b>{s.video}</b><span>Video · {s.videoMax}s max</span></div>
          <div className="fact"><b>{s.timeLimit || "—"}</b><span>{s.timeLimit ? "Minutes" : "No time limit"}</span></div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><button className="sbtn dark" type="button" onClick={() => toStep("check")}>Check my system <Icon name="right" size={16} /></button></div>
      </main>
      <aside className="st-aside">
        <section className="scard"><h2>Before you begin</h2>
          <div className="chk"><span className="ic"><Icon name="monitor" size={16} /></span><span>Laptop or desktop computer<small>Phones and tablets are blocked</small></span></div>
          <div className="chk"><span className="ic"><Icon name="video" size={16} /></span><span>Camera and microphone<small>For one {s.videoMax}-second answer</small></span></div>
          <div className="chk"><span className="ic"><Icon name="clock" size={16} /></span><span>A quiet {s.timeLimit || 30} minutes<small>Stay on this tab throughout</small></span></div>
        </section>
        <section className="scard dark"><span className="eyebrow">Candidate</span><b style={{ fontFamily: "var(--serif)", fontWeight: 400, fontSize: 26, lineHeight: "30px" }}>{c.name}</b><span style={{ fontSize: 13, color: "#B4BCCA" }}>{c.email}<br />{c.college} · Ref {c.token}</span></section>
      </aside>
    </div></div>;

  if (step === "check") {
    const mob = isMobile() && s.blockMobile, media = supportsMedia(), wide = window.innerWidth >= 1024, online = navigator.onLine;
    const needsCam = s.video > 0;
    const ready = !mob && (media || !needsCam) && online;
    const row = (ok, ic, t, sub, warnOnly) => <div className={`chk ${ok ? "ok" : warnOnly ? "" : "bad"}`}><span className="ic"><Icon name={ok ? "check" : warnOnly ? ic : "x"} size={16} stroke={2.2} /></span><span><b style={{ fontWeight: 700 }}>{t}</b><small>{sub}</small></span></div>;
    const testCam = async () => {
      try { const st = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); st.getTracks().forEach((x) => x.stop()); setCamOk(true); logEvent("perm", "Camera & microphone test passed"); }
      catch (e) { setCamOk(false); logEvent("perm", `Camera / microphone unavailable (${e.name || "error"})`, true); }
    };
    return <div className="st">{top(false)}
      <div className="st-body narrow">
        <div className="qhead"><span className="eyebrow">Step 1 of 2 · System check</span><h1 className="q">Let’s make sure your computer is ready.</h1></div>
        <section className="scard" style={{ gap: 20 }}>
          {row(!mob, "monitor", "Device", mob ? "Mobile or tablet detected — not allowed" : "Desktop / laptop detected")}
          {row(media, "globe", "Browser", media ? `${browserName()} supports recording` : "This browser can’t record video — try the latest Chrome or Edge", !needsCam)}
          {row(wide, "monitor", "Screen size", wide ? `${window.innerWidth}px wide` : "Small window — maximise for the best experience", true)}
          {row(online, "wifi", "Connection", online ? "Online" : "You appear to be offline")}
          {needsCam && <div className={`chk ${camOk === true ? "ok" : camOk === false ? "bad" : ""}`}><span className="ic"><Icon name={camOk === true ? "check" : camOk === false ? "x" : "video"} size={16} stroke={2} /></span>
            <span style={{ flex: 1 }}><b style={{ fontWeight: 700 }}>Camera &amp; microphone</b><small>{camOk === true ? "Working — permission granted" : camOk === false ? "Not available. You can still continue and retry at the video question." : "Recommended: test now so the video question goes smoothly"}</small></span>
            {camOk !== true && media && <button className="sbtn" type="button" onClick={testCam} style={{ minHeight: 44 }}>{camOk === false ? "Retry" : "Test"}</button>}</div>}
        </section>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <button className="sbtn" type="button" onClick={() => toStep("welcome")}><Icon name="left" size={16} /> Back</button>
          <button className="sbtn dark" type="button" disabled={!ready} onClick={() => { logEvent("eligible", `Eligibility check passed · Desktop · ${browserName()}`); toStep("rules"); }}>Continue <Icon name="right" size={16} /></button>
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
          <li><span><b>{s.mcq + s.written + s.video} questions, one at a time.</b>{s.mcq} multiple-choice, {s.written} written (up to {s.wordLimit || "any number of"} words each) and {s.video} video.</span></li>
          {s.video > 0 && <li><span><b>One short video answer.</b>Recording stops automatically at {s.videoMax} seconds. {s.retakes ? `You can retake it ${s.retakes === 1 ? "once" : `${s.retakes} times`}.` : "There are no retakes."}</span></li>}
          <li><span><b>{s.resume ? "Answers save as you go." : "Finish in one go."}</b>{s.resume ? "If your connection drops, reopen the same link to continue." : "Refreshing or closing the page will end the assessment."}</span></li>
        </ol></section>
        <label className="consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>I agree that my answers, video response and activity during this assessment (such as tab switches) are recorded and reviewed by Juris Consultants’ HR team for this hiring process.</span></label>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <button className="sbtn" type="button" onClick={() => toStep("check")}><Icon name="left" size={16} /> Back</button>
          <button className="sbtn dark" type="button" disabled={!consent || busy} onClick={start}>{busy ? "Starting…" : "Start assessment"} <Icon name="right" size={16} /></button>
        </div>
      </div></div>;
  }

  /* ---------- in assessment ---------- */
  const counts = TYPE_ORDER.map((t) => questions.filter((q) => q.type === t).length);
  const starts = [0, counts[0], counts[0] + counts[1]];
  const doneIn = (k) => questions.slice(starts[k], starts[k] + counts[k]).filter((q) => isAnswered(q, answers)).length;
  const segs = <div className="segs" style={{ gridTemplateColumns: counts.filter(Boolean).map((n) => `${n}fr`).join(" ") }}>{counts.map((n, k) => n ? <div key={k}><i style={{ width: `${Math.round((doneIn(k) / n) * 100)}%` }} /></div> : null)}</div>;
  const modals = <>
    {modal?.kind === "warn" && <Modal locked className="light"><div className="warn-ic"><Icon name="warn" size={26} stroke={2} /></div><div className="modal-h"><h2>You left the assessment tab</h2></div><p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--sbody)" }}>{modal.text}</p><div className="modal-f"><button className="sbtn dark" type="button" onClick={() => setModal(null)}>I understand — continue</button></div></Modal>}
    {modal?.kind === "reset" && <Modal locked className="light"><div className="warn-ic"><Icon name="refresh" size={26} stroke={2} /></div><div className="modal-h"><h2>Your assessment was reset</h2></div><p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--sbody)" }}>You switched tabs again, so your answers were cleared and a new set of questions has been prepared. Please stay on this tab.</p><div className="modal-f"><button className="sbtn dark" type="button" onClick={() => setModal(null)}>Start again</button></div></Modal>}
    {modal?.kind === "submit" && <Modal className="light" onClose={() => !busy && setModal(null)}><div className="modal-h"><h2>Submit your assessment?</h2><button className="x" type="button" onClick={() => setModal(null)} aria-label="Close"><Icon name="x" size={16} /></button></div><p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--sbody)" }}>Your answers and video go to the Juris Consultants HR team. You won’t be able to make changes after this.</p><div className="modal-f"><button className="sbtn" type="button" onClick={() => setModal(null)}>Not yet</button><button className="sbtn dark" type="button" disabled={busy} onClick={() => submit(false)}>{busy ? "Submitting…" : "Yes, submit"}</button></div></Modal>}
  </>;

  if (step === "review") {
    const missing = questions.filter((q) => !isAnswered(q, answers)).length;
    return <div className="st">{top(true)}<div className="st-body narrow">
      <div className="qhead"><span className="eyebrow">Final step · Review</span><h1 className="q">Check your answers, then submit.</h1>
        <p style={{ fontSize: 15, color: "var(--sbody)" }}>{missing ? `${missing} question${missing > 1 ? "s are" : " is"} still unanswered. You can go back to ${missing > 1 ? "them" : "it"} or submit as is.` : "All questions answered. Once you submit, you can’t change your answers."}</p></div>
      <section className="scard"><div className="review-list">{questions.map((q, k) => { const ok = isAnswered(q, answers); return <div key={q.id}>
        <span><span className="mono" style={{ fontSize: 12, color: "var(--sgold)", marginRight: 12 }}>{pad(k + 1)}</span>{TYPE_LABEL[q.type]} — {q.text.length > 70 ? `${q.text.slice(0, 70)}…` : q.text}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}><span className={ok ? "ok" : "no"}>{ok ? "Answered" : "Missing"}</span><a href="#" onClick={(e) => { e.preventDefault(); go(k); }} style={{ fontSize: 13, fontWeight: 700 }}>Edit</a></span>
      </div>; })}</div></section>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <button className="sbtn" type="button" onClick={() => go(questions.length - 1)}><Icon name="left" size={16} /> Back</button>
        <button className="sbtn dark" type="button" onClick={() => setModal({ kind: "submit" })}>Submit assessment <Icon name="check" size={16} stroke={2.2} /></button>
      </div>
    </div>{modals}</div>;
  }

  const q = questions[idx];
  if (!q) return null;
  const sec = TYPE_ORDER.indexOf(q.type);
  const last = idx === questions.length - 1;
  const next = () => {
    if (q.type === "mcq" && !isAnswered(q, answers)) return toast("Choose an answer to continue.", true);
    if (q.type === "written" && s.wordLimit && words(answers[q.id]) > s.wordLimit) return toast(`Please keep your answer within ${s.wordLimit} words.`, true);
    if (last) { flush(); toStep("review"); } else go(idx + 1);
  };
  let body;
  if (q.type === "mcq") body = <fieldset className="opts"><legend className="sr">Choose one answer</legend><h1 className="q" style={{ marginBottom: 16 }}>{q.text}</h1>
    {q.options.map((o, k) => <label className="opt" key={k}><input type="radio" name={`opt-${q.id}`} checked={answers[q.id] === k} onChange={() => setAnswer(q, k, true)} /><span className="k">{"ABCD"[k]}</span><span>{o}</span></label>)}
  </fieldset>;
  else if (q.type === "written") {
    const n = words(answers[q.id]);
    body = <><h1 className="q">{q.text}</h1>
      <label className="sr" htmlFor="wtext">Your answer</label>
      <textarea className="stext" id="wtext" autoFocus placeholder="Write your answer here…" value={answers[q.id] || ""} onChange={(e) => setAnswer(q, e.target.value)} />
      <div className={`wc ${s.wordLimit && n > s.wordLimit ? "over" : ""}`}><span>Be specific — short real examples work best.</span><span>{s.wordLimit ? `${n} / ${s.wordLimit} words` : `${n} words`}</span></div></>;
  } else body = <VideoQuestion key={q.id} q={q} token={token} settings={s} saved={answers[q.id]} takes={data.attempt?.videoTakes || 0}
    onSaved={(dur, takes) => { setAnswers((a) => ({ ...a, [q.id]: { dur } })); setData((v) => ({ ...v, attempt: { ...v.attempt, videoTakes: takes } })); }}
    onDone={() => (last ? toStep("review") : go(idx + 1))} onPrev={() => go(idx - 1)} logEvent={logEvent} />;

  return <div className="st">{top(true)}<div className="st-body">
    <main className="st-main">
      <div className="qhead"><div className="row eyebrow"><span>{SECTION_NAMES[sec]} · Question {idx + 1} of {questions.length}</span><span>Section {counts.slice(0, sec + 1).filter(Boolean).length} of {counts.filter(Boolean).length}</span></div>{segs}</div>
      {body}
      {q.type !== "video" && <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <button className="sbtn" type="button" disabled={idx === 0} onClick={() => go(idx - 1)}><Icon name="left" size={16} /> Previous</button>
        <button className="sbtn dark" type="button" onClick={next}>{last ? "Review answers" : "Save & continue"} <Icon name="right" size={16} /></button>
      </div>}
    </main>
    <aside className="st-aside">
      <section className="scard"><h2>Your progress</h2>
        <nav className="qnav" aria-label="Questions">{questions.map((x, k) => { const ok = isAnswered(x, answers); return <button key={x.id} type="button" className={k === idx ? "cur" : ok ? "done" : ""} onClick={() => go(k)} aria-label={`Question ${k + 1}${ok ? ", answered" : ""}${k === idx ? ", current" : ""}`} aria-current={k === idx ? "step" : undefined}>{x.type === "video" ? <Icon name="video" size={16} stroke={2} /> : k + 1}</button>; })}</nav>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{TYPE_ORDER.map((t, k) => counts[k] ? <div className="srow" key={t}><span>{TYPE_LABEL[t]}</span><b>{doneIn(k)} / {counts[k]}</b></div> : null)}</div>
      </section>
      <section className="scard" style={{ background: "transparent", gap: 10, fontSize: 13, lineHeight: "20px", color: "var(--sbody)" }}>
        <b style={{ color: "var(--sink)", fontSize: 14 }}>Reminders</b>
        <span>Stay on this tab until you submit.{warnings > 0 && <> <b style={{ color: "#8A5A12" }}>Warnings used: {warnings}.</b></>}</span>
        <span>Your answers save automatically.</span>
      </section>
    </aside>
  </div>{modals}</div>;
}

/* ---------- video question ---------- */
function VideoQuestion({ q, token, settings: s, saved, takes, onSaved, onDone, onPrev, logEvent }) {
  const [state, setState] = useState(saved ? "recorded" : "idle");
  const [err, setErr] = useState("");
  const [url, setUrl] = useState(null);
  const [dur, setDur] = useState(saved?.dur || 0);
  const [elapsed, setElapsed] = useState(0);
  const stream = useRef(null), rec = useRef(null), tick = useRef(null), t0 = useRef(0), blob = useRef(null), live = useRef(null);
  const left = s.retakes + 1 - takes;

  const stopStream = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  useEffect(() => () => { clearInterval(tick.current); if (rec.current?.state === "recording") try { rec.current.stop(); } catch {} stopStream(); }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => { if (live.current && stream.current) { live.current.srcObject = stream.current; live.current.play().catch(() => {}); } }, [state]);

  async function camOn() {
    if (!supportsMedia()) { setState("error"); setErr("not supported"); logEvent("perm", "Recording not supported in this browser", true); return; }
    try { stream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); setState("ready"); logEvent("perm", "Camera & microphone granted"); }
    catch (e) { setState("error"); setErr(e.name || "error"); logEvent("perm", `Camera / microphone unavailable (${e.name || "error"})`, true); }
  }
  async function upload(seconds, auto) {
    setState("uploading");
    try {
      const r = await fetch(`/api/assessment/${token}/video`, { method: "POST", headers: { "Content-Type": blob.current.type || "video/webm", "X-Recording-Seconds": String(seconds), ...(auto ? { "X-Auto-Stopped": "1" } : {}) }, body: blob.current });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || "Upload failed.");
      onSaved(body.dur, body.videoTakes);
      setState("recorded");
    } catch (e) { setErr(e.message); setState("uploadfail"); }
  }
  function startRec() {
    const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
    const mt = types.find((t) => MediaRecorder.isTypeSupported?.(t));
    const chunks = [];
    let auto = false;
    try { rec.current = new MediaRecorder(stream.current, mt ? { mimeType: mt } : undefined); }
    catch (e) { setState("error"); setErr(e.name || "recorder"); return; }
    rec.current.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    rec.current.onstop = () => {
      clearInterval(tick.current);
      const seconds = Math.max(1, Math.min(s.videoMax, Math.round((Date.now() - t0.current) / 1000)));
      blob.current = new Blob(chunks, { type: (rec.current.mimeType || "video/webm").split(";")[0] });
      stopStream();
      setDur(seconds);
      setUrl(URL.createObjectURL(blob.current));
      if (!blob.current.size) { setState("error"); setErr("empty recording"); return; }
      upload(seconds, auto);
    };
    rec.current.start(250);
    t0.current = Date.now(); setElapsed(0); setState("recording");
    tick.current = setInterval(() => {
      const el = (Date.now() - t0.current) / 1000;
      setElapsed(el);
      if (el >= s.videoMax && rec.current?.state === "recording") { auto = true; rec.current.stop(); }
    }, 100);
  }
  const stopRec = () => { if (rec.current?.state === "recording") rec.current.stop(); };
  async function retake() { if (url) URL.revokeObjectURL(url); setUrl(null); await camOn(); }

  let stage, ctl, note;
  if (state === "idle") {
    stage = <div className="ph-person"><Icon name="video" size={56} stroke={1.2} /><span>Your camera is off</span></div>;
    ctl = <button className="sbtn gold" type="button" onClick={camOn}><Icon name="video" size={16} /> Turn on camera &amp; mic</button>;
    note = "Your browser will ask for permission. Nothing is recorded until you press Start.";
  } else if (state === "error") {
    stage = <div className="ph-person" style={{ color: "#B4BCCA" }}><Icon name="warn" size={48} stroke={1.4} /><span style={{ maxWidth: "40ch" }}>We couldn’t access your camera or microphone{err ? ` (${err})` : ""}. Check browser permissions and try again.</span></div>;
    ctl = <button className="sbtn gold" type="button" onClick={camOn}><Icon name="refresh" size={16} /> Try again</button>;
    note = "This attempt is recorded for HR so a technical issue isn’t mistaken for a skipped question.";
  } else if (state === "ready") {
    stage = <><video ref={live} playsInline muted autoPlay /><span className="cam-tag" style={{ position: "absolute", left: 20, top: 20 }}><Icon name="mic" size={14} stroke={2} /> Camera ready</span></>;
    ctl = <button className="sbtn gold" type="button" onClick={startRec}><span style={{ width: 12, height: 12, borderRadius: "50%", background: "#C2412B" }} /> Start recording</button>;
    note = `Recording stops automatically at ${s.videoMax} seconds.`;
  } else if (state === "recording") {
    const frac = Math.min(1, elapsed / s.videoMax);
    stage = <><video ref={live} playsInline muted autoPlay /><span className="rec"><i />REC</span>
      <div className="ring"><svg width="104" height="104" viewBox="0 0 104 104"><circle cx="52" cy="52" r="44" fill="#121722" stroke="#2A3345" strokeWidth="6" /><circle cx="52" cy="52" r="44" fill="none" stroke="#D6B46C" strokeWidth="6" strokeLinecap="round" strokeDasharray="276.5" strokeDashoffset={276.5 * (1 - frac)} /></svg><b><span>0:{pad(Math.min(s.videoMax, Math.floor(elapsed)))}</span><small>of 0:{pad(s.videoMax)}</small></b></div></>;
    ctl = <button className="sbtn" type="button" onClick={stopRec} style={{ background: "var(--ivory)" }}><span style={{ width: 12, height: 12, borderRadius: 3, background: "var(--sink)" }} /> Stop</button>;
    note = "Speak clearly and look at the camera.";
  } else if (state === "uploading") {
    stage = url ? <video className="play" src={url} playsInline muted /> : null;
    ctl = <span className="cam-tag">Saving your recording…</span>;
    note = "Please keep this tab open while your video uploads.";
  } else if (state === "uploadfail") {
    stage = url ? <video className="play" src={url} controls playsInline /> : null;
    ctl = <button className="sbtn gold" type="button" onClick={() => upload(dur, false)}><Icon name="refresh" size={16} /> Retry upload</button>;
    note = `Your recording didn’t upload (${err}). Check your connection and retry.`;
  } else {
    stage = url ? <video className="play" src={url} controls playsInline /> : <div className="ph-person" style={{ color: "#B4BCCA" }}><Icon name="check" size={48} stroke={1.4} /><span>Recording saved · {dur}s</span></div>;
    ctl = <>{left > 0 && <button className="sbtn" type="button" onClick={retake} style={{ background: "var(--ivory)" }}><Icon name="refresh" size={16} /> Retake ({left} left)</button>}<button className="sbtn gold" type="button" onClick={onDone}>Use this answer <Icon name="right" size={16} /></button></>;
    note = `Recorded ${dur} seconds. ${left > 0 ? "Watch it back, then keep it or retake." : "No retakes left — this answer will be submitted."}`;
  }
  return <>
    <h1 className="q">{q.text}</h1>
    <section className="cam" aria-label="Camera">{stage}<div className="cam-bar"><span /><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{ctl}</div></div></section>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <p style={{ fontSize: 14, color: "var(--sbody)" }}>{note}</p>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="sbtn" type="button" onClick={onPrev} disabled={state === "recording" || state === "uploading"}><Icon name="left" size={16} /> Previous</button>
        {!saved && state !== "recording" && state !== "uploading" && <button className="sbtn" type="button" onClick={onDone}>Skip for now <Icon name="right" size={16} /></button>}
      </div>
    </div>
  </>;
}
