import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Download, FileSignature, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { PdfPages } from "@/components/sign/PdfPages";
import { SignaturePad } from "@/components/sign/SignaturePad";
import { supabase } from "@/integrations/supabase/client";
import { formatDay, functionError, type SignFieldRow } from "@/lib/sign/db";

type View =
  | { status: "sent"; title: string; recipient_name: string; message: string | null; sender: string; sent_at: string | null; pdf_url: string; fields: SignFieldRow[] }
  | { status: "signed"; title: string; signed_at: string; download_url: string };

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("sign-public", { body });
  if (error) throw new Error(await functionError(error));
  return data;
}

export default function SignPublic() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<View | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [consent, setConsent] = useState(false);
  const [signing, setSigning] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    call({ action: "view", token })
      .then(setView)
      .catch((e) => setProblem(e instanceof Error ? e.message : "This link is not valid."));
  }, [token]);

  const sign = useCallback(async () => {
    if (!signature) return;
    setSigning(true);
    try {
      const res = await call({ action: "sign", token, signature, consent: true });
      setView({ status: "signed", title: view?.title ?? "", signed_at: res.signed_at, download_url: res.download_url });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not sign. Please try again.");
    } finally {
      setSigning(false);
    }
  }, [signature, token, view?.title]);

  if (problem && !(view?.status === "sent")) {
    return (
      <Centered>
        <TriangleAlert className="mx-auto mb-3 h-10 w-10 text-amber-500" />
        <h1 className="text-lg font-semibold">This link cannot be used</h1>
        <p className="mt-1 text-sm text-muted-foreground">{problem}</p>
      </Centered>
    );
  }
  if (!view) {
    return <Centered><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></Centered>;
  }

  if (view.status === "signed") {
    return (
      <Centered>
        <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-600" />
        <h1 className="text-xl font-semibold">All done</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {view.title} was signed on {formatDay(view.signed_at)}. A copy is on its way to your inbox.
        </p>
        <Button asChild className="mt-6">
          <a href={view.download_url} target="_blank" rel="noopener noreferrer"><Download className="mr-2 h-4 w-4" /> Download signed PDF</a>
        </Button>
      </Centered>
    );
  }

  const today = formatDay(new Date());
  const showPad = changing || !signature;

  return (
    <div className="min-h-screen bg-muted/40 pb-64 sm:pb-52">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <FileSignature className="h-5 w-5" />
          <div className="min-w-0">
            <h1 className="truncate font-semibold">{view.title}</h1>
            <p className="text-xs text-muted-foreground">From {view.sender}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-2 py-4 sm:px-4">
        {view.message && (
          <Card><CardContent className="whitespace-pre-wrap p-4 text-sm">{view.message}</CardContent></Card>
        )}
        {pdfError && <p className="text-sm text-destructive">{pdfError}</p>}
        <PdfPages
          source={{ url: view.pdf_url }}
          onError={setPdfError}
          renderOverlay={(page) =>
            view.fields.filter((f) => f.page === page).map((f) => (
              <div
                key={f.id}
                className="absolute"
                style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
              >
                <FieldView field={f} signature={signature} today={today} sentOn={view.sent_at ? formatDay(view.sent_at) : today} />
              </div>
            ))
          }
        />
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t bg-background shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <div className="mx-auto max-w-3xl space-y-3 p-4">
          {showPad ? (
            <>
              <SignaturePad defaultName={view.recipient_name} onChange={(png) => { setSignature(png); }} />
              {signature && (
                <Button variant="outline" size="sm" onClick={() => setChanging(false)}>Use this signature</Button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3">
              <img src={signature!} alt="Your signature" className="h-10 max-w-[200px] rounded border bg-white object-contain p-1" />
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setChanging(true)}>Change</Button>
            </div>
          )}
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
            <span>I agree to sign this document electronically and that my signature is legally binding.</span>
          </label>
          {problem && <p className="text-sm text-destructive">{problem}</p>}
          <Button size="lg" className="w-full" onClick={sign} disabled={!signature || !consent || signing || showPad}>
            {signing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign document
          </Button>
        </div>
      </footer>
    </div>
  );
}

function FieldView({ field, signature, today, sentOn }: { field: SignFieldRow; signature: string | null; today: string; sentOn: string }) {
  if (field.kind === "signature") {
    const img = field.party === "owner" ? field.value : signature;
    if (img) return <img src={img} alt="" className="h-full w-full object-contain object-left" />;
    return (
      <div className="flex h-full w-full items-center justify-center rounded border-2 border-dashed border-amber-500 bg-amber-100/60 text-xs font-semibold uppercase tracking-wide text-amber-800">
        Sign here
      </div>
    );
  }
  // The final copy stamps the owner's date with the send date and the recipient's with the signing date.
  return <div className="flex h-full items-center text-[length:min(12px,2.4vw)] text-foreground">{field.party === "recipient" ? today : sentOn}</div>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <div className="max-w-sm text-center">{children}</div>
    </div>
  );
}
