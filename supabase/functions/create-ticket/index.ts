// Edge function: create-ticket
// Proxy for the Rankdough Chrome extension. Keeps ticket-system credentials server-side.
//   GET                      -> list projects
//   POST {action:"suggest"}  -> AI guess of every ticket field from page content
//   POST (default)           -> create a ticket; description is composed in the dashboard format
// Auth: extension sends x-extension-secret, matched against EXTENSION_SHARED_SECRET.
// Env: EXTENSION_SHARED_SECRET, TICKETS_API_URL, TICKETS_API_TOKEN, LOVABLE_API_KEY (suggest only)
// ASSUMPTION: the ticket API exposes GET {TICKETS_API_URL}/projects and POST {TICKETS_API_URL}/tasks
// with the same fields as the Rankdough create_task tool. Adjust the two fetch calls if it differs.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-extension-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const PRIORITIES = ["low", "medium", "high", "urgent"];
const MAX_DESCRIPTION = 20000;


const STATUSES = ["not_started", "in_progress", "on_hold", "completed"];
const STATUS_LABEL: Record<string, string> = {
  not_started: "Not done", in_progress: "In progress", on_hold: "On hold", completed: "Done",
};
const PRIORITY_LABEL: Record<string, string> = {
  low: "Low", medium: "Medium", high: "High", urgent: "Critical",
};
const EFFORT_LABEL: Record<number, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

// Mirrors the ticket layout used by the audit dashboard.
function composeDescription(b: Record<string, unknown>, priority?: string, status?: string, effort?: number) {
  const head = [
    ["ID", clip(b.ticket_id, 40) || "-"],
    ["Checklist ref", clip(b.checklist_ref, 60) || "-"],
    ["Month", clip(b.month, 40) || "-"],
    ["Status", STATUS_LABEL[status ?? "not_started"]],
    ["Priority", priority ? PRIORITY_LABEL[priority] : "-"],
    ["Effort", effort ? EFFORT_LABEL[effort] : "-"],
    ["Team", clip(b.team, 60) || "-"],
    ["Tag", clip(b.tag, 60) || "-"],
    ["Type", clip(b.type, 60) || "-"],
    ["Section", clip(b.section, 200) || "-"],
  ].map(([k, v]) => `${k}: ${v}`).join("\n");
  const block = (label: string, v: unknown) => (clip(v, 8000) ? `\n\n${label}\n${clip(v, 8000)}` : "");
  return (
    head +
    block("FINDING", b.whats_wrong) +
    block("WHY IT MATTERS", b.why_it_matters) +
    block("WHAT WE'LL DO", b.what_well_do) +
    block("HOW TO DO IT, IN DETAIL", b.detail) +
    block("EVIDENCE AND EXAMPLES", b.evidence)
  ).slice(0, MAX_DESCRIPTION);
}

async function suggest(b: Record<string, unknown>) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `You turn web page content into a work ticket for an SEO agency (Rankdough). Return ONLY valid JSON, no markdown:
{"title":"short imperative title","priority":"low|medium|high|urgent","effort":1|2|3,"team":"Client|Rankdough","tag":"Content|Technical|Links|Analytics|Design|Other","type":"Fix|Build|Research|Review","section":"short area name","whats_wrong":"one or two plain sentences","why_it_matters":"one or two plain sentences","what_well_do":"numbered steps, each starting with the owner","detail":"numbered steps","evidence":"facts quoted from the page, with the URL"}
Effort: 1 easy, 2 medium, 3 hard. Use British English. Short sentences. Only use facts present in the page content. If a field cannot be inferred, return an empty string. Never invent numbers.`,
        },
        {
          role: "user",
          content: `URL: ${clip(b.url, 500)}\nPage title: ${clip(b.page_title, 300)}\nContent:\n${clip(b.text, 6000)}`,
        },
      ],
    }),
  });
  if (!r.ok) throw new Error(`AI gateway ${r.status}`);
  const raw = (await r.json()).choices?.[0]?.message?.content ?? "";
  const match = String(raw).match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON in AI response");
  return JSON.parse(match[0]);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secret = Deno.env.get("EXTENSION_SHARED_SECRET");
  const apiUrl = Deno.env.get("TICKETS_API_URL")?.replace(/\/$/, "");
  const apiToken = Deno.env.get("TICKETS_API_TOKEN");
  if (!secret || !apiUrl || !apiToken) return json({ error: "Server not configured" }, 500);

  const provided = req.headers.get("x-extension-secret") ?? "";
  if (!timingSafeEqual(provided, secret)) return json({ error: "Unauthorised" }, 401);

  const upstreamHeaders = {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };

  try {
    if (req.method === "GET") {
      const r = await fetch(`${apiUrl}/projects`, { headers: upstreamHeaders });
      if (!r.ok) return json({ error: `Upstream ${r.status}` }, 502);
      const projects = await r.json();
      return json({ projects });
    }

    if (req.method === "POST") {
      const b = await req.json();

      if (b.action === "suggest") return json({ suggestion: await suggest(b) });

      const title = clip(b.title, 300);
      const projectId = clip(b.project_id, 100);
      if (!title || !projectId) return json({ error: "title and project_id are required" }, 400);

      const priority = PRIORITIES.includes(b.priority) ? b.priority : undefined;
      const status = STATUSES.includes(b.status) ? b.status : "not_started";
      const effort = [1, 2, 3].includes(Number(b.effort)) ? Number(b.effort) : undefined;

      const payload: Record<string, unknown> = {
        project_id: projectId,
        title,
        status,
        description: composeDescription(b, priority, status, effort),
      };
      if (priority) payload.priority = priority;
      if (effort) payload.effort = effort;
      if (clip(b.team, 60)) payload.team = clip(b.team, 60);
      if (/^\d{4}-\d{2}-\d{2}$/.test(b.due_date ?? "")) payload.due_date = b.due_date;

      const r = await fetch(`${apiUrl}/tasks`, {
        method: "POST",
        headers: upstreamHeaders,
        body: JSON.stringify(payload),
      });
      if (!r.ok) return json({ error: `Upstream ${r.status}` }, 502);
      return json({ ok: true, task: await r.json() });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
