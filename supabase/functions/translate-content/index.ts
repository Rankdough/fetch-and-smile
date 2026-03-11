import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseField(response: string, field: string, nextField?: string): string {
  const startMarker = `===${field}===`;
  const startIdx = response.indexOf(startMarker);
  if (startIdx === -1) return "";
  const afterMarker = startIdx + startMarker.length;
  let endIdx = response.length;
  if (nextField) {
    const nextMarker = `===${nextField}===`;
    const nextIdx = response.indexOf(nextMarker, afterMarker);
    if (nextIdx !== -1) endIdx = nextIdx;
  }
  return response.substring(afterMarker, endIdx).trim();
}

async function translateToLanguage(
  apiKey: string,
  fields: { title: string; subtitle: string; seoTitle: string; seoDescription: string; content: string },
  language: string
): Promise<{ title: string; subtitle: string; seoTitle: string; seoDescription: string; content: string }> {
  const prompt = `Translate ALL of the following fields into ${language}. 
For the CONTENT field, this is Markdown. Translate ONLY the visible text. Keep all Markdown formatting (##, **, >, -, |, [text](url)) exactly as is. Do NOT change URLs.

Return your response using these EXACT delimiters:

===TITLE===
${fields.title}
===SUBTITLE===
${fields.subtitle}
===SEO_TITLE===
${fields.seoTitle}
===SEO_DESCRIPTION===
${fields.seoDescription}
===CONTENT===
${fields.content}`;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: `You are a professional translator. Translate to ${language}. For Markdown content, translate ONLY visible text while preserving all Markdown formatting, links, and structure exactly.` },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    console.error(`Translation to ${language} failed:`, response.status);
    return { title: "", subtitle: "", seoTitle: "", seoDescription: "", content: "" };
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "";

  let translatedContent = parseField(text, "CONTENT");
  translatedContent = translatedContent.replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  return {
    title: parseField(text, "TITLE", "SUBTITLE"),
    subtitle: parseField(text, "SUBTITLE", "SEO_TITLE"),
    seoTitle: parseField(text, "SEO_TITLE", "SEO_DESCRIPTION"),
    seoDescription: parseField(text, "SEO_DESCRIPTION", "CONTENT"),
    content: translatedContent,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, subtitle, seoTitle, seoDescription, content } = await req.json();

    if (!content) {
      return new Response(
        JSON.stringify({ error: "Content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const fields = { title: title || "", subtitle: subtitle || "", seoTitle: seoTitle || "", seoDescription: seoDescription || "", content };

    // Translate to NL and DE in parallel
    const [nlResult, deResult] = await Promise.all([
      translateToLanguage(LOVABLE_API_KEY, fields, "Dutch (NL)"),
      translateToLanguage(LOVABLE_API_KEY, fields, "German (DE)"),
    ]);

    return new Response(
      JSON.stringify({ nl: nlResult, de: deResult }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Translation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to translate";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
