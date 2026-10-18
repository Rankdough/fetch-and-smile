import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, FileUp, Loader2, PenLine, Send, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PdfPages } from "@/components/sign/PdfPages";
import { SignAuthGate } from "@/components/sign/SignAuthGate";
import { SignaturePad } from "@/components/sign/SignaturePad";
import { useToast } from "@/hooks/use-toast";
import {
  MAX_PDF_BYTES, SIGN_BUCKET, functionError, sha256Hex, signDb,
  type FieldKind, type FieldParty, type SignFieldRow,
} from "@/lib/sign/db";

type DraftField = SignFieldRow;
type Tool = { party: FieldParty; kind: FieldKind } | null;

const SAVED_SIG_KEY = "sign.owner.signature";
const SIZES: Record<FieldKind, { w: number; h: number }> = { signature: { w: 0.28, h: 0.07 }, date: { w: 0.16, h: 0.03 } };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function readSavedSignature(): string | null {
  try {
    return localStorage.getItem(SAVED_SIG_KEY);
  } catch {
    return null;
  }
}

const TOOLS: { party: FieldParty; kind: FieldKind; label: string; icon: typeof PenLine }[] = [
  { party: "owner", kind: "signature", label: "My signature", icon: PenLine },
  { party: "owner", kind: "date", label: "My date", icon: CalendarDays },
  { party: "recipient", kind: "signature", label: "Client signature", icon: UserRound },
  { party: "recipient", kind: "date", label: "Client date", icon: CalendarDays },
];

function Editor() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [sha, setSha] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [fields, setFields] = useState<DraftField[]>([]);
  const [tool, setTool] = useState<Tool>(null);
  const [ownerSig, setOwnerSig] = useState<string | null>(readSavedSignature);
  const [sigDialog, setSigDialog] = useState(false);
  const [pendingSig, setPendingSig] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const fail = (description: string) => toast({ title: "Check this", description, variant: "destructive" });

  const loadFile = useCallback(
    async (file: File) => {
      const buf = await file.arrayBuffer();
      const head = new TextDecoder().decode(new Uint8Array(buf.slice(0, 5)));
      if (head !== "%PDF-") return fail("That file is not a PDF.");
      if (file.size > MAX_PDF_BYTES) return fail("PDF is larger than 25 MB.");
      setFields([]);
      setPageCount(0);
      setSha(await sha256Hex(buf));
      setTitle(file.name.replace(/\.pdf$/i, ""));
      setBytes(new Uint8Array(buf));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Esc drops the active tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setTool(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pickTool = (t: NonNullable<Tool>) => {
    if (t.party === "owner" && t.kind === "signature" && !ownerSig) {
      setPendingSig(null);
      setSigDialog(true);
    }
    setTool(t);
  };

  const saveSignature = () => {
    if (!pendingSig) return;
    setOwnerSig(pendingSig);
    try {
      localStorage.setItem(SAVED_SIG_KEY, pendingSig);
    } catch {
      /* storage blocked: signature lasts for this session only */
    }
    setSigDialog(false);
  };

  const placeField = (page: number, px: number, py: number) => {
    if (!tool) return;
    const { w, h } = SIZES[tool.kind];
    setFields((fs) => [
      ...fs,
      {
        id: crypto.randomUUID(), party: tool.party, kind: tool.kind, page,
        x: clamp(px - w / 2, 0, 1 - w), y: clamp(py - h / 2, 0, 1 - h), w, h, value: null,
      },
    ]);
    setTool(null);
  };

  const patchField = (id: string, patch: Partial<DraftField>) =>
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const send = async () => {
    if (!bytes) return;
    if (!title.trim()) return fail("Give the document a title.");
    if (!recipientName.trim()) return fail("Add the recipient's name.");
    if (!EMAIL_RE.test(recipientEmail.trim())) return fail("Enter a valid recipient email.");
    if (!fields.some((f) => f.party === "recipient" && f.kind === "signature")) return fail("Place at least one client signature box.");
    if (fields.some((f) => f.party === "owner" && f.kind === "signature") && !ownerSig) return fail("Draw or type your signature first.");

    setSending(true);
    const id = crypto.randomUUID();
    const path = `originals/${id}.pdf`;
    try {
      const { error: upErr } = await signDb.storage.from(SIGN_BUCKET).upload(path, bytes, { contentType: "application/pdf" });
      if (upErr) throw upErr;
      const { error: docErr } = await signDb.from("sign_documents").insert({
        id, title: title.trim(), original_path: path, original_sha256: sha, page_count: pageCount,
        recipient_name: recipientName.trim(), recipient_email: recipientEmail.trim(), message: message.trim() || null,
      });
      if (docErr) throw docErr;
      const { error: fErr } = await signDb.from("sign_fields").insert(
        fields.map((f) => ({
          document_id: id, party: f.party, kind: f.kind, page: f.page, x: f.x, y: f.y, w: f.w, h: f.h,
          value: f.party === "owner" && f.kind === "signature" ? ownerSig : null,
        })),
      );
      if (fErr) throw fErr;
    } catch (e) {
      setSending(false);
      toast({ title: "Could not save the document", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      return;
    }

    const { error: sendErr } = await signDb.functions.invoke("sign-send", { body: { document_id: id } });
    if (sendErr) {
      toast({ title: "Saved as a draft, email not sent", description: await functionError(sendErr), variant: "destructive" });
    } else {
      toast({ title: "Sent for signature", description: recipientEmail.trim() });
    }
    navigate(`/sign/${id}`);
  };

  if (!bytes) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">New document</h1>
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) loadFile(f);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed bg-background p-16 text-center transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30"}`}
        >
          <FileUp className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">Drop a PDF here, or click to choose one</p>
          <p className="text-sm text-muted-foreground">Up to 25 MB</p>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    );
  }

  const hasField = (party: FieldParty, kind: FieldKind) => fields.some((f) => f.party === party && f.kind === kind);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">1. Place boxes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {TOOLS.map((t) => {
              const active = tool?.party === t.party && tool.kind === t.kind;
              return (
                <Button
                  key={`${t.party}-${t.kind}`}
                  type="button"
                  variant={active ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => pickTool(t)}
                >
                  <t.icon className="mr-2 h-4 w-4" /> {t.label}
                  {hasField(t.party, t.kind) && <span className="ml-auto text-xs opacity-70">placed</span>}
                </Button>
              );
            })}
            <p className="text-xs text-muted-foreground">
              {tool ? "Click on the page to drop the box. Esc cancels." : "Pick a box, then click the page. Drag boxes to move them."}
            </p>
            {ownerSig && (
              <div className="flex items-center gap-2 rounded-md border bg-white p-2">
                <img src={ownerSig} alt="Your signature" className="h-8 max-w-[140px] object-contain" />
                <Button type="button" variant="link" size="sm" className="ml-auto h-auto p-0" onClick={() => { setPendingSig(null); setSigDialog(true); }}>
                  Change
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">2. Recipient</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1"><Label htmlFor="title">Title</Label><Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} /></div>
            <div className="space-y-1"><Label htmlFor="rname">Name</Label><Input id="rname" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={100} /></div>
            <div className="space-y-1"><Label htmlFor="remail">Email</Label><Input id="remail" type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} maxLength={200} /></div>
            <div className="space-y-1"><Label htmlFor="msg">Note (optional)</Label><Textarea id="msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={1000} /></div>
          </CardContent>
        </Card>

        <Button className="w-full" size="lg" onClick={send} disabled={sending}>
          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Send for signature
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setBytes(null)} disabled={sending}>Choose a different PDF</Button>
      </aside>

      <section className={tool ? "cursor-crosshair" : ""}>
        <PdfPages
          source={{ data: bytes }}
          onLoaded={setPageCount}
          onError={(m) => { fail(m); setBytes(null); }}
          onPageClick={placeField}
          renderOverlay={(page) =>
            fields.filter((f) => f.page === page).map((f) => (
              <FieldBox
                key={f.id}
                field={f}
                ownerSig={ownerSig}
                onChange={(patch) => patchField(f.id, patch)}
                onRemove={() => setFields((fs) => fs.filter((x) => x.id !== f.id))}
              />
            ))
          }
        />
      </section>

      <Dialog open={sigDialog} onOpenChange={setSigDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Your signature</DialogTitle></DialogHeader>
          <SignaturePad onChange={setPendingSig} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSigDialog(false)}>Cancel</Button>
            <Button onClick={saveSignature} disabled={!pendingSig}>Use this signature</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldBox({
  field, ownerSig, onChange, onRemove,
}: {
  field: DraftField;
  ownerSig: string | null;
  onChange: (patch: Partial<DraftField>) => void;
  onRemove: () => void;
}) {
  const mine = field.party === "owner";
  const drag = useRef<{ mode: "move" | "resize"; sx: number; sy: number; f: DraftField; pw: number; ph: number } | null>(null);

  const begin = (mode: "move" | "resize") => (e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    const pageEl = e.currentTarget.closest("[data-sign-page]") as HTMLElement | null;
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, f: field, pw: rect.width, ph: rect.height };
  };
  const move = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / d.pw;
    const dy = (e.clientY - d.sy) / d.ph;
    if (d.mode === "move") onChange({ x: clamp(d.f.x + dx, 0, 1 - d.f.w), y: clamp(d.f.y + dy, 0, 1 - d.f.h) });
    else onChange({ w: clamp(d.f.w + dx, 0.05, 1 - d.f.x), h: clamp(d.f.h + dy, 0.02, 1 - d.f.y) });
  };
  const end = () => { drag.current = null; };

  const label = `${mine ? "Me" : "Client"}: ${field.kind}`;
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={begin("move")}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      className={`group absolute cursor-move touch-none select-none rounded border-2 ${mine ? "border-blue-500 bg-blue-500/10" : "border-amber-500 bg-amber-500/10"}`}
      style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.w * 100}%`, height: `${field.h * 100}%` }}
    >
      {mine && field.kind === "signature" && ownerSig ? (
        <img src={ownerSig} alt="" draggable={false} className="pointer-events-none h-full w-full object-contain object-left" />
      ) : (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden px-1 text-[10px] font-medium uppercase tracking-wide text-foreground/70">
          {label}
        </span>
      )}
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
      >
        <X className="h-3 w-3" />
      </button>
      <span
        onPointerDown={begin("resize")}
        onPointerMove={move}
        onPointerUp={end}
        className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border bg-background"
      />
    </div>
  );
}

export default function SignNew() {
  return (
    <SignAuthGate>
      <Editor />
    </SignAuthGate>
  );
}
