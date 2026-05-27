// Day-one telemetry for the Proprietary vs Classic mode comparison.
// Writes are fire-and-forget. Never block the UI on these.

import { supabase } from "@/integrations/supabase/client";

export type ProprietaryEventType =
  | "extract_started"
  | "extract_completed"
  | "unit_saved"
  | "unit_rejected_below_floor"
  | "interview_complete_signal"
  | "knowledge_reuse_toggle"
  | "mode_selected";

export async function logProprietaryEvent(
  eventType: ProprietaryEventType,
  payload: Record<string, unknown> = {},
  opts: { articleId?: string | null; mode?: "classic" | "proprietary" } = {}
) {
  try {
    await supabase.from("proprietary_analytics_events").insert({
      article_id: opts.articleId ?? null,
      mode: opts.mode ?? "proprietary",
      event_type: eventType,
      payload: payload as any,
    } as any);
  } catch (err) {
    // Telemetry must never break the app.
    console.warn("logProprietaryEvent failed", err);
  }
}
