import "server-only";

/**
 * D-10: transactional mail through Resend's HTTP API (`POST /emails`), called
 * with `fetch` — no SDK dependency.
 *
 * - Production requires `RESEND_API_KEY` and `RESEND_FROM_EMAIL`; the server
 *   refuses to start without them (`src/lib/startup-validation.ts`).
 * - Development and test never call Resend unless a key is configured: each
 *   message, link included, is written to the server log and kept in an
 *   in-memory sink that tests read. A test that stubs a key must also stub
 *   `fetch`; nothing here sends a real email on its own.
 * - Production never logs a recipient, a link or a token: a failure logs the
 *   message kind and the HTTP status only.
 */
export type MailKind =
  | "account-exists"
  | "registration-approved"
  | "registration-rejected"
  | "reset-password"
  | "verify-email";

export type OutgoingMail = {
  html: string;
  kind: MailKind;
  /** The one action link in the message, if any. Kept for the development log and tests. */
  link?: string;
  subject: string;
  text: string;
  to: string;
};

type MailEnvironment = {
  NODE_ENV?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
};

export type MailConfiguration =
  | { apiKey: string; from: string; mode: "resend" }
  | { mode: "record" };

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SENDER_PATTERN = /^(?:[^<>\r\n]{1,100} <)?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/;

export class MailDeliveryError extends Error {
  constructor(readonly kind: MailKind, readonly status: number | null) {
    super(`Mail delivery failed (${kind}${status === null ? "" : `, HTTP ${status}`}).`);
  }
}

export function resolveMailConfiguration(environment: MailEnvironment): MailConfiguration {
  const apiKey = environment.RESEND_API_KEY?.trim();
  const from = environment.RESEND_FROM_EMAIL?.trim();
  const production = environment.NODE_ENV === "production";

  if (!apiKey) {
    if (production) throw new Error("RESEND_API_KEY is required in production.");
    return { mode: "record" };
  }
  if (!from) {
    throw new Error("RESEND_FROM_EMAIL is required when RESEND_API_KEY is set.");
  }
  const bracketed = from.includes("<");
  if (!SENDER_PATTERN.test(from) || bracketed !== from.endsWith(">")) {
    throw new Error("RESEND_FROM_EMAIL must be an email address or \"Name <email>\".");
  }
  return { apiKey, from, mode: "resend" };
}

const recorded: OutgoingMail[] = [];

/** Messages recorded outside production. Tests read this; production has none. */
export function recordedMail(): readonly OutgoingMail[] {
  return recorded;
}

export function clearRecordedMail() {
  recorded.length = 0;
}

export async function sendMail(mail: OutgoingMail) {
  const configuration = resolveMailConfiguration(process.env);
  const production = process.env.NODE_ENV === "production";

  if (configuration.mode === "record") {
    recorded.push(mail);
    console.info(
      `[mail:${process.env.NODE_ENV ?? "development"}] ${mail.kind} to=${mail.to} subject="${mail.subject}"${mail.link ? ` link=${mail.link}` : ""}`,
    );
    return;
  }

  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      body: JSON.stringify({
        from: configuration.from,
        html: mail.html,
        subject: mail.subject,
        text: mail.text,
        to: [mail.to],
      }),
      headers: {
        authorization: `Bearer ${configuration.apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    console.error(`[mail] ${mail.kind} delivery failed: transport unavailable`);
    throw new MailDeliveryError(mail.kind, null);
  }
  if (!response.ok) {
    console.error(`[mail] ${mail.kind} delivery failed: HTTP ${response.status}`);
    throw new MailDeliveryError(mail.kind, response.status);
  }
  if (!production) {
    recorded.push(mail);
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * One plain layout for every message: a greeting, short paragraphs, at most one
 * button-sized link, and the same text for clients that do not render HTML.
 */
export function composeMail(input: {
  action?: { label: string; url: string };
  kind: MailKind;
  paragraphs: string[];
  subject: string;
  to: string;
}): OutgoingMail {
  const text = [
    ...input.paragraphs,
    ...(input.action ? [`${input.action.label}: ${input.action.url}`] : []),
    "Email ini dikirim otomatis oleh GeraiCUAN. Abaikan jika Anda tidak merasa melakukan permintaan ini.",
  ].join("\n\n");
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#111827;max-width:560px">',
    '<p style="font-size:20px;font-weight:700;margin:0 0 16px">GeraiCUAN</p>',
    ...input.paragraphs.map((paragraph) => `<p style="margin:0 0 16px">${escapeHtml(paragraph)}</p>`),
    input.action
      ? `<p style="margin:24px 0"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;background:#0b2d4f;color:#ffffff;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:700">${escapeHtml(input.action.label)}</a></p><p style="margin:0 0 16px;font-size:14px;color:#4b5563">Jika tombol tidak berfungsi, salin tautan ini ke browser: ${escapeHtml(input.action.url)}</p>`
      : "",
    '<p style="margin:24px 0 0;font-size:14px;color:#4b5563">Email ini dikirim otomatis oleh GeraiCUAN. Abaikan jika Anda tidak merasa melakukan permintaan ini.</p>',
    "</div>",
  ].join("");
  return {
    html,
    kind: input.kind,
    link: input.action?.url,
    subject: input.subject,
    text,
    to: input.to,
  };
}
