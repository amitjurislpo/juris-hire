"use client";

import { SETTING_LIMITS } from "../../../lib/domain";
import { AdminOnly, usePortal } from "../../portal";

function Settings() {
  const { ws, op } = usePortal();
  const s = ws.settings;
  const save = (patch) => op("saveSettings", { settings: { ...s, ...patch } });
  const active = (t) => ws.questions.filter((q) => q.type === t && q.active).length;

  const step = (k) => { const [mn, mx] = SETTING_LIMITS[k]; return <div className="stepper">
    <button type="button" aria-label="Decrease" disabled={s[k] <= mn} onClick={() => save({ [k]: Math.max(mn, s[k] - 1) })}>−</button><output>{s[k]}</output>
    <button type="button" aria-label="Increase" disabled={s[k] >= mx} onClick={() => save({ [k]: Math.min(mx, s[k] + 1) })}>+</button></div>; };
  const sw = (k) => <button type="button" className="switch" role="switch" aria-checked={s[k]} onClick={() => save({ [k]: !s[k] })} />;
  const seg = (k, opts) => <div className="tabs">{opts.map(([v, label]) => <button key={v} type="button" className={s[k] === v ? "on" : ""} aria-pressed={s[k] === v} onClick={() => save({ [k]: v })}>{label}</button>)}</div>;
  const row = (t, d, ctl) => <div className="set-row"><div className="txt"><b>{t}</b><small>{d}</small></div><div className="ctl">{ctl}</div></div>;

  return <>
    <header className="ph"><div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span className="eyebrow">Applies to new attempts</span><h1>Assessment rules</h1></div></header>
    <div className="split"><div className="l">
      <section className="card pad"><div className="card-h" style={{ marginBottom: 16 }}><h2>Question mix</h2><span className="muted" style={{ fontSize: 13 }}>{s.mcq + s.written + s.video} questions per candidate</span></div>
        <div className="mix">{[["mcq", "Multiple choice"], ["written", "Written"], ["video", "Video"]].map(([k, label]) => <div className="card" key={k}><span className="eyebrow">{label}</span>{step(k)}<small className="muted" style={{ color: active(k) < s[k] ? "var(--warn)" : undefined }}>{active(k)} active in bank{active(k) < s[k] ? " — not enough" : ""}</small></div>)}</div>
        <div style={{ marginTop: 12 }}>{row("Question selection", "How each candidate’s set is drawn from the bank.", seg("selection", [["random", "Fully random"], ["partial", "Partly random"], ["fixed", "Fixed"]]))}</div>
      </section>
      <section className="card pad"><h2 style={{ marginBottom: 8 }}>Timing &amp; resume</h2>
        {row("Overall time limit", "Auto-submits when time runs out.", seg("timeLimit", [[0, "None"], [20, "20 min"], [30, "30 min"], [45, "45 min"]]))}
        {row("Allow resume after interruption", "Answers are saved; reopening the link continues the attempt.", sw("resume"))}
      </section>
      <section className="card pad"><h2 style={{ marginBottom: 8 }}>Tab &amp; device monitoring</h2>
        {row("Warnings before the rule applies", "The first switches show a warning and are logged.", step("warnings"))}
        {row("After warnings are used up", "What happens on the next tab or window switch.", seg("onViolation", [["terminate", "Terminate"], ["reset", "Reset"], ["flag", "Flag only"]]))}
        {row("Block phones and tablets", "Show a desktop-required screen and log the attempt.", sw("blockMobile"))}
      </section>
      <section className="card pad"><h2 style={{ marginBottom: 8 }}>Responses</h2>
        {row("Video length limit", "Recording stops automatically.", seg("videoMax", [[10, "10s"], [15, "15s"], [20, "20s"], [30, "30s"]]))}
        {row("Video retakes", "Times a candidate can re-record before submitting.", seg("retakes", [[0, "None"], [1, "1"], [2, "2"]]))}
        {row("Written answer word limit", "Shown with a live counter.", seg("wordLimit", [[0, "None"], [100, "100"], [150, "150"], [250, "250"]]))}
      </section>
    </div>
    <div className="r">
      <section className="card pad" style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 24 }}><span className="eyebrow">Candidate sees</span>
        <b className="serif" style={{ fontSize: 28, lineHeight: "32px" }}>{s.mcq} MCQ · {s.written} written · {s.video} video</b>
        <div className="kv"><span>Time limit</span><b>{s.timeLimit ? `${s.timeLimit} min` : "None"}</b><span>Warnings</span><b>{s.warnings}</b><span>Then</span><b>{{ terminate: "Terminate", reset: "Reset", flag: "Flag for HR" }[s.onViolation]}</b><span>Video</span><b>{s.videoMax}s · {s.retakes} retake{s.retakes !== 1 ? "s" : ""}</b><span>Word limit</span><b>{s.wordLimit || "None"}</b><span>Mobile</span><b>{s.blockMobile ? "Blocked" : "Allowed"}</b></div>
        <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Changes save instantly. Assessments already in progress keep the rules they started with.</p>
      </section>
    </div></div>
  </>;
}

export default function Page() { return <AdminOnly><Settings /></AdminOnly>; }
