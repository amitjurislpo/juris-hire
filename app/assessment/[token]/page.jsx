"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleAlert, Clock3, Mic, Monitor, ShieldCheck, Video, X } from "lucide-react";

export default function AssessmentPage() {
  const { token } = useParams();
  const [assessment, setAssessment] = useState(null);
  const [responses, setResponses] = useState({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState(0);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(15);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoSaved, setVideoSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const questions = assessment?.questions || [];
  const question = questions[questionIndex];

  const refreshDeviceEligibility = useCallback(() => {
    const mobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
    setUnsupported(mobile);
  }, []);

  useEffect(() => {
    refreshDeviceEligibility();
    window.addEventListener("resize", refreshDeviceEligibility);
    fetch(`/api/assessment/${token}`).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "This assessment link is unavailable.");
      setAssessment(body);
      setResponses(body.candidate.responses || {});
      setStarted(body.candidate.status === "Assessment Started");
      setVideoSaved(body.candidate.videoRecorded);
      if (body.candidate.status === "Assessment Completed") setQuestionIndex(body.questions.length);
      else {
        const nextQuestion = body.questions.findIndex((item) => item.type === "video"
          ? !body.candidate.videoRecorded
          : body.candidate.responses?.[item.id] === undefined || body.candidate.responses?.[item.id] === "");
        setQuestionIndex(nextQuestion < 0 ? body.questions.length - 1 : nextQuestion);
      }
    }).catch((fetchError) => setError(fetchError.message)).finally(() => setLoading(false));
    return () => window.removeEventListener("resize", refreshDeviceEligibility);
  }, [refreshDeviceEligibility, token]);

  useEffect(() => {
    if (!started || !question || question.type === "video" || responses[question.id] === undefined) return;
    const timeout = window.setTimeout(() => {
      fetch(`/api/assessment/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "answer", questionId: question.id, answer: responses[question.id] }) });
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [question, responses, started, token]);

  useEffect(() => {
    if (!started) return;
    const onVisibilityChange = async () => {
      if (document.visibilityState !== "hidden") return;
      try {
        const response = await fetch(`/api/assessment/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "event", event: "visibilitychange" }) });
        const result = await response.json();
        setWarning(result.flags || 1);
        if (result.status === "Assessment Terminated") setAssessment((current) => ({ ...current, candidate: { ...current.candidate, status: result.status } }));
      } catch {
        setError("We could not record your activity. Check your connection before continuing.");
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [started, token]);

  useEffect(() => () => {
    window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function beginAssessment() {
    setError("");
    const response = await fetch(`/api/assessment/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
    const result = await response.json();
    if (!response.ok) return setError(result.error);
    setStarted(true);
  }

  function updateResponse(value) {
    setResponses((current) => ({ ...current, [question.id]: value }));
  }

  async function goToQuestion(index) {
    setError("");
    if (question && question.type !== "video" && responses[question.id] !== undefined) {
      await fetch(`/api/assessment/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "answer", questionId: question.id, answer: responses[question.id] }) });
    }
    setQuestionIndex(index);
  }

  async function startRecording() {
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("This browser does not support camera recording. Please use a current desktop browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 }, audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        window.clearInterval(timerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
        if (!blob.size) return setError("No recording was captured. Please try again.");
        const localUrl = URL.createObjectURL(blob);
        setVideoUrl(localUrl);
        try {
          const saved = await fetch(`/api/assessment/${token}/video`, { method: "POST", headers: { "Content-Type": blob.type, "X-Recording-Seconds": String(15 - seconds) }, body: blob });
          const result = await saved.json();
          if (!saved.ok) throw new Error(result.error);
          setVideoSaved(true);
        } catch (saveError) {
          setError(saveError.message || "We couldn't save your recording. Try recording again.");
          setVideoSaved(false);
        }
      };
      recorder.start();
      setRecording(true);
      setSeconds(15);
      const startedAt = Date.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(Math.max(0, 15 - elapsed));
        if (elapsed >= 15 && recorder.state === "recording") {
          recorder.stop();
          setRecording(false);
        }
      }, 200);
    } catch (recordError) {
      setError(recordError.message.includes("Permission") || recordError.name === "NotAllowedError" ? "Camera and microphone permission is required for the video question." : recordError.message);
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setRecording(false);
  }

  async function submitAssessment() {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/assessment/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "submit" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setAssessment((current) => ({ ...current, candidate: { ...current.candidate, status: result.status } }));
      setQuestionIndex(questions.length);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="assessment-shell"><div className="assessment-card assessment-loading">Preparing your assessment…</div></main>;
  if (error && !assessment) return <main className="assessment-shell"><div className="assessment-card assessment-message"><span className="assessment-brand">J<span>.</span> JURIS HIRE</span><CircleAlert /><h1>Assessment link unavailable</h1><p>{error}</p></div></main>;
  if (!assessment) return null;

  const { candidate } = assessment;
  const completed = candidate.status === "Assessment Completed" || questionIndex >= questions.length;
  const terminated = candidate.status === "Assessment Terminated";
  const answeredCount = questions.filter((item) => item.type === "video" ? videoSaved : responses[item.id] !== undefined && responses[item.id] !== "").length;

  return <main className="assessment-shell">
    <header className="assessment-top"><a href="/" className="assessment-brand">J<span>.</span> <b>JURIS HIRE</b></a><span>COLLEGE HIRING · SALES TEAM</span></header>
    <section className="assessment-layout">
      <div className="assessment-intro"><p className="eyebrow">JURIS CONSULTANTS · FIRST-ROUND SCREENING</p><h1>Show us how<br />you <em>think.</em></h1><p>A short, structured assessment to help us get to know you beyond your CV.</p><div className="assessment-stages"><span><i>01</i> Your approach</span><span><i>02</i> Your answers</span><span><i>03</i> Your introduction</span></div></div>
      <article className="assessment-card">
        <div className="assessment-card-head"><span>SALES TEAM ASSESSMENT</span><span><Clock3 size={14} /> About 10 min</span></div>
        {unsupported ? <div className="assessment-message"><span className="assessment-state-icon"><Monitor size={22} /></span><h2>Please switch to a computer.</h2><p>This assessment is available on a laptop or desktop browser. Your answers will be ready when you return on a supported device.</p></div>
          : terminated ? <div className="assessment-message"><span className="assessment-state-icon warning-icon"><CircleAlert size={22} /></span><h2>Assessment paused for review.</h2><p>Several visibility changes were recorded. Your assessment is saved and the recruitment team will review the activity before taking the next step.</p></div>
            : completed ? <div className="assessment-message"><span className="assessment-state-icon"><Check size={22} /></span><h2>You're all set, {candidate.name.split(" ")[0]}.</h2><p>Your responses have been submitted to the Juris Consultants recruitment team. Thank you for taking the time to complete the assessment.</p><div className="submission-receipt"><Check size={15} />Assessment submitted successfully</div></div>
              : !started ? <div className="instructions"><span className="assessment-state-icon"><ShieldCheck size={22} /></span><p className="eyebrow">WELCOME, {candidate.name.toUpperCase()}</p><h2>A few things before you begin.</h2><p className="instructions-copy">This assessment includes 6 multiple-choice questions, 3 short written responses, and one video response of up to 15 seconds.</p><ul><li><Check size={14} />Use a quiet place and keep this tab open.</li><li><Check size={14} />Your progress is saved as you go. You can resume this link.</li><li><Check size={14} />The video response needs camera and microphone access.</li><li><Check size={14} />A visibility change is recorded for HR review; it is not proof of misconduct.</li></ul><label className="consent-check"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I understand and consent to my assessment responses and activity being reviewed by the hiring team.</span></label><button className="assessment-primary" disabled={!consent} onClick={beginAssessment}>Begin assessment <ArrowRight size={16} /></button></div>
                : <div className="question-view"><div className="question-progress"><div><span>QUESTION {questionIndex + 1} <i>OF {questions.length}</i></span><strong>{answeredCount} of {questions.length} complete</strong></div><div className="question-progress-track"><i style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }} /></div></div><p className="question-category">{question.type === "mcq" ? "MULTIPLE CHOICE" : question.type === "written" ? "SHORT ANSWER" : "VIDEO RESPONSE"} <i /> {question.category}</p><h2 className="question-prompt">{question.text}</h2>
                  {question.type === "mcq" && <div className="answer-options">{question.options.map((option, optionIndex) => <label className={`answer-option ${Number(responses[question.id]) === optionIndex ? "selected" : ""}`} key={option}><input type="radio" name={question.id} checked={Number(responses[question.id]) === optionIndex} onChange={() => updateResponse(optionIndex)} /><span>{String.fromCharCode(65 + optionIndex)}</span><b>{option}</b></label>)}</div>}
                  {question.type === "written" && <div className="written-answer"><textarea value={responses[question.id] || ""} onChange={(event) => updateResponse(event.target.value)} placeholder="Write your response here…" maxLength={1200} rows={6} /><small>{(responses[question.id] || "").length} / 1,200</small></div>}
                  {question.type === "video" && <div className="video-recorder">{videoUrl ? <video src={videoUrl} controls playsInline /> : videoSaved ? <video src={`/api/assessment/${token}/video`} controls playsInline /> : <div className="video-placeholder"><Video size={24} /><span>Your 15-second introduction will appear here.</span></div>}{recording ? <div className="recording-state"><i /> Recording · 00:{String(seconds).padStart(2, "0")}</div> : <div className="recording-actions"><button className="record-button" onClick={startRecording}><span><Video size={15} /></span>{videoSaved ? "Record again" : "Enable camera & record"}</button><small><Mic size={13} /> Camera and microphone permission required</small></div>}{recording && <button className="stop-recording" onClick={stopRecording}><span /> Stop recording</button>}{videoSaved && !recording && <p className="saved-recording"><Check size={13} />Recording saved · max 15 seconds</p>}</div>}
                  <div className="question-navigation"><button className="back-question" disabled={questionIndex === 0} onClick={() => goToQuestion(questionIndex - 1)}><ArrowLeft size={15} />Back</button>{questionIndex < questions.length - 1 ? <button className="assessment-primary" disabled={question.type === "video" ? !videoSaved : responses[question.id] === undefined || responses[question.id] === ""} onClick={() => goToQuestion(questionIndex + 1)}>Save & continue <ArrowRight size={15} /></button> : <button className="assessment-primary" disabled={submitting || answeredCount !== questions.length} onClick={submitAssessment}>{submitting ? "Submitting…" : "Submit assessment"} <Check size={15} /></button>}</div>
                </div>}
        {error && <div className="assessment-error" role="alert"><CircleAlert size={15} />{error}<button aria-label="Dismiss message" onClick={() => setError("")}><X size={14} /></button></div>}
        <footer className="assessment-card-footer"><ShieldCheck size={14} /><span>Your responses are shared with the Juris Consultants hiring team.</span></footer>
      </article>
    </section>
    {warning > 0 && !terminated && <div className="assessment-warning-backdrop"><section className="assessment-warning-modal"><span className="assessment-state-icon warning-icon"><CircleAlert size={22} /></span><p className="eyebrow">ACTIVITY NOTICE · {warning}</p><h2>We noticed this tab was left.</h2><p>Your assessment remains available. The visibility change has been recorded for the hiring team. Please keep this tab open while you continue.</p><button className="assessment-primary" onClick={() => setWarning(0)}>Return to assessment <ArrowRight size={15} /></button></section></div>}
    <footer className="assessment-bottom"><span>JURIS CONSULTANTS</span><span>SCREENING WITH CARE <i /></span></footer>
  </main>;
}