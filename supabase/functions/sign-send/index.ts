// Edge function: sign-send
// Owner only. Emails the recipient a one-time signing link for a document.
// Body: { document_id }. Works for first send and for reminders (a reminder replaces the old link).
// Env: RESEND_API_KEY, SIGN_FROM_EMAIL, APP_URL, optional OWNER_EMAIL (default info@rankdough.com)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  TOKEN_TTL_DAYS,
  appUrl,
  corsHeaders,
  emailButton,
  emailShell,
  escapeHtml,
  json,
  newToken,
  requireOwner,
  sendMail,
  serviceClient,
  sha256Hex,
} from "../_shared/signCommon.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const owner = await requireOwner(req);
    if (!owner) return json({ error: "Not authorised" }, 401);

    const { document_id } = await req.json();
    if (typeof document_id !== "string") return json({ error: "document_id required" }, 400);

    const db = serviceClient();
    const { data: doc, error } = await db.from("sign_documents").select("*").eq("id", document_id).maybeSingle();
    if (error) throw error;
    if (!doc) return json({ error: "Document not found" }, 404);
    if (doc.status === "signed" || doc.status === "void") return json({ error: `Document is already ${doc.status}` }, 409);
    if (!doc.recipient_email || !EMAIL_RE.test(doc.recipient_email) || !doc.recipient_name) {
      return json({ error: "Recipient name and a valid email are required" }, 400);
    }

    const { data: fields, error: fErr } = await db.from("sign_fields").select("*").eq("document_id", doc.id);
    if (fErr) throw fErr;
    if (!fields?.some((f) => f.party === "recipient" && f.kind === "signature")) {
      return json({ error: "Place at least one recipient signature field first" }, 400);
    }
    if (fields.some((f) => f.party === "owner" && f.kind === "signature" && !f.value)) {
      return json({ error: "Add your own signature before sending" }, 400);
    }

    // One live link per document: a reminder retires the previous one.
    await db.from("sign_tokens").delete().eq("document_id", doc.id).is("used_at", null);
    const token = newToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000).toISOString();
    const { error: tErr } = await db
      .from("sign_tokens")
      .insert({ document_id: doc.id, token_hash: await sha256Hex(token), expires_at: expiresAt });
    if (tErr) throw tErr;

    const link = `${appUrl()}/sign/s/${token}`;
    const note = doc.message ? `<p style="white-space:pre-wrap;border-left:3px solid #ddd;padding-left:12px;color:#444">${escapeHtml(doc.message)}</p>` : "";
    await sendMail({
      to: doc.recipient_email,
      replyTo: owner,
      subject: `Please sign: ${doc.title}`,
      html: emailShell(
        `<p>Hi ${escapeHtml(doc.recipient_name)},</p>
         <p>Rankdough has sent you <strong>${escapeHtml(doc.title)}</strong> to sign.</p>${note}
         ${emailButton(link, "Review and sign")}
         <p style="color:#666;font-size:13px">This link is personal to you and works once. It expires on ${new Date(expiresAt).toUTCString().slice(5, 16)}.<br>Questions? Reply to this email.</p>`,
      ),
      text: `Hi ${doc.recipient_name},\n\nRankdough has sent you "${doc.title}" to sign.\n${doc.message ? `\n${doc.message}\n` : ""}\nReview and sign: ${link}\n\nThis link is personal to you and works once. Questions? Reply to this email.`,
    });

    const { error: uErr } = await db
      .from("sign_documents")
      .update({ status: "sent", sent_at: doc.sent_at ?? new Date().toISOString(), expires_at: expiresAt })
      .eq("id", doc.id);
    if (uErr) throw uErr;

    return json({ ok: true, expires_at: expiresAt });
  } catch (e) {
    console.error("sign-send failed", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
