// Admin email notification helper.
//
// GastroConnect has no built-in email infrastructure. This helper sends an
// admin email ONLY when an email provider + admin recipient are configured via
// secrets (SENDGRID_API_KEY + ADMIN_EMAIL). When they are not configured it
// returns false so callers can fall back to the existing in-app notification
// path — the feature never silently fails.

interface AdminEmail {
  subject: string;
  text: string;
}

export function isAdminEmailConfigured(): boolean {
  return !!(process.env.SENDGRID_API_KEY && process.env.ADMIN_EMAIL);
}

export async function sendAdminEmail(email: AdminEmail): Promise<boolean> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const to = process.env.ADMIN_EMAIL;
  const from = process.env.ADMIN_EMAIL_FROM || to;
  if (!apiKey || !to || !from) return false;

  try {
    const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject: email.subject,
        content: [{ type: "text/plain", value: email.text }],
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error("[adminNotify] email send failed", resp.status, body.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[adminNotify] email send error", err instanceof Error ? err.message : String(err));
    return false;
  }
}
