"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { SL } from "../lib/domain";

const P = {
  grid: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  drive: <path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6" />,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-6 7-6s7 2 7 6M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-5.5" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  sliders: <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3M14 9l2 2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  download: <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />,
  left: <path d="M19 12H5M11 6l-6 6 6 6" />,
  right: <path d="M5 12h14M13 6l6 6-6 6" />,
  play: <path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" />,
  warn: <path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  check: <path d="M5 12l5 5L20 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  video: <><rect x="2" y="6" width="14" height="12" rx="2" /><path d="M16 10l6-3v10l-6-3" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  monitor: <><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
  logout: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h9" /></>,
  refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
  wifi: <path d="M2 9a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M12 20h.01" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  tablet: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M11 18h2" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" /></>,
};

export function Icon({ name, size = 18, stroke = 1.8 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{P[name]}</svg>;
}

// Password input with a show/hide toggle.
export function PasswordInput({ value, onChange, autoComplete = "current-password", placeholder = "••••••••", id }) {
  const [show, setShow] = useState(false);
  return <div style={{ position: "relative" }}>
    <input className="input" id={id} type={show ? "text" : "password"} autoComplete={autoComplete} placeholder={placeholder} value={value} onChange={onChange} style={{ paddingRight: 52 }} />
    <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} title={show ? "Hide password" : "Show password"}
      style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 40, height: 36, border: 0, borderRadius: 9, background: "transparent", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Icon name={show ? "eyeOff" : "eye"} size={18} />
    </button>
  </div>;
}

export const Pill = ({ status }) => <span className={`pill st-${status}`}>{SL[status] || status}</span>;

/* ---------- dates ---------- */
const pad = (n) => String(n).padStart(2, "0");
export const fmtT = (d) => { d = new Date(d); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fmtTs = (d) => `${fmtT(d)}:${pad(new Date(d).getSeconds())}`;
export function fmtDay(d) {
  if (!d) return "—";
  d = new Date(d);
  const t = new Date(), y = new Date(t); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return `Today, ${fmtT(d)}`;
  if (d.toDateString() === y.toDateString()) return `Yesterday, ${fmtT(d)}`;
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${fmtT(d)}`;
}
export const fmtDate = (s) => s ? new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
export const mmss = (s) => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;
export { pad };

/* ---------- toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const toast = useCallback((msg, light) => {
    const id = Math.random();
    setItems((xs) => [...xs, { id, msg, light }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3600);
  }, []);
  return <ToastCtx.Provider value={toast}>
    {children}
    <div className="toasts" aria-live="polite">{items.map((t) => <div key={t.id} className={`toast${t.light ? " light" : ""}`}>{t.msg}</div>)}</div>
  </ToastCtx.Provider>;
}

/* ---------- modal ---------- */
export function Modal({ children, onClose, locked = false, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const first = ref.current?.querySelector("input,select,textarea,button.btn.gold,button.sbtn.dark");
    const t = setTimeout(() => first?.focus(), 30);
    const onKey = (e) => { if (e.key === "Escape" && !locked) onClose?.(); };
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); document.removeEventListener("keydown", onKey); };
  }, [locked, onClose]);
  return <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget && !locked) onClose?.(); }}>
    <div ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true">{children}</div>
  </div>;
}

export function ModalHead({ title, onClose }) {
  return <div className="modal-h"><h2>{title}</h2>{onClose && <button className="x" type="button" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>}</div>;
}

export function downloadCSV(name, csv) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}
