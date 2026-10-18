import { describe, expect, it } from "vitest";
import { PDFDocument, degrees } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  buildSignedPdf,
  dataUrlToBytes,
  displayToUser,
  formatDate,
  winAnsiSafe,
  type CertificateInfo,
  type Rotation,
  type SignField,
} from "../../supabase/functions/_shared/signPdf";

// 1x1 PNG
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const cert: CertificateInfo = {
  documentId: "11111111-2222-3333-4444-555555555555",
  title: "Statement of Work – Müller & Söhne 日本",
  ownerEmail: "info@rankdough.com",
  recipientName: "Zoë Client",
  recipientEmail: "zoe@example.com",
  sentAt: "2026-10-18T10:00:00Z",
  signedAt: "2026-10-19T09:30:15Z",
  signerIp: "203.0.113.7",
  signerUserAgent: "Mozilla/5.0 ".repeat(30),
  originalSha256: "a".repeat(64),
};

async function makePdf(rotations: number[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const r of rotations) {
    const page = pdf.addPage([600, 800]);
    page.setRotation(degrees(r));
  }
  return pdf.save();
}

const field = (over: Partial<SignField>): SignField => ({
  id: "f", party: "recipient", kind: "signature", page: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.1, value: null, ...over,
});

describe("displayToUser", () => {
  // Independent forward mapping: unrotated user space -> displayed page, origin top-left.
  const forward = (ux: number, uy: number, W: number, H: number, r: Rotation): [number, number] => {
    switch (r) {
      case 0: return [ux, H - uy];
      case 90: return [uy, ux];
      case 180: return [W - ux, uy];
      case 270: return [H - uy, W - ux];
    }
  };
  it.each([0, 90, 180, 270] as Rotation[])("round-trips at %i degrees", (r) => {
    const W = 600, H = 800;
    for (const [px, py] of [[10, 20], [250, 400], [599, 1]]) {
      const [ux, uy] = displayToUser(px, py, W, H, r);
      const [bx, by] = forward(ux, uy, W, H, r);
      expect(bx).toBeCloseTo(px);
      expect(by).toBeCloseTo(py);
    }
  });
});

describe("buildSignedPdf", () => {
  it("adds a certificate page and survives non-Latin text", async () => {
    const out = await buildSignedPdf(
      await makePdf([0, 0]),
      [field({}), field({ id: "d", kind: "date", page: 2 }), field({ id: "o", party: "owner", value: PNG, page: 2, y: 0.6 })],
      PNG,
      { owner: cert.sentAt, recipient: cert.signedAt },
      cert,
    );
    const loaded = await PDFDocument.load(out);
    expect(loaded.getPageCount()).toBe(3);
  });

  it("throws when an owner signature has no image", async () => {
    await expect(
      buildSignedPdf(await makePdf([0]), [field({ party: "owner" })], PNG, { owner: cert.sentAt, recipient: cert.signedAt }, cert),
    ).rejects.toThrow(/no signature/);
  });

  it("throws when a field points past the last page", async () => {
    await expect(
      buildSignedPdf(await makePdf([0]), [field({ page: 2 })], PNG, { owner: cert.sentAt, recipient: cert.signedAt }, cert),
    ).rejects.toThrow(/page 2/);
  });

  // Reads the placed image back with pdf.js and checks it lands inside the box the user drew,
  // measured in the page as displayed (rotation applied).
  it.each([0, 90, 180, 270])("places the signature inside the drawn box on a %i degree page", async (rot) => {
    const f = field({ x: 0.2, y: 0.3, w: 0.4, h: 0.1 });
    const out = await buildSignedPdf(await makePdf([rot]), [f], PNG, { owner: cert.sentAt, recipient: cert.signedAt }, cert);
    const doc = await pdfjs.getDocument({ data: out.slice(), useSystemFonts: true }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const ops = await page.getOperatorList();
    let ctm: number[] | null = null;
    const stack: number[][] = [];
    let current = [1, 0, 0, 1, 0, 0];
    const mul = (a: number[], b: number[]) => [
      a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
    ];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      if (fn === pdfjs.OPS.save) stack.push(current);
      else if (fn === pdfjs.OPS.restore) current = stack.pop() ?? current;
      else if (fn === pdfjs.OPS.transform) current = mul(current, ops.argsArray[i] as number[]);
      else if (fn === pdfjs.OPS.paintImageXObject) ctm = current;
    }
    expect(ctm).not.toBeNull();
    // Image occupies the unit square in its own space. Map its corners to the displayed page.
    const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([u, v]) => {
      const ux = ctm![0] * u + ctm![2] * v + ctm![4];
      const uy = ctm![1] * u + ctm![3] * v + ctm![5];
      return viewport.convertToViewportPoint(ux, uy);
    });
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    const W = viewport.width, H = viewport.height;
    const eps = 0.5;
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(f.x * W - eps);
    expect(Math.max(...xs)).toBeLessThanOrEqual((f.x + f.w) * W + eps);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(f.y * H - eps);
    expect(Math.max(...ys)).toBeLessThanOrEqual((f.y + f.h) * H + eps);
    // 1x1 image contain-fit: square limited by box height, so edge length equals the box height.
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(f.h * H, 0);
  });
});

describe("helpers", () => {
  it("rejects non-PNG signatures", () => {
    expect(() => dataUrlToBytes("data:image/jpeg;base64,AAAA")).toThrow();
    expect(() => dataUrlToBytes("javascript:alert(1)")).toThrow();
  });
  it("formats dates in UTC", () => {
    expect(formatDate("2026-10-19T23:59:59Z")).toBe("19 Oct 2026");
  });
  it("replaces characters outside WinAnsi", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont("Helvetica");
    expect(winAnsiSafe("Zoë 日本", font)).toBe("Zoë ??");
  });
});
