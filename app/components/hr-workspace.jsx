"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowDownRight, ArrowRight, Bell, BriefcaseBusiness, Building2, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Download, FileQuestion, LayoutDashboard, Link2, Mail, MoreHorizontal, Plus, Search, Settings2, SlidersHorizontal, Sparkles, Upload, Video, X } from "lucide-react";

const statuses = ["Invited", "Assessment Started", "Assessment Completed", "HR Review", "Shortlisted", "Interview", "Selected", "Rejected", "On Hold", "Assessment Terminated"];
const emptyDrive = { name: "", role: "Sales Associate", college: "", date: "", status: "Active" };
const emptyCandidate = { name: "", email: "", phone: "", college: "" };
const cx = (status) => status.toLowerCase().replaceAll(" ", "-");
const makeToken = () => crypto.randomUUID();
const avatarUrl = (image) => `https://images.unsplash.com/${image}?auto=format&fit=crop&w=96&h=96&q=80`;

function parseCsv(text) {
  const rows = []; let row = []; let value = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value.trim()); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[index + 1] === "\n") index += 1; row.push(value.trim()); if (row.some(Boolean)) rows.push(row); row = []; value = ""; }
    else value += char;
  }
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function selectQuestionIds(questions) {
  const pick = (type, count) => questions.filter((question) => question.type === type && question.active).sort(() => Math.random() - 0.5).slice(0, count).map((question) => question.id);
  return [...pick("mcq", 6), ...pick("written", 3), ...pick("video", 1)].sort(() => Math.random() - 0.5);
}

function Metric({ label, value, foot, dark = false, icon }) {
  return <article className={`metric ${dark ? "dark" : ""}`}><div className="metric-label">{label}<span className="metric-icon">{icon}</span></div><strong>{value}</strong><footer>{foot}</footer></article>;
}

function Status({ value }) {
  return <span className={`status-badge status-${cx(value)}`}><i className="status-dot" />{value}</span>;
}

export default function HRWorkspace() {
  const [workspace, setWorkspace] = useState(null);
  const [view, setView] = useState("Overview");
  const [activeDriveId, setActiveDriveId] = useState("");
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All candidates");
  const [filterOpen, setFilterOpen] = useState(false);
  const [modal, setModal] = useState("");
  const [form, setForm] = useState(emptyDrive);
  const [candidateForm, setCandidateForm] = useState(emptyCandidate);
  const [questionForm, setQuestionForm] = useState({ id: "", type: "mcq", category: "Sales aptitude", text: "", options: "", correctIndex: 0, active: true });
  const [csvFile, setCsvFile] = useState(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/workspace").then((response) => response.json()).then((data) => { setWorkspace(data); setActiveDriveId(data.drives[0]?.id || ""); }).catch(() => setError("The hiring workspace could not be loaded. Refresh the page to retry.")).finally(() => setBusy(false));
  }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 4200); return () => window.clearTimeout(timer); }, [toast]);

  const drives = workspace?.drives || [];
  const candidates = workspace?.candidates || [];
  const drive = drives.find((item) => item.id === activeDriveId) || drives[0];
  const driveCandidates = candidates.filter((candidate) => !activeDriveId || candidate.driveId === activeDriveId);
  const visibleCandidates = useMemo(() => driveCandidates.filter((candidate) => `${candidate.name} ${candidate.college} ${candidate.email} ${candidate.id}`.toLowerCase().includes(search.toLowerCase()) && (filter === "All candidates" || candidate.status === filter)), [driveCandidates, search, filter]);
  const openReviews = candidates.filter((candidate) => ["Assessment Completed", "HR Review"].includes(candidate.status)).length;
  const completed = candidates.filter((candidate) => ["Assessment Completed", "HR Review", "Shortlisted", "Interview", "Selected", "Rejected", "On Hold"].includes(candidate.status)).length;
  const shortlisted = candidates.filter((candidate) => candidate.status === "Shortlisted").length;

  async function persist(next) {
    setWorkspace(next); setSaving(true); setError("");
    try { const response = await fetch("/api/workspace", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }); if (!response.ok) throw new Error(); return true; }
    catch { setError("Changes could not be saved. Check that the local server is running and try again."); return false; }
    finally { setSaving(false); }
  }
  function setCandidateStatus(candidate, newStatus) {
    const changed = { ...candidate, status: newStatus, statusHistory: [...(candidate.statusHistory || []), { from: candidate.status, to: newStatus, at: new Date().toISOString(), by: "Ananya Shah" }] };
    persist({ ...workspace, candidates: candidates.map((item) => item.id === candidate.id ? changed : item) });
    if (selected?.id === candidate.id) setSelected(changed);
  }
  async function copyInvite(candidate) {
    const inviteLink = `${window.location.origin}/assessment/${candidate.inviteToken}`;
    try { await navigator.clipboard.writeText(inviteLink); setToast("Unique assessment link copied."); }
    catch { setToast(inviteLink); }
  }
  function openMailDraft(candidate) {
    const inviteLink = `${window.location.origin}/assessment/${candidate.inviteToken}`;
    const subject = encodeURIComponent(`${drive?.name || "Juris Consultants"} assessment invitation`);
    const body = encodeURIComponent(`Hello ${candidate.name.split(" ")[0]},\n\nPlease complete your college hiring assessment using this personal link: ${inviteLink}\n\nThe assessment is for laptop or desktop browsers and includes a short video response.\n\nJuris Consultants Recruitment`);
    window.location.href = `mailto:${encodeURIComponent(candidate.email)}?subject=${subject}&body=${body}`;
  }
  function addDrive(event) {
    event.preventDefault();
    const created = { ...form, id: `drive-${makeToken()}`, createdAt: new Date().toISOString() };
    persist({ ...workspace, drives: [created, ...drives] }); setActiveDriveId(created.id); setForm(emptyDrive); setModal(""); setView("Hiring drives"); setToast("Hiring drive created.");
  }
  function addCandidate(event) {
    event.preventDefault();
    if (candidates.some((candidate) => candidate.email.toLowerCase() === candidateForm.email.toLowerCase())) return setError("A candidate with this email already exists.");
    const activeTypes = ["mcq", "written", "video"].map((type) => workspace.questions.filter((question) => question.type === type && question.active).length);
    if (activeTypes[0] < 6 || activeTypes[1] < 3 || activeTypes[2] < 1) return setError("Activate at least 6 multiple-choice, 3 written and 1 video question before inviting candidates.");
    const sequence = Math.max(0, ...candidates.map((candidate) => Number(candidate.id.replace("JH-", "")) || 0)) + 1;
    const created = { ...candidateForm, id: `JH-${sequence}`, status: "Invited", score: null, flags: 0, image: "", driveId: activeDriveId, inviteToken: makeToken(), questionIds: selectQuestionIds(workspace.questions), responses: {}, activityEvents: [], videoRecorded: false, createdAt: new Date().toISOString() };
    persist({ ...workspace, candidates: [created, ...candidates] }); setCandidateForm(emptyCandidate); setModal(""); setSelected(created); setToast("Candidate added with a unique assessment link.");
  }
  async function importCsv(event) {
    event.preventDefault();
    if (!csvFile) return setError("Choose a CSV file first.");
    const rows = parseCsv(await csvFile.text());
    if (rows.length < 2) return setError("The CSV needs a header row and at least one candidate.");
    const headers = rows[0].map((header) => header.toLowerCase().replaceAll(/[^a-z]/g, ""));
    const indexOf = (...names) => headers.findIndex((header) => names.includes(header));
    const nameIndex = indexOf("name", "fullname", "candidatename"); const emailIndex = indexOf("email", "emailaddress");
    const collegeIndex = indexOf("college", "school", "university"); const phoneIndex = indexOf("phone", "phonenumber", "mobile");
    if (nameIndex < 0 || emailIndex < 0) return setError("CSV headers must include name and email. College and phone are optional.");
    const activeTypes = ["mcq", "written", "video"].map((type) => workspace.questions.filter((question) => question.type === type && question.active).length);
    if (activeTypes[0] < 6 || activeTypes[1] < 3 || activeTypes[2] < 1) return setError("Activate 6 multiple-choice, 3 written and 1 video question before importing candidates.");
    const existingEmails = new Set(candidates.map((candidate) => candidate.email.toLowerCase()));
    let sequence = Math.max(0, ...candidates.map((candidate) => Number(candidate.id.replace("JH-", "")) || 0));
    const added = rows.slice(1).flatMap((row) => {
      const name = row[nameIndex]?.trim(); const email = row[emailIndex]?.trim();
      if (!name || !email || existingEmails.has(email.toLowerCase())) return [];
      existingEmails.add(email.toLowerCase()); sequence += 1;
      return [{ id: `JH-${sequence}`, name, email, college: row[collegeIndex] || drive?.college || "", phone: row[phoneIndex] || "", status: "Invited", score: null, flags: 0, image: "", driveId: activeDriveId, inviteToken: makeToken(), questionIds: selectQuestionIds(workspace.questions), responses: {}, activityEvents: [], videoRecorded: false, createdAt: new Date().toISOString() }];
    });
    if (!added.length) return setError("No new candidates found. Check the name/email values and remove duplicates.");
    await persist({ ...workspace, candidates: [...added, ...candidates] }); setCsvFile(null); setModal(""); setView("Candidates"); setToast(`${added.length} candidate${added.length === 1 ? "" : "s"} imported. Unique assessment links created.`);
  }
  function saveQuestion(event) {
    event.preventDefault();
    const options = questionForm.type === "mcq" ? questionForm.options.split("\n").map((option) => option.trim()).filter(Boolean) : undefined;
    if (!questionForm.text.trim()) return setError("Add the question text before saving.");
    if (questionForm.type === "mcq" && (!options || options.length < 2 || options.length > 6)) return setError("A multiple-choice question needs between 2 and 6 options, one per line.");
    const question = { ...questionForm, id: questionForm.id || `q-${makeToken()}`, text: questionForm.text.trim(), ...(options ? { options, correctIndex: Number(questionForm.correctIndex) } : {}) };
    const nextQuestions = workspace.questions.some((item) => item.id === question.id) ? workspace.questions.map((item) => item.id === question.id ? question : item) : [...workspace.questions, question];
    persist({ ...workspace, questions: nextQuestions }); setModal(""); setQuestionForm({ id: "", type: "mcq", category: "Sales aptitude", text: "", options: "", correctIndex: 0, active: true }); setToast("Question saved to the bank.");
  }
  function toggleQuestion(question) {
    if (question.active) {
      const remaining = workspace.questions.filter((item) => item.type === question.type && item.active && item.id !== question.id).length;
      const required = question.type === "mcq" ? 6 : question.type === "written" ? 3 : 1;
      if (remaining < required) return setError(`Keep at least ${required} active ${question.type} question${required === 1 ? "" : "s"} for the assessment.`);
    }
    persist({ ...workspace, questions: workspace.questions.map((item) => item.id === question.id ? { ...item, active: !item.active } : item) });
  }
  function exportCandidates() {
    const header = ["Candidate ID", "Name", "Email", "Phone", "College", "Drive", "Status", "MCQ score", "Activity flags", "Assessment link"];
    const rows = driveCandidates.map((candidate) => [candidate.id, candidate.name, candidate.email, candidate.phone || "", candidate.college, drives.find((item) => item.id === candidate.driveId)?.name || "", candidate.status, candidate.score ?? "", candidate.flags || 0, `${window.location.origin}/assessment/${candidate.inviteToken}`]);
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const href = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a");
    link.href = href; link.download = `${(drive?.name || "juris-candidates").toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.csv`; link.click(); URL.revokeObjectURL(href); setToast("Candidate report downloaded.");
  }

  if (busy) return <div className="shell"><main className="main"><p className="workspace-loading">Loading hiring workspace…</p></main></div>;
  if (!workspace) return <div className="shell"><main className="main"><div className="workspace-load-error">{error || "Workspace data is unavailable."}<button className="primary" onClick={() => window.location.reload()}>Retry</button></div></main></div>;
  const nav = (nextView) => { setView(nextView); setError(""); setSelected(null); };
  const driveCounts = (driveId) => candidates.filter((candidate) => candidate.driveId === driveId).length;

  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="/" onClick={(event) => { event.preventDefault(); nav("Overview"); }}><span className="brand-mark">J<span>.</span></span><span className="brand-name">juris<span>hire</span></span></a>
      <button className="workspace-switch" onClick={() => nav("Hiring drives")}><span className="workspace-icon"><Building2 size={16} /></span><span><b>Juris Consultants</b><small>Recruitment team</small></span><ChevronDown size={15} /></button>
      <p className="nav-caption">WORKSPACE</p><nav className="nav" aria-label="Main navigation">
        <button className={`nav-item ${view === "Overview" ? "active" : ""}`} onClick={() => nav("Overview")}><LayoutDashboard size={17} />Overview</button>
        <button className={`nav-item ${view === "Candidates" ? "active" : ""}`} onClick={() => nav("Candidates")}><BriefcaseBusiness size={17} />Candidates<span className="nav-count">{candidates.length}</span></button>
        <button className={`nav-item ${view === "Hiring drives" ? "active" : ""}`} onClick={() => nav("Hiring drives")}><Building2 size={17} />Hiring drives<span className="nav-count">{drives.length}</span></button>
        <button className={`nav-item ${view === "Question bank" ? "active" : ""}`} onClick={() => nav("Question bank")}><FileQuestion size={17} />Question bank</button>
        <button className={`nav-item ${view === "Reports" ? "active" : ""}`} onClick={() => nav("Reports")}><Download size={17} />Reports</button>
      </nav>
      <div className="sidebar-bottom"><div className="help-card"><span><CircleHelp size={15} /></span><b>Need a hand?</b><p>Open a sample student assessment to test the candidate journey.</p><button onClick={() => { const sample = candidates[0]; if (sample) window.open(`/assessment/${sample.inviteToken}`, "_blank", "noopener,noreferrer"); }}>Preview student view <ArrowRight size={13} /></button></div><div className="user-card"><span className="user-initials">AS</span><span><b>Ananya Shah</b><small>HR administrator · Demo</small></span><MoreHorizontal size={17} /></div></div>
    </aside>
    <main className="main"><header className="topbar"><div className="crumb"><span>Workspace</span><ChevronRight size={14} /><b>{view}</b></div><div className="top-actions"><label className="drive-selector-label"><span className="live-dot" /><select aria-label="Active hiring drive" value={activeDriveId} onChange={(event) => setActiveDriveId(event.target.value)}>{drives.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="icon-button notification" aria-label="View candidates awaiting review" title="View candidates awaiting review" onClick={() => { setFilter("HR Review"); nav("Candidates"); }}><Bell size={18} />{openReviews > 0 && <i>{openReviews}</i>}</button><span className="top-avatar">AS</span></div></header>
      <div className="page">
        <section className="page-heading"><div><p className="eyebrow">JURIS CONSULTANTS <i /></p><h1>{view === "Overview" ? <>A clearer first look<br />at your next <em>great hire.</em></> : view === "Candidates" ? <>Your candidates.</> : view === "Hiring drives" ? <>Hiring, by <em>drive.</em></> : view === "Question bank" ? <>A better set<br />of <em>questions.</em></> : <>The full picture,<br />ready to <em>share.</em></>}</h1><p className="heading-copy">{view === "Overview" ? "A structured screen. More time for the right conversations." : view === "Candidates" ? "Review assessments, activity and next steps in one place." : view === "Hiring drives" ? "Create and organize campus batches from one workspace." : view === "Question bank" ? "Manage the questions candidates receive in their assessment." : "Export candidate details, scores and activity for this drive."}</p></div><button className="primary" onClick={() => { setError(""); setModal(view === "Hiring drives" || view === "Overview" ? "drive" : view === "Question bank" ? "question" : "candidate"); }}><Plus size={16} />{view === "Hiring drives" || view === "Overview" ? "New hiring drive" : view === "Question bank" ? "Add question" : "Add candidate"}</button></section>
        {error && <div className="workspace-alert" role="alert"><span>{error}</span><button aria-label="Dismiss alert" onClick={() => setError("")}><X size={15} /></button></div>}
        {view === "Overview" && <><section className="metrics" aria-label="Hiring drive summary"><Metric label="Candidates invited" value={candidates.length} foot={<><span><ArrowDownRight size={13} /> {drives.length} active drive{drives.length === 1 ? "" : "s"}</span><small>ALL DRIVES</small></>} dark icon={<BriefcaseBusiness size={16} />} /><Metric label="Assessments completed" value={completed} foot={<><span>{candidates.length ? Math.round(completed / candidates.length * 100) : 0}% completion</span><small>OF CANDIDATES</small></>} icon={<Check size={16} />} /><Metric label="Ready for review" value={openReviews} foot={<><span>Completed responses to review</span><small>HR QUEUE</small></>} icon={<Clock3 size={16} />} /><Metric label="Shortlisted" value={shortlisted} foot={<><span>Across all hiring drives</span><small>NEXT STAGE</small></>} icon={<Sparkles size={16} />} /></section><section className="overview-grid"><article className="panel overview-panel"><div className="overview-panel-head"><div><p className="eyebrow">ACTIVE HIRING DRIVES</p><h2>Your college batches.</h2></div><button className="text-link" onClick={() => nav("Hiring drives")}>Manage drives <ArrowRight size={14} /></button></div><div className="overview-drive-list">{drives.slice(0, 4).map((item) => <button key={item.id} onClick={() => { setActiveDriveId(item.id); nav("Candidates"); }}><span className="drive-card-icon"><Building2 size={16} /></span><span><b>{item.name}</b><small>{item.role} · {item.college || "Multiple colleges"}</small></span><strong>{driveCounts(item.id)}<small> candidates</small></strong><ArrowRight size={15} /></button>)}{!drives.length && <p className="empty-copy">Create a drive to start organizing candidates.</p>}</div></article><article className="panel overview-panel"><div className="overview-panel-head"><div><p className="eyebrow">RECRUITMENT PIPELINE</p><h2>Every next step, visible.</h2></div></div><div className="pipeline-summary">{["Invited", "Assessment Started", "Assessment Completed", "HR Review", "Shortlisted", "Interview"].map((status) => { const count = candidates.filter((candidate) => candidate.status === status).length; return <button key={status} onClick={() => { setFilter(status); nav("Candidates"); }}><span>{status}</span><i><b style={{ width: `${candidates.length ? Math.max(4, count / candidates.length * 100) : 0}%` }} /></i><strong>{count}</strong></button>; })}</div></article></section><section className="panel candidate-panel"><CandidateTable candidates={candidates.slice(0, 6)} driveMap={drives} onOpen={setSelected} onStatus={setCandidateStatus} onAll={() => nav("Candidates")} /></section></>}
        {view === "Candidates" && <section className="panel candidate-panel"><div className="candidate-head"><div><p className="eyebrow">{drive?.name || "ALL HIRING DRIVES"}</p><h2>Candidates <span>{visibleCandidates.length}</span></h2></div><div className="tools"><label className="search"><Search size={15} /><input aria-label="Search candidates" placeholder="Name, email or college" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>/</kbd></label><div className="filter-wrap"><button className={`filter-button ${filter !== "All candidates" ? "chosen" : ""}`} onClick={() => setFilterOpen(!filterOpen)}><SlidersHorizontal size={14} />Status{filter !== "All candidates" && <i>1</i>}</button>{filterOpen && <div className="filter-menu"><span>RECRUITMENT STATUS</span>{["All candidates", ...statuses].map((status) => <button key={status} onClick={() => { setFilter(status); setFilterOpen(false); }}>{status}{filter === status && <Check size={13} />}</button>)}</div>}</div><button className="icon-button export" aria-label="Export candidate CSV" title="Export candidate CSV" onClick={exportCandidates}><Download size={15} /></button><button className="secondary-button" onClick={() => setModal("import")}><Upload size={14} />Import CSV</button></div></div><CandidateTable candidates={visibleCandidates} driveMap={drives} onOpen={setSelected} onStatus={setCandidateStatus} onAll={() => {}} /></section>}
        {view === "Hiring drives" && <section className="drive-grid">{drives.map((item) => { const related = candidates.filter((candidate) => candidate.driveId === item.id); return <article className="panel drive-card" key={item.id}><div className="drive-card-top"><span className="drive-card-icon"><Building2 size={18} /></span><Status value={item.status} /><button className="icon-button" title="Edit hiring drive" aria-label={`Edit ${item.name}`} onClick={() => { setForm(item); setModal(`edit-drive:${item.id}`); }}><MoreHorizontal size={18} /></button></div><p className="eyebrow">{item.date || "DATE NOT SET"}</p><h2>{item.name}</h2><p>{item.role} · {item.college || "College batch not set"}</p><div className="drive-stat-row"><span><b>{related.length}</b> candidates</span><span><b>{related.filter((candidate) => candidate.status === "Assessment Completed").length}</b> assessments in</span><span><b>{related.filter((candidate) => candidate.flags).length}</b> activity flags</span></div><div className="drive-card-actions"><button className="text-link" onClick={() => { setActiveDriveId(item.id); setFilter("All candidates"); nav("Candidates"); }}>Open candidates <ArrowRight size={14} /></button><button className="secondary-button" onClick={() => { setActiveDriveId(item.id); setModal("candidate"); }}><Plus size={14} />Add candidate</button></div></article>; })}<button className="new-drive-tile" onClick={() => { setForm(emptyDrive); setModal("drive"); }}><span><Plus size={18} /></span><b>Create a hiring drive</b><small>Set up the college, role and assessment batch.</small></button></section>}
        {view === "Question bank" && <section className="panel question-bank"><header className="question-bank-head"><div><p className="eyebrow">ASSESSMENT CONFIGURATION</p><h2>Active question mix</h2><p>Each candidate receives 6 multiple choice, 3 written and 1 video question, selected from this bank.</p></div><div className="mix-counts">{["mcq", "written", "video"].map((type) => <span key={type}><b>{workspace.questions.filter((question) => question.type === type && question.active).length}</b>{type === "mcq" ? "MCQ" : type}</span>)}</div></header>{["mcq", "written", "video"].map((type) => <div className="question-group" key={type}><h3>{type === "mcq" ? "Multiple choice" : type === "written" ? "Written response" : "Video response"}<small>{workspace.questions.filter((question) => question.type === type).length} questions</small></h3>{workspace.questions.filter((question) => question.type === type).map((question) => <article className={`question-row ${question.active ? "" : "inactive"}`} key={question.id}><span className="question-type-icon">{type === "video" ? <Video size={16} /> : type === "written" ? <FileQuestion size={16} /> : <Check size={16} />}</span><div><b>{question.text}</b><small>{question.category}{type === "mcq" ? ` · ${question.options.length} choices · answer: ${question.options[question.correctIndex]}` : ""}</small></div><label className="active-toggle" title={question.active ? "Deactivate question" : "Activate question"}><input type="checkbox" checked={question.active} onChange={() => toggleQuestion(question)} /><span /></label><button className="icon-button" aria-label="Edit question" title="Edit question" onClick={() => { setQuestionForm({ ...question, options: question.options?.join("\n") || "", correctIndex: question.correctIndex || 0 }); setModal("question"); }}><Settings2 size={15} /></button></article>)}</div>)}</section>}
        {view === "Reports" && <section className="panel reports-panel"><header className="reports-heading"><div><p className="eyebrow">HIRING DRIVE REPORT</p><h2>{drive?.name || "All hiring drives"}</h2><p>Candidate status, objective scores, invitation links and assessment activity.</p></div><button className="primary" onClick={exportCandidates}><Download size={15} />Download CSV</button></header><div className="report-stats"><div><span>Candidate records</span><b>{driveCandidates.length}</b></div><div><span>Assessment completion</span><b>{driveCandidates.filter((candidate) => candidate.completedAt || ["Assessment Completed", "HR Review", "Shortlisted", "Interview", "Selected", "Rejected", "On Hold"].includes(candidate.status)).length}</b></div><div><span>Average MCQ score</span><b>{driveCandidates.filter((candidate) => candidate.score !== null && candidate.score !== undefined).length ? `${Math.round(driveCandidates.filter((candidate) => candidate.score !== null && candidate.score !== undefined).reduce((sum, candidate) => sum + candidate.score, 0) / driveCandidates.filter((candidate) => candidate.score !== null && candidate.score !== undefined).length)}%` : "—"}</b></div><div><span>Activity events</span><b>{driveCandidates.reduce((sum, candidate) => sum + (candidate.flags || 0), 0)}</b></div></div><CandidateTable candidates={driveCandidates} driveMap={drives} onOpen={setSelected} onStatus={setCandidateStatus} onAll={() => nav("Candidates")} /></section>}
        <footer className="page-footer"><span>JURIS CONSULTANTS <i /> HIRING, WITH MORE CLARITY.</span><span className="save-state">{saving ? "Saving changes…" : "Changes saved locally"}</span></footer>
      </div>
    </main>
    {selected && <CandidateDrawer candidate={candidates.find((item) => item.id === selected.id) || selected} drive={drives.find((item) => item.id === selected.driveId)} questions={workspace.questions} onClose={() => setSelected(null)} onStatus={setCandidateStatus} onCopy={copyInvite} onEmail={openMailDraft} />}
    {modal && <div className="workspace-modal-backdrop" onClick={() => { setModal(""); setError(""); }}><section className="workspace-modal" onClick={(event) => event.stopPropagation()}><header><div><p className="eyebrow">{modal.startsWith("edit-drive:") ? "DRIVE DETAILS" : modal === "drive" ? "COLLEGE HIRING" : modal === "candidate" ? "CANDIDATE MANAGEMENT" : modal === "import" ? "BATCH IMPORT" : "QUESTION BANK"}</p><h2>{modal === "drive" ? "Create a hiring drive" : modal.startsWith("edit-drive:") ? "Edit hiring drive" : modal === "candidate" ? "Add a candidate" : modal === "import" ? "Import candidates" : questionForm.id ? "Edit question" : "Add a question"}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={() => setModal("")}><X size={18} /></button></header>
      {(modal === "drive" || modal.startsWith("edit-drive:")) && <form onSubmit={(event) => { event.preventDefault(); const driveId = modal.startsWith("edit-drive:") ? modal.split(":")[1] : ""; if (!driveId) return addDrive(event); persist({ ...workspace, drives: drives.map((item) => item.id === driveId ? form : item) }); setModal(""); setToast("Hiring drive updated."); }}><label>Drive name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. 2026 Sales campus hiring" /></label><div className="form-two"><label>Role<input required value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} placeholder="Sales Associate" /></label><label>Hiring date<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label></div><label>College or batch group<input value={form.college} onChange={(event) => setForm({ ...form, college: event.target.value })} placeholder="e.g. St. Xavier's College" /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal("")}>Cancel</button><button className="primary" type="submit"><Check size={14} />{modal.startsWith("edit-drive:") ? "Save drive" : "Create drive"}</button></div></form>}
      {modal === "candidate" && <form onSubmit={addCandidate}><label>Full name<input required value={candidateForm.name} onChange={(event) => setCandidateForm({ ...candidateForm, name: event.target.value })} placeholder="Candidate name" /></label><div className="form-two"><label>Email address<input required type="email" value={candidateForm.email} onChange={(event) => setCandidateForm({ ...candidateForm, email: event.target.value })} placeholder="name@email.com" /></label><label>Phone <small>(optional)</small><input value={candidateForm.phone} onChange={(event) => setCandidateForm({ ...candidateForm, phone: event.target.value })} placeholder="+91" /></label></div><label>College<input required value={candidateForm.college} onChange={(event) => setCandidateForm({ ...candidateForm, college: event.target.value })} placeholder={drive?.college || "College name"} /></label><p className="form-note"><Link2 size={14} />A unique 10-question assessment link will be generated for this candidate.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal("")}>Cancel</button><button className="primary" type="submit"><Plus size={14} />Add candidate</button></div></form>}
      {modal === "import" && <form onSubmit={importCsv}><p className="import-copy">Upload a CSV with a header row containing <b>name</b> and <b>email</b>. <b>college</b> and <b>phone</b> are optional. Duplicate email addresses are skipped.</p><label className="file-drop"><Upload size={20} /><b>{csvFile?.name || "Choose a CSV file"}</b><small>CSV format · name, email, college, phone</small><input type="file" accept=".csv,text/csv" onChange={(event) => setCsvFile(event.target.files?.[0] || null)} /></label><button className="download-template" type="button" onClick={() => { const href = URL.createObjectURL(new Blob(["name,email,college,phone\n"], { type: "text/csv" })); const link = document.createElement("a"); link.href = href; link.download = "candidate-import-template.csv"; link.click(); URL.revokeObjectURL(href); }}>Download CSV template</button><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal("")}>Cancel</button><button className="primary" type="submit"><Upload size={14} />Import batch</button></div></form>}
      {modal === "question" && <form onSubmit={saveQuestion}><label>Question type<select value={questionForm.type} onChange={(event) => setQuestionForm({ ...questionForm, type: event.target.value })}><option value="mcq">Multiple choice</option><option value="written">Written response</option><option value="video">Video response</option></select></label><label>Category<input value={questionForm.category} onChange={(event) => setQuestionForm({ ...questionForm, category: event.target.value })} placeholder="Communication" /></label><label>Question<textarea required rows={3} value={questionForm.text} onChange={(event) => setQuestionForm({ ...questionForm, text: event.target.value })} placeholder="Write a clear, candidate-facing prompt" /></label>{questionForm.type === "mcq" && <><label>Answer choices <small>(one per line, 2–6)</small><textarea rows={4} value={questionForm.options} onChange={(event) => setQuestionForm({ ...questionForm, options: event.target.value, correctIndex: 0 })} placeholder={"First option\nSecond option"} /></label><label>Correct answer<select value={questionForm.correctIndex} onChange={(event) => setQuestionForm({ ...questionForm, correctIndex: Number(event.target.value) })}>{questionForm.options.split("\n").filter((option) => option.trim()).map((option, index) => <option key={index} value={index}>{option}</option>)}</select></label></>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal("")}>Cancel</button><button className="primary" type="submit"><Check size={14} />Save question</button></div></form>}
    </section></div>}
    {toast && <div className="workspace-toast" role="status"><Check size={15} /><span>{toast.startsWith("http") ? <><button onClick={() => navigator.clipboard?.writeText(toast)}>Copy assessment link</button><a href={toast} target="_blank" rel="noreferrer">Open link</a></> : toast}</span><button aria-label="Dismiss notification" onClick={() => setToast("")}><X size={14} /></button></div>}
  </div>;
}

function CandidateTable({ candidates, driveMap, onOpen, onStatus, onAll }) {
  return <><div className="table-scroll"><table><thead><tr><th>CANDIDATE <ArrowDown size={11} /></th><th>COLLEGE</th><th>ASSESSMENT</th><th>ACTIVITY</th><th>STATUS</th><th /></tr></thead><tbody>{candidates.map((candidate) => <tr key={candidate.id} tabIndex={0} onClick={() => onOpen(candidate)} onKeyDown={(event) => event.key === "Enter" && onOpen(candidate)}><td><div className="candidate">{candidate.image ? <img className="avatar" src={avatarUrl(candidate.image)} alt="" /> : <span className="avatar avatar-fallback">{candidate.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>}<span><b>{candidate.name}</b><small>{candidate.id} <i>·</i> {candidate.email}</small></span></div></td><td>{candidate.college}<small className="drive-subline">{driveMap.find((drive) => drive.id === candidate.driveId)?.name || ""}</small></td><td>{candidate.score === null || candidate.score === undefined ? <span className="score-pending">{candidate.status === "Assessment Started" ? "In progress" : "Not submitted"}</span> : <div className="score"><b>{candidate.score}</b><i><span style={{ width: `${candidate.score}%` }} /></i></div>}</td><td>{candidate.flags ? <span className="flag"><i />{candidate.flags} {candidate.flags === 1 ? "flag" : "flags"}</span> : <span className="clear"><Check size={13} />Clear</span>}</td><td onClick={(event) => event.stopPropagation()}><select aria-label={`Change ${candidate.name}'s status`} className={`status status-${cx(candidate.status)}`} value={candidate.status} onChange={(event) => onStatus(candidate, event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></td><td><button className="row-arrow" aria-label={`Review ${candidate.name}`} onClick={(event) => { event.stopPropagation(); onOpen(candidate); }}><ArrowRight size={15} /></button></td></tr>)}</tbody></table>{!candidates.length && <div className="no-results">No candidates here yet. Add one or import a CSV batch.</div>}</div><footer className="table-footer"><span>Showing <b>{candidates.length}</b> candidate{candidates.length === 1 ? "" : "s"}</span><button className="table-all-link" onClick={onAll}>View all <ArrowRight size={13} /></button></footer></>;
}

function CandidateDrawer({ candidate, drive, questions, onClose, onStatus, onCopy, onEmail }) {
  const [linkVisible, setLinkVisible] = useState(false);
  const questionById = Object.fromEntries(questions.map((question) => [question.id, question]));
  const orderedQuestions = (candidate.questionIds || []).map((id) => questionById[id]).filter(Boolean);
  const written = orderedQuestions.filter((question) => question.type === "written");
  const choiceQuestions = orderedQuestions.filter((question) => question.type === "mcq");
  const correct = choiceQuestions.filter((question) => Number(candidate.responses?.[question.id]) === question.correctIndex).length;
  return <div className="backdrop" onClick={onClose}><aside className="drawer" onClick={(event) => event.stopPropagation()}><header><span className="eyebrow">CANDIDATE PROFILE · {candidate.id}</span><button className="icon-button" aria-label="Close candidate profile" onClick={onClose}><X size={18} /></button></header><div className="drawer-profile">{candidate.image ? <img className="avatar avatar-large" src={avatarUrl(candidate.image)} alt="" /> : <span className="avatar avatar-large avatar-fallback">{candidate.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>}<div><h2>{candidate.name}</h2><p>{candidate.college}</p></div></div><div className="contact"><span>{candidate.email}</span>{candidate.phone && <span>{candidate.phone}</span>}<span>{drive?.name || "Hiring drive"} · {drive?.role || ""}</span></div><section className="drawer-section"><div className="section-title"><h3>Assessment overview</h3>{candidate.score !== null && candidate.score !== undefined && <b>{candidate.score}<small> / 100</small></b>}</div><div className="assessment-meta"><span><Check size={14} />{Object.keys(candidate.responses || {}).length} of {orderedQuestions.length} responses saved</span><span><Clock3 size={14} />{candidate.completedAt ? `Submitted ${new Date(candidate.completedAt).toLocaleString()}` : candidate.startedAt ? `Started ${new Date(candidate.startedAt).toLocaleString()}` : "Not started"}</span>{candidate.score !== null && candidate.score !== undefined && <span>{correct} of {choiceQuestions.length} multiple-choice answers correct</span>}</div>{written.map((question, index) => <div className="answer" key={question.id}><span>WRITTEN RESPONSE · 0{index + 1}</span><strong>{question.text}</strong><p>{candidate.responses?.[question.id] || "No response submitted."}</p></div>)}{candidate.videoRecorded && <div className="video-review"><video controls preload="metadata" src={`/api/assessment/${candidate.inviteToken}/video`} /><div><Video size={15} /><span>Candidate video response · up to 15 seconds</span></div></div>}</section><section className="drawer-section activity-section"><h3>Activity log</h3>{(candidate.activityEvents || []).length ? <ol className="event-list">{candidate.activityEvents.map((event, index) => <li key={`${event.at}-${index}`}><span><i />{event.type === "visibilitychange" ? "Assessment tab lost visibility" : event.type}</span><time>{new Date(event.at).toLocaleString()}</time></li>)}</ol> : <div className="activity-clear"><Check size={14} />No visibility changes recorded</div>}</section><section className="drawer-section invitation-section"><h3>Assessment invitation</h3><div className="invitation-actions"><button className="secondary-button" onClick={() => { onCopy(candidate); setLinkVisible(true); }}><Link2 size={14} />Copy unique link</button><button className="secondary-button" onClick={() => onEmail(candidate)}><Mail size={14} />Open email draft</button></div>{linkVisible && <a className="invite-url" href={`/assessment/${candidate.inviteToken}`} target="_blank" rel="noreferrer">{typeof window !== "undefined" ? `${window.location.origin}/assessment/${candidate.inviteToken}` : "Assessment link"}</a>}</section><div className="drawer-bottom"><label htmlFor="candidate-status">Recruitment status</label><select id="candidate-status" className={`status status-${cx(candidate.status)}`} value={candidate.status} onChange={(event) => onStatus(candidate, event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select><button className="primary drawer-done" onClick={onClose}>Done reviewing <Check size={14} /></button></div></aside></div>;
}