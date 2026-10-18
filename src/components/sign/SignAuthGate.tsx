import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { FileSignature, Loader2, LogOut } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { OWNER_EMAIL } from "@/lib/sign/db";

/** Locks the owner screens behind a magic link sent to the owner address. RLS and the edge functions enforce the same rule. */
export function SignAuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    return () => sub.subscription.unsubscribe();
  }, []);

  const email = session?.user.email?.toLowerCase();
  const isOwner = email === OWNER_EMAIL;

  useEffect(() => {
    if (session && !isOwner) {
      supabase.auth.signOut();
      setError("That account is not allowed to use document signing.");
    }
  }, [session, isOwner]);

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session || !isOwner) {
    const sendLink = async () => {
      setSending(true);
      setError(null);
      const { error: err } = await supabase.auth.signInWithOtp({
        email: OWNER_EMAIL,
        options: { emailRedirectTo: `${window.location.origin}/sign` },
      });
      setSending(false);
      if (err) setError(err.message);
      else setSent(true);
    };
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <FileSignature className="mb-2 h-8 w-8" />
            <CardTitle>Document signing</CardTitle>
            <CardDescription>Sign in with a one-time link. No password.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={OWNER_EMAIL} readOnly aria-label="Email" />
            {sent ? (
              <p className="text-sm text-muted-foreground">Check {OWNER_EMAIL} for your login link. You can close this tab.</p>
            ) : (
              <Button className="w-full" onClick={sendLink} disabled={sending}>
                {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Email me a login link
              </Button>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm ${isActive ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link to="/sign" className="flex items-center gap-2 font-semibold">
              <FileSignature className="h-5 w-5" /> Sign
            </Link>
            <NavLink to="/sign" end className={linkClass}>Documents</NavLink>
            <NavLink to="/sign/new" className={linkClass}>New document</NavLink>
          </div>
          <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
