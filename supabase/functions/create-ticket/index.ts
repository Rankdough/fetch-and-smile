// Edge function: create-ticket
// Proxy for the Rankdough Chrome extension. Keeps ticket-system credentials server-side.
//   GET  -> list projects
//   POST -> create a ticket from page content
// Auth: extension sends x-extension-secret, matched against EXTENSION_SHARED_SECRET.
// Env: EXTENSION_SHARED_SECRET, TICKETS_API_URL, TICKETS_API_TOKEN
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
      const title = String(b.title ?? "").trim().slice(0, 300);
      const projectId = String(b.project_id ?? "").trim();
      if (!title || !projectId) return json({ error: "title and project_id are required" }, 400);

      const payload: Record<string, unknown> = {
        project_id: projectId,
        title,
        description: String(b.description ?? "").slice(0, MAX_DESCRIPTION),
      };
      if (PRIORITIES.includes(b.priority)) payload.priority = b.priority;
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
