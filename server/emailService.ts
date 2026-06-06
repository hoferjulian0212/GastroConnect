// Transactional email via the Resend HTTP API (https://resend.com).
// Uses a plain fetch + RESEND_API_KEY so it works in both dev and production
// without any extra runtime dependency.

const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Sender address. Resend only allows arbitrary "from" domains once a domain is
// verified in the Resend dashboard; until then the shared onboarding sender
// works but can only deliver to your own Resend account address. Override with
// RESEND_FROM_EMAIL once a custom domain is verified.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "GastroConnect <onboarding@resend.dev>";

export function isEmailConfigured(): boolean {
  return Boolean(RESEND_API_KEY);
}

function appBaseUrl(): string | null {
  const domains = process.env.REPLIT_DOMAINS;
  if (!domains) return null;
  const first = domains.split(",")[0]?.trim();
  return first ? `https://${first}` : null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  if (!opts.to) return false;
  if (!RESEND_API_KEY) {
    // Not configured — degrade gracefully. In-app notifications still happen.
    return false;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("[email] Resend rejected message", { status: response.status, to: opts.to, body: text.slice(0, 400) });
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("[email] send failed", { to: opts.to, error: err?.message ?? String(err) });
    return false;
  }
}

// Renders a simple branded notification email reusing the in-app title/message
// (already localized at the call site) plus an optional deep link.
export function renderNotificationEmail(opts: { title: string; message: string; linkPath?: string }): string {
  const base = appBaseUrl();
  const href = base && opts.linkPath ? `${base}${opts.linkPath}` : null;
  const button = href
    ? `<a href="${escapeHtml(href)}" style="display:inline-block;margin-top:20px;padding:12px 22px;background:#161921;color:#ffffff;text-decoration:none;border-radius:9999px;font-size:14px;font-weight:600;">In GastroConnect öffnen</a>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#161921;border-radius:20px 20px 0 0;padding:20px 24px;">
      <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">GastroConnect</span>
    </div>
    <div style="background:#ffffff;border-radius:0 0 20px 20px;padding:24px;border:1px solid #e5e7eb;border-top:none;">
      <h1 style="margin:0 0 12px;font-size:18px;color:#111827;">${escapeHtml(opts.title)}</h1>
      <p style="margin:0;font-size:15px;line-height:1.55;color:#374151;white-space:pre-line;">${escapeHtml(opts.message)}</p>
      ${button}
    </div>
    <p style="margin:16px 4px 0;font-size:12px;color:#9ca3af;">
      Sie erhalten diese E-Mail aufgrund Ihrer Benachrichtigungseinstellungen in GastroConnect.
      Sie können diese in den Einstellungen jederzeit anpassen.
    </p>
  </div>
</body></html>`;
}
