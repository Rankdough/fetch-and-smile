import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export const OWNER_EMAIL = "info@rankdough.com";
export const SIGN_BUCKET = "sign-docs";
export const MAX_PDF_BYTES = 25 * 1024 * 1024;

// integrations/supabase/types.ts is generated and does not know the sign_* tables yet.
export const signDb = supabase as unknown as SupabaseClient;

export type SignStatus = "draft" | "sent" | "signed" | "void";
export type FieldParty = "owner" | "recipient";
export type FieldKind = "signature" | "date";

export interface SignDocument {
  id: string;
  title: string;
  status: SignStatus;
  original_path: string;
  original_sha256: string;
  page_count: number;
  recipient_name: string | null;
  recipient_email: string | null;
  message: string | null;
  signed_path: string | null;
  signer_ip: string | null;
  sent_at: string | null;
  expires_at: string | null;
  signed_at: string | null;
  created_at: string;
}

export interface SignFieldRow {
  id: string;
  party: FieldParty;
  kind: FieldKind;
  page: number; // 1-based
  x: number; // fractions of the page, origin top-left
  y: number;
  w: number;
  h: number;
  value: string | null;
}

export const STATUS_LABEL: Record<SignStatus, string> = {
  draft: "Draft",
  sent: "Awaiting signature",
  signed: "Signed",
  void: "Withdrawn",
};

export const STATUS_VARIANT: Record<SignStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  sent: "secondary",
  signed: "default",
  void: "destructive",
};

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function formatDay(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Pulls the message out of a failed edge function call. */
export async function functionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    } catch {
      /* fall through */
    }
  }
  return error instanceof Error ? error.message : "Request failed";
}

export async function openStoredFile(path: string): Promise<void> {
  const { data, error } = await signDb.storage.from(SIGN_BUCKET).createSignedUrl(path, 120);
  if (error || !data) throw error ?? new Error("Could not open file");
  window.open(data.signedUrl, "_blank", "noopener");
}
