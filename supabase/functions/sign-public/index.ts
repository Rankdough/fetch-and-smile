// Edge function: sign-public
// Recipient-facing, no Supabase session. Authorised by the one-time token from the email link.
//   { action: "view", token }                               -> document, fields, short-lived PDF URL
//   { action: "sign", token, signature, consent: true }     -> flattens, stores, emails both parties
// Env: RESEND_API_KEY, SIGN_FROM_EMAIL, APP_URL, optional OWNER_EMAIL
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildSignedPdf, type SignField } from "../_shared/signPdf.ts";
import {
  BUCKET,
  appUrl,
  corsHeaders,
  emailButton,
  emailShell,
  escapeHtml,
  json,
  ownerEmail,
  sendMail,
  serviceClient,
  sha256Hex,
  toBase64,
} from "../_shared/signCommon.ts";

const MAX_SIGNATURE_CHARS = 700_000;
const MAX_ATTACH_BYTES = 10 * 1024 * 1024;

type Db = ReturnType<typeof serviceClient>;

async function loadByToken(db: Db, token: unknown) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return { error: json({ error: "Invalid link" }, 404) };
  const { data: row, error } = await db
    .from("sign_tokens")
    .select("id, document_id, expires_at, used_at")
    .eq("token_hash", await sha256Hex(token))
    .maybeSingle();
  if (error) throw error;
  if (!row) return { error: json({ error: "Invalid link" }, 404) };
  const { data: doc, error: dErr } = await db.from("sign_documents").select("*").eq("id", row.document_id).single();
  if (dErr) throw dErr;
  return { row, doc };
}

async function signedUrl(db: Db, path: string, seconds: number) {
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const db = serviceClient();
    const found = await loadByToken(db, body.token);
    if (found.error) return found.error;
    const { row, doc } = found;

    if (doc.status === "void") return json({ error: "This document was withdrawn by the sender", code: "void" }, 410);

    // A finished document stays viewable through its own link.
    if (doc.status === "signed") {
      if (body.action === "sign") return json({ error: "Already signed", code: "signed" }, 409);
      return json({
        status: "signed",
        title: doc.title,
        signed_at: doc.signed_at,
        download_url: await signedUrl(db, doc.signed_path, 600),
      });
    }

    if (new Date(row.expires_at) < new Date()) return json({ error: "This link has expired. Ask the sender for a new one.", code: "expired" }, 410);
    if (row.used_at) return json({ error: "This link was already used", code: "used" }, 409);

    if (body.action === "view") {
      const { data: fields, error } = await db.from("sign_fields").select("*").eq("document_id", doc.id);
      if (error) throw error;
      return json({
        status: "sent",
        title: doc.title,
        recipient_name: doc.recipient_name,
        message: doc.message,
        sender: "Rankdough",
        sent_at: doc.sent_at,
        page_count: doc.page_count,
        pdf_url: await signedUrl(db, doc.original_path, 900),
        fields: (fields ?? []).map((f) => ({
          id: f.id, party: f.party, kind: f.kind, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h,
          value: f.party === "owner" ? f.value : null,
        })),
      });
    }

    if (body.action !== "sign") return json({ error: "Unknown action" }, 400);

    const signature = body.signature;
    if (typeof signature !== "string" || signature.length > MAX_SIGNATURE_CHARS || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature)) {
      return json({ error: "A valid signature is required" }, 400);
    }
    if (body.consent !== true) return json({ error: "Consent is required" }, 400);

    // Claim the token atomically so a double click or a replay cannot sign twice.
    const { data: claimed, error: cErr } = await db
      .from("sign_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("used_at", null)
      .select("id");
    if (cErr) throw cErr;
    if (!claimed?.length) return json({ error: "This link was already used", code: "used" }, 409);

    try {
      const { data: file, error: dlErr } = await db.storage.from(BUCKET).download(doc.original_path);
      if (dlErr || !file) throw dlErr ?? new Error("Original file missing");
      const original = new Uint8Array(await file.arrayBuffer());
      if ((await sha256Hex(original)) !== doc.original_sha256) throw new Error("Original file does not match its recorded hash");

      const { data: fields, error: fErr } = await db.from("sign_fields").select("*").eq("document_id", doc.id);
      if (fErr) throw fErr;

      const signedAt = new Date().toISOString();
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
      const ua = (req.headers.get("user-agent") ?? "").slice(0, 300);
      const owner = ownerEmail();

      const pdfBytes = await buildSignedPdf(
        original,
        (fields ?? []) as SignField[],
        signature,
        { owner: doc.sent_at ?? signedAt, recipient: signedAt },
        {
          documentId: doc.id,
          title: doc.title,
          ownerEmail: owner,
          recipientName: doc.recipient_name,
          recipientEmail: doc.recipient_email,
          sentAt: doc.sent_at ?? signedAt,
          signedAt,
          signerIp: ip,
          signerUserAgent: ua,
          originalSha256: doc.original_sha256,
        },
      );

      const signedPath = `signed/${doc.id}.pdf`;
      const { error: upErr } = await db.storage.from(BUCKET).upload(signedPath, pdfBytes, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;

      const { data: updated, error: uErr } = await db
        .from("sign_documents")
        .update({
          status: "signed",
          signed_at: signedAt,
          signed_path: signedPath,
          signed_sha256: await sha256Hex(pdfBytes),
          signer_ip: ip || null,
          signer_user_agent: ua || null,
        })
        .eq("id", doc.id)
        .in("status", ["sent", "draft"])
        .select("id");
      if (uErr) throw uErr;
      if (!updated?.length) throw new Error("Document is no longer open for signing");

      // Email failures must not undo a signature that is already stored.
      try {
        const attachments = pdfBytes.length <= MAX_ATTACH_BYTES
          ? [{ filename: `${doc.title.replace(/[^\w.\- ]+/g, "").trim() || "document"} (signed).pdf`, content: toBase64(pdfBytes) }]
          : undefined;
        const detailLink = `${appUrl()}/sign/${doc.id}`;
        await sendMail({
          to: owner,
          subject: `Signed: ${doc.title}`,
          html: emailShell(
            `<p><strong>${escapeHtml(doc.recipient_name)}</strong> (${escapeHtml(doc.recipient_email)}) signed <strong>${escapeHtml(doc.title)}</strong>.</p>
             <p>${attachments ? "The signed copy is attached." : "The file is too large to attach."}</p>${emailButton(detailLink, "Open in dashboard")}`,
          ),
          text: `${doc.recipient_name} (${doc.recipient_email}) signed "${doc.title}".\n${attachments ? "The signed copy is attached." : ""}\n${detailLink}`,
          attachments,
        });
        await sendMail({
          to: doc.recipient_email,
          replyTo: owner,
          subject: `Your signed copy: ${doc.title}`,
          html: emailShell(`<p>Hi ${escapeHtml(doc.recipient_name)},</p><p>Thank you. Your signed copy of <strong>${escapeHtml(doc.title)}</strong> is attached for your records.</p>`),
          text: `Hi ${doc.recipient_name},\n\nThank you. Your signed copy of "${doc.title}" is attached for your records.`,
          attachments,
        });
      } catch (mailErr) {
        console.error("sign-public: confirmation email failed", mailErr);
      }

      return json({ ok: true, signed_at: signedAt, download_url: await signedUrl(db, signedPath, 600) });
    } catch (e) {
      // Nothing was stored as signed, so give the recipient their link back.
      await db.from("sign_tokens").update({ used_at: null }).eq("id", row.id);
      throw e;
    }
  } catch (e) {
    console.error("sign-public failed", e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
