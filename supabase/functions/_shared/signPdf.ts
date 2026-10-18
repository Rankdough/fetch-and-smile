// Flattens signature and date fields into a PDF and appends a certificate page.
// Pure function over bytes. No network, no Deno APIs, so Vitest can run it under Node
// (vitest.config.ts aliases the npm: specifier to the installed pdf-lib package).
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";

export interface SignField {
  id: string;
  party: "owner" | "recipient";
  kind: "signature" | "date";
  page: number; // 1-based
  x: number; // fractions of the displayed page, origin top-left
  y: number;
  w: number;
  h: number;
  value: string | null; // owner signature PNG data URL
}

export interface CertificateInfo {
  documentId: string;
  title: string;
  ownerEmail: string;
  recipientName: string;
  recipientEmail: string;
  sentAt: string; // ISO
  signedAt: string; // ISO
  signerIp: string;
  signerUserAgent: string;
  originalSha256: string;
}

export type Rotation = 0 | 90 | 180 | 270;

/**
 * Maps a point given in displayed-page units (origin top-left, after /Rotate is applied)
 * to unrotated user space (origin bottom-left). W and H are the unrotated page size.
 */
export function displayToUser(px: number, py: number, W: number, H: number, rotation: Rotation): [number, number] {
  switch (rotation) {
    case 0:
      return [px, H - py];
    case 90:
      return [py, px];
    case 180:
      return [W - px, py];
    case 270:
      return [W - py, H - px];
  }
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error("Signature must be a PNG data URL");
  const bin = atob(m[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Standard PDF fonts only cover WinAnsi. Replace anything else so drawText cannot throw. */
export function winAnsiSafe(text: string, font: PDFFont): string {
  let out = "";
  for (const ch of text.replace(/[\r\n\t]+/g, " ")) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    // Hard-break words longer than the line (hashes, user agents).
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > maxWidth) {
      let cut = rest.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    const candidate = line ? `${line} ${rest}` : rest;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = rest;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${formatDate(iso)} ${hh}:${mm}:${ss} UTC`;
}

export async function buildSignedPdf(
  originalBytes: Uint8Array,
  fields: SignField[],
  recipientSignaturePng: string,
  dates: { owner: string; recipient: string }, // ISO timestamps used for date fields
  cert: CertificateInfo,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(originalBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();

  const recipientImage = await pdf.embedPng(dataUrlToBytes(recipientSignaturePng));
  const imageCache = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();

  for (const f of fields) {
    const page = pages[f.page - 1];
    if (!page) throw new Error(`Field ${f.id} points at page ${f.page}, which does not exist`);
    const box = page.getCropBox();
    const rotation = ((((page.getRotation().angle % 360) + 360) % 360) as Rotation);
    const swap = rotation === 90 || rotation === 270;
    const dispW = swap ? box.height : box.width;
    const dispH = swap ? box.width : box.height;

    const bw = f.w * dispW;
    const bh = f.h * dispH;
    const left = f.x * dispW;
    const top = f.y * dispH;

    if (f.kind === "signature") {
      let image = recipientImage;
      if (f.party === "owner") {
        if (!f.value) throw new Error(`Owner signature field ${f.id} has no signature`);
        image = imageCache.get(f.value) ?? (await pdf.embedPng(dataUrlToBytes(f.value)));
        imageCache.set(f.value, image);
      }
      // Contain-fit, left aligned, vertically centred.
      const scale = Math.min(bw / image.width, bh / image.height);
      const iw = image.width * scale;
      const ih = image.height * scale;
      const [ux, uy] = displayToUser(left, top + (bh + ih) / 2, box.width, box.height, rotation);
      page.drawImage(image, { x: box.x + ux, y: box.y + uy, width: iw, height: ih, rotate: degrees(rotation) });
    } else {
      const text = winAnsiSafe(formatDate(f.party === "owner" ? dates.owner : dates.recipient), font);
      let size = Math.min(bh * 0.7, 12);
      while (size > 4 && font.widthOfTextAtSize(text, size) > bw) size -= 0.5;
      const baseline = top + bh / 2 + size * 0.35;
      const [ux, uy] = displayToUser(left, baseline, box.width, box.height, rotation);
      page.drawText(text, { x: box.x + ux, y: box.y + uy, size, font, color: rgb(0.1, 0.1, 0.1), rotate: degrees(rotation) });
    }
  }

  drawCertificate(pdf.addPage([595.28, 841.89]), font, bold, cert);
  return await pdf.save();
}

function drawCertificate(page: PDFPage, font: PDFFont, bold: PDFFont, c: CertificateInfo) {
  const margin = 56;
  const maxWidth = page.getWidth() - margin * 2;
  let y = page.getHeight() - margin;
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.4, 0.4, 0.4);

  const line = (text: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = opts.size ?? 10;
    const f = opts.font ?? font;
    for (const l of wrap(winAnsiSafe(text, f), f, size, maxWidth)) {
      page.drawText(l, { x: margin, y, size, font: f, color: opts.color ?? ink });
      y -= size * 1.5;
    }
    y -= opts.gap ?? 0;
  };
  const row = (label: string, value: string) => {
    line(label.toUpperCase(), { size: 7.5, font: bold, color: muted });
    line(value, { size: 10, gap: 6 });
  };

  line("Certificate of completion", { size: 20, font: bold, gap: 4 });
  line("This page records how the document was signed. It was added automatically and is part of the signed file.", {
    size: 9,
    color: muted,
    gap: 18,
  });
  row("Document", c.title);
  row("Document ID", c.documentId);
  row("Sent by", `${c.ownerEmail} on ${formatDateTime(c.sentAt)}`);
  row("Signed by", `${c.recipientName} <${c.recipientEmail}>`);
  row("Signed at", formatDateTime(c.signedAt));
  row("Signer IP address", c.signerIp || "not available");
  row("Signer browser", c.signerUserAgent || "not available");
  row("SHA-256 of the original PDF", c.originalSha256);
  y -= 6;
  line(
    "The signer opened a one-time link sent to the email address above and confirmed intent to sign electronically. Compare the hash above with the original file to confirm no changes were made before signing.",
    { size: 9, color: muted },
  );
}
