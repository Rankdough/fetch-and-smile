import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { cluster } = await req.json();

    if (!cluster || !cluster.keywords || cluster.keywords.length === 0) {
      return new Response(JSON.stringify({ error: "Please provide a cluster with keywords" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const sample = cluster.keywords.slice(0, 30).join(", ");
    const more = cluster.keywords.length > 30 ? ` (+${cluster.keywords.length - 30} more)` : "";

    const systemPrompt = `You are an expert SEO strategist specializing in ecommerce and collection/landing page architecture.

Given a topic silo with its keywords, generate landing page (collection page) ideas. These are NOT blog posts — they are commercial/transactional pages like category pages, product collection pages, comparison landing pages, or service pages.

OUTPUT ONLY valid JSON, no markdown fences.

JSON FORMAT:
{"landing_pages":[{"title":"Page Title","description":"1-sentence description of this page's purpose","target_keywords":["keyword1","keyword2","keyword3"]}]}

RULES:
- Generate 3-7 landing page ideas depending on keyword diversity
- Each page title should be a clear, commercial page name (e.g. "Men's Running Shoes", "Track Spikes Collection", "Cross Country Gear Guide")
- target_keywords: 2-8 keywords from the cluster that this page should target
- Each keyword should be assigned to AT MOST ONE landing page
- Focus on keywords with commercial/transactional intent — skip purely informational/question keywords
- Think like an ecommerce site architect: what collection or category pages would capture this search traffic?`;

    const userPrompt = `Generate landing/collection page ideas for this silo:

Topic: "${cluster.topic}" (${cluster.keywords.length} keywords, ~${cluster.estimated_monthly_volume} monthly volume)
Keywords: ${sample}${more}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    let parsed: { landing_pages: any[] };
    try {
      let cleaned = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
      parsed = JSON.parse(cleaned);
    } catch {
      try {
        const m = content.match(/\{[\s\S]*\}/);
        if (!m) throw new Error("No JSON");
        parsed = JSON.parse(m[0]);
      } catch {
        console.error("Parse failed:", content.slice(0, 500));
        throw new Error("Failed to parse landing page results");
      }
    }

    console.log(`Generated ${parsed.landing_pages?.length || 0} landing pages for "${cluster.topic}"`);

    return new Response(JSON.stringify({ landing_pages: parsed.landing_pages || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-landing-pages error:", e);
    const status = e.status || 500;
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
