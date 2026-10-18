import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Ban, Download, Loader2, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignAuthGate } from "@/components/sign/SignAuthGate";
import { useToast } from "@/hooks/use-toast";
import { STATUS_LABEL, STATUS_VARIANT, SIGN_BUCKET, formatDay, functionError, openStoredFile, signDb, type SignDocument } from "@/lib/sign/db";

function Detail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [doc, setDoc] = useState<SignDocument | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await signDb.from("sign_documents").select("*").eq("id", id).maybeSingle();
    setDoc((data as SignDocument | null) ?? null);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast({ title: "Something went wrong", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (doc === undefined) return <Loader2 className="mx-auto mt-16 h-6 w-6 animate-spin text-muted-foreground" />;
  if (doc === null) return <p className="text-muted-foreground">Document not found.</p>;

  const send = () =>
    run("send", async () => {
      const { error } = await signDb.functions.invoke("sign-send", { body: { document_id: doc.id } });
      if (error) throw new Error(await functionError(error));
      toast({ title: doc.status === "sent" ? "Reminder sent" : "Sent for signature", description: doc.recipient_email ?? undefined });
      await load();
    });

  const withdraw = () =>
    run("void", async () => {
      if (!window.confirm("Withdraw this document? The recipient's link will stop working.")) return;
      const { error } = await signDb.from("sign_documents").update({ status: "void" }).eq("id", doc.id);
      if (error) throw error;
      await load();
    });

  const remove = () =>
    run("delete", async () => {
      if (!window.confirm("Delete this document and its files permanently?")) return;
      await signDb.storage.from(SIGN_BUCKET).remove([doc.original_path, ...(doc.signed_path ? [doc.signed_path] : [])]);
      const { error } = await signDb.from("sign_documents").delete().eq("id", doc.id);
      if (error) throw error;
      navigate("/sign");
    });

  const open = (path: string) => run("open", () => openStoredFile(path));
  const isOpen = doc.status === "draft" || doc.status === "sent";

  return (
    <div className="space-y-4">
      <Link to="/sign" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Documents
      </Link>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <CardTitle className="text-xl">{doc.title}</CardTitle>
          <Badge variant={STATUS_VARIANT[doc.status]}>{STATUS_LABEL[doc.status]}</Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Recipient</dt><dd>{doc.recipient_name} ({doc.recipient_email})</dd></div>
            <div><dt className="text-muted-foreground">Pages</dt><dd>{doc.page_count}</dd></div>
            <div><dt className="text-muted-foreground">Sent</dt><dd>{doc.sent_at ? formatDay(doc.sent_at) : "Not sent"}</dd></div>
            {doc.status === "sent" && doc.expires_at && (
              <div><dt className="text-muted-foreground">Link expires</dt><dd>{formatDay(doc.expires_at)}</dd></div>
            )}
            {doc.signed_at && <div><dt className="text-muted-foreground">Signed</dt><dd>{formatDay(doc.signed_at)}{doc.signer_ip ? ` from ${doc.signer_ip}` : ""}</dd></div>}
          </dl>
          <div className="flex flex-wrap gap-2">
            {doc.status === "signed" && doc.signed_path && (
              <Button onClick={() => open(doc.signed_path!)} disabled={busy !== null}><Download className="mr-2 h-4 w-4" /> Download signed PDF</Button>
            )}
            <Button variant="outline" onClick={() => open(doc.original_path)} disabled={busy !== null}>
              <Download className="mr-2 h-4 w-4" /> Original PDF
            </Button>
            {isOpen && (
              <Button onClick={send} disabled={busy !== null}>
                {busy === "send" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {doc.status === "sent" ? "Send reminder" : "Send for signature"}
              </Button>
            )}
            {isOpen && (
              <Button variant="outline" onClick={withdraw} disabled={busy !== null}><Ban className="mr-2 h-4 w-4" /> Withdraw</Button>
            )}
            {doc.status !== "sent" && (
              <Button variant="ghost" className="text-destructive" onClick={remove} disabled={busy !== null}><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SignDocumentPage() {
  return (
    <SignAuthGate>
      <Detail />
    </SignAuthGate>
  );
}
