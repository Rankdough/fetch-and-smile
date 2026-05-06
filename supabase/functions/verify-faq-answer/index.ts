import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { title, body, targetWordCount } = await req.json() as { title: string; body: string; targetWordCount?: number };
    if (!title || !body) {
      return new Response(JSON.stringify({ error: "title and body required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const plain = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const wordCount = plain.split(/\s+/).filter(Boolean).length;
    const truncated = plain.slice(0, 6000);

    const sys = `You are a strict QA reviewer for FAQ articles. Given the TITLE (a question) and the BODY text, identify problems.

Check:
1. Does the body DIRECTLY answer the title question? (yes/no)
2. Is the answer factually plausible (no obvious contradictions or hallucinations)?
3. Is there an early, AI-quotable, direct answer near the top (first paragraph or TL;DR)?
4. Are there structural problems (cut off mid-sentence, empty sections, repeated content, off-topic drift)?
5. Word count: target ~${targetWordCount || 500}, actual ${wordCount}. Flag if >40% off target.

Return STRICT JSON only:
{"status":"ok"|"warning"|"error","answersTitle":true|false,"issues":["short issue 1","short issue 2"]}

- "ok": no meaningful issues
- "warning": minor issues (slightly off word count, weak intro)
- "error": doesn't answer the question, hallucination, cut off, off-topic
- Keep each issue under 15 words.`;

    const user = `TITLE: ${title}\n\nBODY (${wordCount} words):\n${truncated}`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: `AI gateway error: ${resp.status} ${t}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch {
      const m = content.match(/\{[\s\S]*\}/); if (m) parsed = JSON.parse(m[0]);
    }
    const status = ["ok","warning","error"].includes(parsed.status) ? parsed.status : "warning";
    const issues = Array.isArray(parsed.issues) ? parsed.issues.map((s: any) => String(s).slice(0, 200)) : [];
    return new Response(JSON.stringify({
      status,
      answersTitle: parsed.answersTitle !== false,
      issues,
      wordCount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
