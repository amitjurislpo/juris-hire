// Transactional email through Resend: invitations (batched) and submission confirmations.

const RESEND = "https://api.resend.com";
const BATCH_SIZE = 100; // Resend's batch limit

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (s) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "the closing date");
const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "there";

export function emailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

export function appOrigin(request) {
  return process.env.APP_URL?.replace(/\/$/, "") || new URL(request.url).origin;
}

async function resend(path, payload) {
  if (!emailConfigured()) throw new Error("Email delivery is not configured. Add RESEND_API_KEY and RESEND_FROM to the environment.");
  const response = await fetch(`${RESEND}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `The email service returned an error (${response.status}).`);
  return result;
}

const shell = (hero, body) => `<!doctype html><html><body style="margin:0;background:#F1EEE7;font-family:'Helvetica Neue',Arial,sans-serif;padding:32px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#FFFFFF;border:1px solid #E7E2D8;border-radius:12px;overflow:hidden">
<tr><td style="background:#14171F;color:#F3EFE6;padding:40px 40px 36px">${hero}</td></tr>
<tr><td style="padding:32px 40px 36px;color:#4A4F5A;font-size:15px;line-height:1.7">${body}</td></tr>
<tr><td style="padding:18px 40px;border-top:1px solid #E7E2D8;font-size:12px;color:#666B76">Sent via the Juris screening system. If you weren’t expecting this, you can ignore this email.</td></tr>
</table></td></tr></table></body></html>`;

const eyebrow = (t) => `<div style="font-size:11px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:#CDB48A">${t}</div>`;
const heading = (h) => `<h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:38px;line-height:1.08;margin:14px 0 0;color:#F3EFE6">${h}</h1>`;

function questionSummary(s) {
  const parts = [s.mcq && `${s.mcq} multiple-choice`, s.written && `${s.written} written`].filter(Boolean);
  return parts.length ? `${parts.join(" and ")} questions` : "a few questions";
}

function invitationEmail({ candidate, drive, settings, url }) {
  const time = settings.timeLimit ? `${settings.timeLimit} minutes` : "20–30 minutes";
  const html = shell(
    `${eyebrow(`Juris Consultants · ${esc(drive.name)}`)}${heading(`You’re invited to the <i style="color:#CDB48A">first round</i>.`)}`,
    `<p style="margin:0 0 16px">Hi ${esc(firstName(candidate.name))},</p>
     <p style="margin:0 0 16px">The first round of your application with Juris Consultants is a short online assessment you can take on your own — about <b style="color:#14171F">${time}</b>, with ${questionSummary(settings)}.</p>
     <p style="margin:0 0 16px">Please use a <b style="color:#14171F">laptop or desktop</b>. The link below is unique to you — no login is needed, and please don’t share it.</p>
     <p style="margin:28px 0"><a href="${esc(url)}" style="display:inline-block;background:#14171F;color:#F3EFE6;text-decoration:none;font-weight:600;padding:15px 26px;border-radius:8px">Start my assessment &rarr;</a></p>
     <p style="margin:0;font-size:13px;color:#666B76">Link expires ${fmtDate(drive.closes)} · Reference ${esc(candidate.token)}</p>`,
  );
  const text = `Hi ${firstName(candidate.name)},\n\nYour first-round assessment for ${drive.name} is ready (about ${time}). Please use a laptop or desktop.\n\n${url}\n\nLink expires ${fmtDate(drive.closes)} · Reference ${candidate.token}`;
  return { from: process.env.RESEND_FROM, to: [candidate.email], subject: `Your assessment for ${drive.name}`, html, text };
}

// Sends in batches of up to 100 so large drives don't hit the per-second rate limit.
// Returns one { ok, error } per item, in order.
export async function sendInvitations(items) {
  const results = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    try {
      await resend("/emails/batch", chunk.map(invitationEmail));
      chunk.forEach(() => results.push({ ok: true }));
    } catch (error) {
      chunk.forEach(() => results.push({ ok: false, error: error.message }));
    }
  }
  return results;
}

export function sendConfirmation({ candidate, drive }) {
  const html = shell(
    `${eyebrow("Assessment submitted")}${heading(`Thank you, ${esc(firstName(candidate.name))}.`)}`,
    `<p style="margin:0 0 16px">Your responses for <b style="color:#14171F">${esc(drive.name)}</b> have reached the Juris Consultants HR team. If you’re shortlisted, the team will contact you about a live interview.</p>
     <p style="margin:0;font-size:13px;color:#666B76">Reference ${esc(candidate.token)}</p>`,
  );
  return resend("/emails", { from: process.env.RESEND_FROM, to: [candidate.email], subject: `We received your assessment — ${drive.name}`, html, text: `Thank you — your assessment for ${drive.name} was received. Reference ${candidate.token}.` });
}
