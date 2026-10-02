const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (s) => new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function emailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

export function appOrigin(request) {
  return process.env.APP_URL?.replace(/\/$/, "") || new URL(request.url).origin;
}

async function send({ to, subject, html, text }) {
  if (!emailConfigured()) throw new Error("Email delivery is not configured. Add RESEND_API_KEY and RESEND_FROM to the environment.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: process.env.RESEND_FROM, to: [to], subject, html, text }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "The email could not be sent.");
  return result.id;
}

const shell = (hero, body) => `<!doctype html><html><body style="margin:0;background:#E9E5DB;font-family:Segoe UI,Arial,sans-serif;padding:32px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:14px;overflow:hidden">
<tr><td style="background:#121722;color:#F6F3EC;padding:36px 36px 32px">${hero}</td></tr>
<tr><td style="padding:28px 36px 32px;color:#4E5563;font-size:15px;line-height:1.65">${body}</td></tr>
<tr><td style="padding:18px 36px;border-top:1px solid #E4DED1;font-size:12px;color:#5B6271">Sent via the Juris screening system. If you weren’t expecting this, you can ignore this email.</td></tr>
</table></td></tr></table></body></html>`;

export function sendInvitation({ candidate, drive, settings, url }) {
  const first = esc(candidate.name.split(" ")[0]);
  const time = settings.timeLimit ? `${settings.timeLimit} minutes` : "20–30 minutes";
  const html = shell(
    `<div style="font-family:Consolas,monospace;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#D6B46C">College hiring · ${esc(drive.college)}</div>
     <h1 style="font-family:Georgia,serif;font-weight:400;font-size:36px;line-height:40px;margin:12px 0 0">You’re invited to the <i style="color:#D6B46C">first round</i>.</h1>`,
    `<p>Hi ${first},</p>
     <p>Thank you for attending the Juris Consultants session at ${esc(drive.college)}. The first round is a short online assessment you can take on your own — about <b style="color:#121722">${time}</b>, with ${settings.mcq} multiple-choice, ${settings.written} written and ${settings.video} short video question${settings.video === 1 ? "" : "s"}.</p>
     <p>Please use a <b style="color:#121722">laptop or desktop</b> with a working camera and microphone. The link below is unique to you — please don’t share it.</p>
     <p style="margin:24px 0"><a href="${esc(url)}" style="display:inline-block;background:#121722;color:#F6F3EC;text-decoration:none;font-weight:700;padding:15px 24px;border-radius:12px">Start my assessment →</a></p>
     <p style="font-size:13px">Link expires ${fmtDate(drive.closes)} · Reference ${esc(candidate.token)}</p>`,
  );
  const text = `Hi ${candidate.name.split(" ")[0]},\n\nYour first-round assessment for ${drive.name} is ready. Use a laptop or desktop with a camera and microphone.\n\n${url}\n\nLink expires ${fmtDate(drive.closes)} · Reference ${candidate.token}`;
  return send({ to: candidate.email, subject: `Your assessment for ${drive.name}`, html, text });
}

export function sendConfirmation({ candidate, drive }) {
  const html = shell(
    `<div style="font-family:Consolas,monospace;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#D6B46C">Assessment submitted</div>
     <h1 style="font-family:Georgia,serif;font-weight:400;font-size:36px;line-height:40px;margin:12px 0 0">Thank you, ${esc(candidate.name.split(" ")[0])}.</h1>`,
    `<p>Your responses for <b style="color:#121722">${esc(drive.name)}</b> have reached the Juris Consultants HR team. If you’re shortlisted, the team will contact you about a live interview.</p>
     <p style="font-size:13px">Reference ${esc(candidate.token)}</p>`,
  );
  return send({ to: candidate.email, subject: `We received your assessment — ${drive.name}`, html, text: `Thank you — your assessment for ${drive.name} was received. Reference ${candidate.token}.` });
}
