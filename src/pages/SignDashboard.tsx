import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FilePlus2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SignAuthGate } from "@/components/sign/SignAuthGate";
import { STATUS_LABEL, STATUS_VARIANT, formatDay, signDb, type SignDocument } from "@/lib/sign/db";

function Dashboard() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<SignDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    signDb
      .from("sign_documents")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setDocs(data as SignDocument[]);
      });
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <Button asChild>
          <Link to="/sign/new"><FilePlus2 className="mr-2 h-4 w-4" /> New document</Link>
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          {error && <p className="p-6 text-sm text-destructive">{error}</p>}
          {!error && !docs && (
            <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          )}
          {docs && docs.length === 0 && (
            <p className="p-10 text-center text-sm text-muted-foreground">No documents yet. Drop a PDF on “New document” to start.</p>
          )}
          {docs && docs.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((d) => (
                  <TableRow key={d.id} className="cursor-pointer" onClick={() => navigate(`/sign/${d.id}`)}>
                    <TableCell className="font-medium">{d.title}</TableCell>
                    <TableCell>{d.recipient_name ? `${d.recipient_name} (${d.recipient_email})` : "-"}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[d.status]}>{STATUS_LABEL[d.status]}</Badge></TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDay(d.signed_at ?? d.sent_at ?? d.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SignDashboard() {
  return (
    <SignAuthGate>
      <Dashboard />
    </SignAuthGate>
  );
}
