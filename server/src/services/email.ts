import { config } from "../config.js";
import { logger } from "../lib/logger.js";

/**
 * Minimal transactional email helper backed by Resend's REST API.
 *
 * When RESEND_API_KEY is not configured (local dev / sandbox), the email is
 * never sent — instead its contents are logged so reset links remain usable
 * for demo accounts. Callers that need to know whether delivery actually
 * happened can check the boolean return value.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  const { apiKey, from } = config.resend;

  if (!apiKey) {
    logger.info("[email:dev-fallback] would send email", {
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logger.error("Resend email failed", { status: res.status, detail: detail.slice(0, 500) });
      return false;
    }
    logger.info("Resend email sent", { to: opts.to, subject: opts.subject });
    return true;
  } catch (err) {
    logger.error("Resend email error", { error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/** Build a friendly password-reset email body. */
export function passwordResetEmailHtml(link: string, userName: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f1ea;font-family:system-ui,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:24px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" max-width="480" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e0d5;">
          <tr>
            <td style="background:linear-gradient(135deg,#3e7c3e,#2f5d2f);padding:20px 28px;">
              <span style="font-size:20px;font-weight:700;color:#ffffff;">🧅 Onion Facility Center</span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 8px;font-size:18px;color:#22301f;">Reset your password</h1>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#5b5f55;">
                Hello ${userName},<br/>
                We received a request to reset the password for your Onion Facility Center account.
                This link is valid for <strong>1 hour</strong> and can only be used once.
              </p>
              <a href="${link}"
                 style="display:inline-block;background:#3e7c3e;color:#ffffff;text-decoration:none;
                        font-size:14px;font-weight:600;padding:12px 24px;border-radius:10px;">
                Reset password
              </a>
              <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#5b5f55;">
                Or copy this link into your browser:<br/>
                <span style="color:#2f5d2f;word-break:break-all;">${link}</span>
              </p>
              <p style="margin:20px 0 0;font-size:12px;color:#9aa08f;border-top:1px solid #eeeae0;padding-top:16px;">
                If you didn't request this, you can safely ignore this email. Your password won't change.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
